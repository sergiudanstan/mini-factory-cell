// Deterministic film: for each frame k, pc.pause(), pc.seek(from + k/fps), pc.setCamera(pos, target),
// two animation frames, then a JPEG of the 3D canvas; ffmpeg (x264, CRF 17) and an ffprobe summary.
// Usage: node tools/record.mjs [--shots FILE.json] [--fps 30] [--size 1920x1080] [--from T] [--to T]
//          [--out FILE.mp4] [--ui] [--audio FILE.wav] [--keep-frames] [--root DIR] [--port N] [--headed]
// Shot list (times in seconds of cycle time, positions in three.js scene coordinates):
//   [{ "t0": 0, "t1": 6, "view": "iso", "label": "intro",
//      "cam": { "from": [x,y,z], "to": [x,y,z], "target0": [x,y,z], "target1": [x,y,z] } }]
// The camera moves from -> to and target0 -> target1 with smoothstep over t0..t1; "view" (a key of
// window.pcViews) fills a missing from/target0, a missing to/target1 holds still. Between and after
// shots the last shot's end pose is held. Without --shots: one orbit of the 'iso' view per cycle.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { REPO, parseFlags, startSession, openCell, frames, settleQuality, reportFatal } from "./lib/browser.mjs";

const flags = parseFlags({
  shots: { type: "string", help: "shot list JSON (default: an orbit of the 'iso' view)" },
  fps: { type: "int", default: 30, help: "frames per second" },
  size: { type: "size", default: "1920x1080", help: "film size (the 3D canvas, or the page with --ui)" },
  from: { type: "num", help: "first cycle time, seconds (default 0, or the first shot's t0)" },
  to: { type: "num", help: "end cycle time, exclusive (default DURATION, or the last shot's t1)" },
  out: { type: "string", default: join(REPO, "_frames/film.mp4"), help: "output mp4" },
  "canvas-only": { type: "bool", default: true, help: "capture only the 3D canvas, overlays hidden (default)" },
  ui: { type: "bool", help: "capture the whole page, UI included" },
  canvas: { type: "string", default: "#viewport canvas.main", help: "3D canvas selector" },
  audio: { type: "string", help: "WAV/audio track to mux (aac 192k, -shortest)" },
  hq: { type: "onoff", default: true, help: "HQ rendering", shown: " (default on)" },
  cad: { type: "bool", help: "load the CAD robots (default adds ?cad=0)" },
  solo: { type: "string", help: "show one module only (?solo=NAME)" },
  quality: { type: "int", default: 92, help: "JPEG quality of the frames" },
  "keep-frames": { type: "bool", help: "keep _frames/f_*.jpg after encoding" },
}, "node tools/record.mjs [flags]");

const FRAMES = join(REPO, "_frames");
const canvasOnly = flags.canvasOnly && !flags.ui;
const lerp3 = (a, b, e) => a.map((v, i) => v + (b[i] - v) * e);
const fmtDur = (s) => (s >= 60 ? `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s` : `${Math.round(s)}s`);

// shot list -> camera plan; throws with the shot index on bad input
function shotPlan(list, views) {
  if (!Array.isArray(list) || !list.length) throw new Error("the shot list must be a non-empty JSON array");
  const vec = (v, what) => {
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) throw new Error(`${what} must be [x, y, z]`);
    return v;
  };
  return list.map((s, i) => {
    const at = `shot ${i + 1}${s && s.label ? ` "${s.label}"` : ""}`;
    if (!s || typeof s !== "object") throw new Error(`${at}: not an object`);
    for (const k of Object.keys(s)) if (!["t0", "t1", "view", "cam", "label"].includes(k)) console.warn(`warning: ${at}: unknown key "${k}"`);
    for (const k of Object.keys(s.cam || {})) if (!["from", "to", "target0", "target1"].includes(k)) console.warn(`warning: ${at}: unknown cam key "${k}"`);
    if (!Number.isFinite(s.t0) || !Number.isFinite(s.t1) || s.t1 <= s.t0) throw new Error(`${at}: needs numbers t0 < t1`);
    let v;
    if (s.view !== undefined) {
      v = views[s.view];
      if (!v) throw new Error(`${at}: unknown view "${s.view}" (window.pcViews has ${Object.keys(views).join(", ")})`);
    }
    const c = s.cam || {};
    const from = vec(c.from, `${at}: cam.from`) ?? v?.pos;
    const target0 = vec(c.target0, `${at}: cam.target0`) ?? v?.target;
    if (!from || !target0) throw new Error(`${at}: needs "view" or cam.from and cam.target0`);
    return {
      n: i + 1, t0: s.t0, t1: s.t1, label: s.label ?? s.view ?? "",
      from, to: vec(c.to, `${at}: cam.to`) ?? from,
      target0, target1: vec(c.target1, `${at}: cam.target1`) ?? target0,
    };
  }).sort((a, b) => a.t0 - b.t0);
}

function camAt(plan, t) {
  let s = plan[0];
  for (const x of plan) if (x.t0 <= t) s = x;
  const u = Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0)));
  const e = u * u * (3 - 2 * u);
  return { shot: s, pos: lerp3(s.from, s.to, e), target: lerp3(s.target0, s.target1, e) };
}

function orbit(view, duration) {
  const [px, py, pz] = view.pos, target = view.target;
  const r = Math.hypot(px - target[0], pz - target[2]), a0 = Math.atan2(pz - target[2], px - target[0]);
  return (t) => {
    const a = a0 + (2 * Math.PI * t) / duration;
    return { pos: [target[0] + r * Math.cos(a), py, target[2] + r * Math.sin(a)], target };
  };
}

// Grows/shrinks the page until the canvas is exactly want.width x want.height; returns its clip rect.
async function fitCanvas(page, sel, want) {
  for (let i = 0; i < 8; i++) {
    const r = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, vw: innerWidth, vh: innerHeight };
    }, sel);
    if (!r) throw new Error(`no element matches "${sel}" (pass --canvas SEL, or --ui)`);
    if (Math.abs(r.w - want.width) < 0.5 && Math.abs(r.h - want.height) < 0.5) {
      return { clip: { x: r.x, y: r.y, width: want.width, height: want.height }, page: { width: r.vw, height: r.vh } };
    }
    const vw = Math.round(r.vw + want.width - r.w), vh = Math.round(r.vh + want.height - r.h);
    if (vw < 64 || vh < 64 || vw > 8192 || vh > 8192) break;
    await page.setViewportSize({ width: vw, height: vh });
    await page.waitForTimeout(150);
    await frames(page, 3);
  }
  throw new Error(`could not size "${sel}" to ${want.width}x${want.height}`);
}

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("error", rej);
    p.on("exit", (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited with ${code}`))));
  });
}

let s, errors = null;
try {
  const out = resolve(flags.out);
  const audio = flags.audio && resolve(flags.audio);
  if (audio && !existsSync(audio)) throw new Error(`--audio ${audio}: no such file`);
  let list = null;
  if (flags.shots) {
    try { list = JSON.parse(readFileSync(resolve(flags.shots), "utf8")); } catch (e) { throw new Error(`--shots ${flags.shots}: ${e.message}`); }
  }
  if (flags.fps < 1 || flags.fps > 240) throw new Error(`--fps ${flags.fps}: use 1..240`);

  s = await startSession(flags, flags.size);
  const p = await s.newPage(flags.size);
  const { page } = p;
  errors = p.errors;
  const url = s.url({ cad: flags.cad, solo: flags.solo });
  await openCell(page, url, errors);
  console.log(`page ${url}`);
  const info = await page.evaluate(() => {
    const v3 = (p) => (Array.isArray(p) ? p.slice(0, 3).map(Number) : p && typeof p === "object" ? [p.x, p.y, p.z] : null);
    const views = {};
    for (const [k, v] of Object.entries(window.pcViews || {})) views[k] = { pos: v3(v.pos ?? v.position), target: v3(v.target) };
    return {
      duration: window.pc?.DURATION,
      views,
      missing: ["pause", "seek", "setCamera"].filter((k) => typeof window.pc?.[k] !== "function"),
    };
  });
  if (info.missing.length) throw new Error(`window.pc is missing ${info.missing.join(", ")}`);
  if (!(info.duration > 0)) throw new Error(`window.pc.DURATION is ${info.duration}`);

  let plan = null, camFn;
  if (list) {
    plan = shotPlan(list, info.views);
    camFn = (t) => camAt(plan, t);
    console.log(`shots: ${plan.length} from ${flags.shots} (${plan[0].t0}..${Math.max(...plan.map((x) => x.t1))} s)`);
  } else {
    const name = info.views.iso?.pos && info.views.iso?.target ? "iso" : Object.keys(info.views).find((k) => info.views[k].pos && info.views[k].target);
    if (!name) throw new Error("window.pcViews has no view with pos and target for the default orbit");
    camFn = orbit(info.views[name], info.duration);
    console.log(`shots: one orbit of '${name}' per ${info.duration.toFixed(2)} s cycle`);
  }
  const from = flags.from ?? (plan ? plan[0].t0 : 0);
  const to = flags.to ?? (plan ? Math.max(...plan.map((x) => x.t1)) : info.duration);
  const n = Math.round((to - from) * flags.fps);
  if (!(n >= 1)) throw new Error(`nothing to record: from ${from} to ${to} s`);
  if (from < 0 || to > info.duration + 1e-9) console.warn(`warning: ${from}..${to} s leaves the cycle 0..${info.duration.toFixed(2)} s; the page clamps seek()`);

  const hqCtl = await settleQuality(page, flags.hq);
  let clip;
  if (canvasOnly) {
    await page.addStyleTag({ content: `body * { visibility: hidden !important; } ${flags.canvas} { visibility: visible !important; }` });
    const fit = await fitCanvas(page, flags.canvas, flags.size);
    clip = fit.clip;
    console.log(`canvas ${flags.size.width}x${flags.size.height} at ${clip.x},${clip.y} in a ${fit.page.width}x${fit.page.height} page`);
  }
  console.log(`recording ${n} frames, ${from}..${(from + n / flags.fps).toFixed(3)} s at ${flags.fps} fps, HQ ${hqCtl ? (flags.hq ? "on" : "off") : "n/a"}`);

  if (errors.length) throw new Error("console errors before the first frame; film not started");
  mkdirSync(FRAMES, { recursive: true });
  for (const f of readdirSync(FRAMES)) if (/^f_\d+\.jpg$/.test(f)) rmSync(join(FRAMES, f), { force: true });
  const t0 = Date.now();
  let shotN = 0;
  for (let k = 0; k < n; k++) {
    const t = from + k / flags.fps;
    const cam = camFn(t);
    if (cam.shot && cam.shot.n !== shotN) {
      shotN = cam.shot.n;
      console.log(`shot ${shotN}/${plan.length} ${cam.shot.label ? `"${cam.shot.label}" ` : ""}${cam.shot.t0}..${cam.shot.t1} s at frame ${k}`);
    }
    await page.evaluate(async ({ t, pos, target }) => {
      window.pc.pause();
      window.pc.seek(t);
      window.pc.setCamera(pos, target);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, { t, pos: cam.pos, target: cam.target });
    await page.screenshot({ path: join(FRAMES, `f_${String(k).padStart(5, "0")}.jpg`), type: "jpeg", quality: flags.quality, clip });
    if (errors.length) throw new Error(`console errors at frame ${k} (t ${t.toFixed(3)} s); film aborted`);
    if ((k + 1) % 60 === 0 || k + 1 === n) {
      const el = (Date.now() - t0) / 1000, rate = (k + 1) / el;
      console.log(`frame ${k + 1}/${n}  t ${t.toFixed(2)} s  ${rate.toFixed(1)} frames/s  eta ${fmtDur((n - k - 1) / rate)}`);
    }
  }
  await s.close(); // free Chrome's memory before encoding

  mkdirSync(dirname(out), { recursive: true });
  const args = ["-y", "-hide_banner", "-loglevel", "error", process.stderr.isTTY ? "-stats" : "-nostats",
    "-framerate", String(flags.fps), "-start_number", "0", "-i", join(FRAMES, "f_%05d.jpg")];
  if (audio) args.push("-i", audio, "-map", "0:v:0", "-map", "1:a:0");
  // JPEG frames are full-range BT.601; convert through RGB to standard limited-range BT.709 and tag it
  const vf = ["format=rgb24"];
  if (flags.size.width % 2 || flags.size.height % 2) vf.push("pad=ceil(iw/2)*2:ceil(ih/2)*2");
  vf.push("scale=out_color_matrix=bt709:out_range=tv", "format=yuv420p");
  args.push("-vf", vf.join(","), "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv");
  if (audio) args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
  args.push("-movflags", "+faststart", out);
  const e0 = Date.now();
  console.log(`encoding ${n} frames -> ${out}`);
  await run("ffmpeg", args);
  console.log(`encoded in ${fmtDur((Date.now() - e0) / 1000)}`);

  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames",
    "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,pix_fmt,sample_rate,channels:format=duration,size",
    "-of", "json", out], { encoding: "utf8" }));
  const v = probe.streams.find((x) => x.codec_type === "video");
  const a = probe.streams.find((x) => x.codec_type === "audio");
  const [num, den] = v.r_frame_rate.split("/").map(Number);
  console.log(out);
  console.log(`ffprobe: ${v.width}x${v.height} ${v.codec_name} ${v.pix_fmt}, ${+(num / den).toFixed(3)} fps, ${v.nb_read_frames} frames, `
    + `${Number(probe.format.duration).toFixed(3)} s, ${(Number(probe.format.size) / 1e6).toFixed(1)} MB`
    + (a ? `; audio ${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch` : ""));
  if (!audio && Number(v.nb_read_frames) !== n) console.warn(`warning: expected ${n} frames`);
  if (flags.keepFrames) console.log(`frames kept in ${FRAMES}`);
  else for (const f of readdirSync(FRAMES)) if (/^f_\d+\.jpg$/.test(f)) rmSync(join(FRAMES, f), { force: true });
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
