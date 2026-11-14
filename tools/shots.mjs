// Deterministic stills of the cell (views x cycle times), then fps with HQ on/off, __hqStats,
// pc.renderInfo() and pc.checks(). Exits 1 on any console or page error.
// Usage: node tools/shots.mjs [--quick] [--view iso,top] [--t 2.5,12,30] [--solo NAME] [--cad]
//          [--size 1600x900] [--hq on|off] [--out DIR] [--tag STR] [--root DIR] [--port N] [--headed]
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { REPO, parseFlags, startSession, openCell, frames, settleQuality, measureFps, reportFatal } from "./lib/browser.mjs";

const flags = parseFlags({
  quick: { type: "bool", help: "first two views at the first time only; no fps or checks" },
  view: { type: "list", help: "views to shoot (default: every key of window.pcViews)" },
  t: { type: "nums", default: [2.5, 12, 30], help: "cycle times in seconds", shown: " (default 2.5,12,30)" },
  solo: { type: "string", help: "show one module only (?solo=NAME)" },
  cad: { type: "bool", help: "load the CAD robots (default adds ?cad=0)" },
  size: { type: "size", default: "1600x900", help: "viewport" },
  hq: { type: "onoff", default: true, help: "HQ rendering", shown: " (default on)" },
  settle: { type: "int", default: 1200, help: "ms to wait after setView (0.8 s camera flight)" },
  out: { type: "string", default: join(REPO, "_shots/latest"), help: "output folder; old PNGs in it are deleted" },
  tag: { type: "string", default: "", help: "file name prefix" },
}, "node tools/shots.mjs [flags]");

const tName = (t) => (Number.isInteger(t * 10) ? t.toFixed(1) : String(t));
let s, errors = null;
try {
  const out = resolve(flags.out);
  s = await startSession(flags, flags.size);
  const p = await s.newPage(flags.size);
  const { page } = p;
  errors = p.errors;
  const url = s.url({ cad: flags.cad, solo: flags.solo });
  const t0 = Date.now();
  await openCell(page, url, errors);
  console.log(`page ${url} ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const info = await page.evaluate(() => ({
    views: window.pcViews ? Object.keys(window.pcViews) : Array.isArray(window.pc?.views) ? window.pc.views : [],
    duration: window.pc?.DURATION,
    missing: ["pause", "seek", "setView"].filter((k) => typeof window.pc?.[k] !== "function"),
  }));
  if (info.missing.length) throw new Error(`window.pc is missing ${info.missing.join(", ")}`);
  if (!info.views.length) throw new Error("window.pcViews is missing or empty");
  let views = flags.view || info.views;
  const unknown = views.filter((v) => !info.views.includes(v));
  if (unknown.length) throw new Error(`unknown view(s) ${unknown.join(", ")}; window.pcViews has ${info.views.join(", ")}`);
  let times = flags.t;
  if (flags.quick) { views = views.slice(0, 2); times = times.slice(0, 1); }
  if (!views.length || !times.length) throw new Error("nothing to shoot (no views or no times)");
  for (const t of times) {
    if (Number.isFinite(info.duration) && (t < 0 || t > info.duration)) console.warn(`warning: t=${t} is outside 0..${info.duration.toFixed(2)} s`);
  }

  const hqCtl = await settleQuality(page, flags.hq);
  console.log(`HQ ${hqCtl ? (flags.hq ? "on" : "off") : "n/a (no window.setQuality)"}; ${views.length} views x ${times.length} times`);

  // old PNGs go only once the page is known to work
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) if (f.endsWith(".png")) rmSync(join(out, f), { force: true });
  for (const v of views) {
    for (const t of times) {
      await page.evaluate(({ v, t }) => {
        window.pc.pause();
        window.pc.seek(t);
        window.pc.setView(v);
      }, { v, t });
      // the flight advances by at most 0.1 s per frame, so slow (software) frames need >= 10 of them
      await Promise.all([page.waitForTimeout(flags.settle), frames(page, 10)]);
      await frames(page, 2);
      const file = join(out, `${flags.tag}${v}_${tName(t)}.png`);
      await page.screenshot({ path: file, animations: "disabled" }); // CSS transitions jump to their end state
      console.log(file);
    }
  }

  if (!flags.quick) {
    const home = info.views.includes("iso") ? "iso" : info.views[0];
    let capped = !flags.uncapped;
    for (const on of hqCtl ? [true, false] : [null]) {
      await page.evaluate(({ on, home }) => {
        if (on !== null) window.setQuality(on);
        if (home) window.pc.setView(home);
        window.pc.play?.();
      }, { on, home });
      await page.waitForTimeout(900);
      const r = await measureFps(page, 3000);
      const label = on === null ? "fps" : on ? "fps HQ" : "fps noHQ";
      console.log(`${label} ${r.fps.toFixed(1)}  (frame avg ${r.avgMs.toFixed(1)} ms, p95 ${r.p95Ms.toFixed(1)} ms, max ${r.maxMs.toFixed(1)} ms)`);
      capped &&= r.fps > 58;
    }
    if (capped) console.log("(fps is held at the 60 Hz frame clock; --uncapped measures the headroom)");
    const extra = await page.evaluate(async () => {
      const pc = window.pc;
      const o = { hqStats: window.__hqStats ?? null };
      if (typeof pc.renderInfo === "function") {
        try { o.renderInfo = pc.renderInfo(); } catch (e) { o.renderInfoError = String(e); }
      }
      if (typeof pc.checks === "function") {
        try { o.checks = await pc.checks(); } catch (e) { o.checksError = String((e && e.stack) || e); }
      }
      return o;
    });
    console.log(`hqStats ${JSON.stringify(extra.hqStats)}`);
    if ("renderInfo" in extra) console.log(`renderInfo ${JSON.stringify(extra.renderInfo)}`);
    if ("checks" in extra) console.log(`checks ${JSON.stringify(extra.checks, null, 2)}`);
    if (extra.renderInfoError) errors.push(`pc.renderInfo() threw: ${extra.renderInfoError}`);
    if (extra.checksError) errors.push(`pc.checks() threw: ${extra.checksError}`);
    if (extra.checks && extra.checks.ok === false) errors.push("pc.checks() returned ok: false");
  }
} catch (e) {
  reportFatal(e);
} finally {
  await s?.close();
}

if (errors) {
  if (errors.length) {
    console.error(`console errors: ${errors.length}`);
    for (const e of errors) console.error(`  ${e}`);
    process.exitCode = 1;
  } else {
    console.log("console errors: 0");
  }
}
