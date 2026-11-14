// Per-module draw-call and triangle report against budgets. Each module is loaded alone
// (?solo=NAME&cad=0), paused at --t, and read with window.pc.renderInfo() after --wait ms; then the
// full scene. GL-level counts (every WebGL draw in a frame, incl. shadow and post passes) are shown
// alongside, and replace renderInfo when the page has none.
// Usage: node tools/stats.mjs [--solo bowls,dial] [--t 12] [--budget] [--size 1600x900] [--root DIR] [--port N]
import { parseFlags, startSession, openCell, frames, settleQuality, reportFatal } from "./lib/browser.mjs";

// draw-call budgets per module (renderInfo().calls)
const BUDGETS = { bowls: 120, dial: 80, hall: 150, frame: 160, product: 60, outfeed: 40, delta: 60, scara: 40 };

const flags = parseFlags({
  solo: { type: "list", help: "modules to measure (default: window.pc.modules)" },
  t: { type: "num", default: 12, help: "cycle time to pause at, seconds" },
  wait: { type: "int", default: 1000, help: "ms to wait after pcReady before reading" },
  budget: { type: "bool", help: "exit 1 when a module is over its draw-call budget" },
  cad: { type: "bool", help: "load the CAD robots (default adds ?cad=0)" },
  hq: { type: "onoff", help: "force HQ on|off (default: the page's own choice)" },
  size: { type: "size", default: "1600x900", help: "viewport" },
}, "node tools/stats.mjs [flags]");

async function measure(page) {
  await page.evaluate((t) => {
    window.pc?.pause?.();
    window.pc?.seek?.(t);
  }, flags.t);
  if (flags.hq !== undefined) await settleQuality(page, flags.hq);
  await page.waitForTimeout(flags.wait);
  await frames(page, 4);
  return page.evaluate(() => {
    const pc = window.pc || {};
    const o = { ri: null, gl: null };
    if (typeof pc.renderInfo === "function") {
      try { o.ri = pc.renderInfo(); } catch (e) { o.riError = String(e); }
    }
    const c = window.__glCounter;
    if (c) {
      const drawn = c.history.slice(-10).filter((f) => f.calls > 0);
      const pick = drawn.length ? drawn : c.last ? [c.last] : [];
      if (pick.length) o.gl = { calls: Math.max(...pick.map((f) => f.calls)), triangles: Math.max(...pick.map((f) => f.triangles)) };
    }
    return o;
  });
}

const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "-");
let s, errors = null, over = [];
try {
  s = await startSession(flags, flags.size);
  const p = await s.newPage(flags.size, { glCounter: true });
  const { page } = p;
  errors = p.errors;

  // full scene first: it also tells which modules exist
  await openCell(page, s.url({ cad: flags.cad }), errors);
  const meta = await page.evaluate(() => ({
    modules: Array.isArray(window.pc?.modules) ? [...window.pc.modules] : null,
    renderInfo: typeof window.pc?.renderInfo === "function",
  }));
  const full = await measure(page);
  if (!meta.modules && !flags.solo) console.log("window.pc.modules is missing: no per-module rows, full scene only");
  if (!meta.renderInfo) console.log("window.pc.renderInfo() is missing: calls and triangles are GL-level counts");
  if (meta.modules && flags.solo) {
    const unknown = flags.solo.filter((n) => !meta.modules.includes(n));
    if (unknown.length) throw new Error(`unknown module(s) ${unknown.join(", ")}; window.pc.modules has ${meta.modules.join(", ")}`);
  }

  const rows = [];
  for (const name of flags.solo || meta.modules || []) {
    await openCell(page, s.url({ cad: flags.cad, solo: name }), errors);
    rows.push({ name, ...(await measure(page)) });
  }
  const mods = rows.slice();
  if (mods.length > 1) {
    const add = (k, f) => mods.reduce((a, r) => a + (r[k]?.[f] ?? 0), 0);
    rows.push({ name: "sum of modules", ri: meta.renderInfo ? { calls: add("ri", "calls"), triangles: add("ri", "triangles") } : null, gl: { calls: add("gl", "calls"), triangles: add("gl", "triangles") }, sum: true });
  }
  rows.push({ name: "full scene", ...full, full: true });

  // table
  const head = ["module", "calls", "triangles", "budget", "status"];
  if (meta.renderInfo) head.push("gl calls", "gl triangles");
  const lines = rows.map((r) => {
    const main = meta.renderInfo ? r.ri : r.gl;
    const budget = r.sum || r.full ? undefined : BUDGETS[r.name];
    let status = "";
    if (r.riError) status = "renderInfo threw";
    else if (budget !== undefined && main) {
      status = main.calls > budget ? `OVER +${main.calls - budget}` : "ok";
      if (main.calls > budget) over.push(`${r.name} ${main.calls} > ${budget}`);
    }
    const cols = [r.name, fmt(main?.calls), fmt(main?.triangles), budget ?? "-", status];
    if (meta.renderInfo) cols.push(fmt(r.gl?.calls), fmt(r.gl?.triangles));
    return cols.map(String);
  });
  const w = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const row = (cols) => cols.map((c, i) => (i === 0 || i === 4 ? c.padEnd(w[i]) : c.padStart(w[i]))).join("  ").trimEnd();
  console.log(`\nt = ${flags.t} s, ${flags.size.width}x${flags.size.height}${flags.hq === undefined ? "" : `, HQ ${flags.hq ? "on" : "off"}`}`);
  console.log(row(head));
  console.log(w.map((n) => "-".repeat(n)).join("  "));
  for (const l of lines) console.log(row(l));
  if (full.ri && (full.ri.geometries !== undefined || full.ri.textures !== undefined)) {
    console.log(`full scene memory: ${fmt(full.ri.geometries)} geometries, ${fmt(full.ri.textures)} textures`);
  }
  for (const r of mods) {
    const a = meta.renderInfo ? r.ri : r.gl, b = meta.renderInfo ? full.ri : full.gl;
    if (a && b && a.calls === b.calls && a.triangles === b.triangles) console.warn(`warning: solo=${r.name} counts equal the full scene (is ?solo= handled?)`);
  }
  for (const r of rows) if (r.riError) errors.push(`pc.renderInfo() threw on ${r.name}: ${r.riError}`);
  if (over.length) console.log(`over budget: ${over.join(", ")}`);
  else if (mods.some((r) => BUDGETS[r.name] !== undefined)) console.log("all modules within budget");
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
if (flags.budget && over.length) process.exitCode = 1;
