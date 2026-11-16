// Film: renders film/plan.json from the browser twin. Every segment is a time-remapped shot (sim time s0 -> s1 over
// "dur" film seconds, a moving camera in the cell frame); segments are rendered as separate JPEG sequences and joined in
// one ffmpeg graph (xfade for dissolves, concat for cuts). Titles, chapter lower-thirds, data insets and the end card are
// transparent PNGs drawn by tools/lib/film-overlays.html in the same Chrome session and composited with alpha fades.
// The soundtrack comes from tools/audio.mjs (procedural, deterministic). The result is validated (ffprobe, full decode)
// and a contact sheet (one tile per segment) is written next to the mp4.
//
// Usage: node tools/film.mjs [--plan film/plan.json] [--out _frames/film.mp4] [--preview] [--from-seg A] [--to-seg B]
//          [--size WxH] [--fps N] [--frames-only] [--keep-frames] [--resume] [--audio FILE.wav | --no-audio]
//          [--no-overlays] [--check] [--frames-from DIR] [--cad] [--root DIR] [--port N] [--gpu MODE]
//   --frames-from DIR  finish frames rendered elsewhere (the Blender film): DIR/sNN/f_00000.png|jpg per segment, as
//               tools/film.mjs itself writes them; overlays, audio, dissolves, validation and contact sheet as usual
//   --check     validate the plan, print the cut list and camera warnings, no Chrome
//   --preview   half size, every 3rd frame (10 fps), fast x264: a quick look at the whole plan
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { REPO, parseFlags, startSession, openCell, frames, settleQuality, reportFatal } from "./lib/browser.mjs";
import { loadPlan, loadLogic, segmentAt, segRange, cameraWarnings, toScene } from "./lib/film-plan.mjs";
import { buildAudio, levelReport } from "./audio.mjs";

const flags = parseFlags({
  plan: { type: "string", default: join(REPO, "film/plan.json"), help: "shot plan" },
  out: { type: "string", help: "output mp4 (default _frames/film.mp4, _frames/film-preview.mp4 with --preview)" },
  preview: { type: "bool", help: "half size, every 3rd frame (10 fps), fast encode" },
  "from-seg": { type: "int", help: "first segment to render (1-based, default 1)" },
  "to-seg": { type: "int", help: "last segment to render (1-based, default the last)" },
  size: { type: "size", help: "film size (default the plan's, halved with --preview)" },
  fps: { type: "int", help: "film fps (default the plan's)" },
  "frames-only": { type: "bool", help: "render the frames (and overlays) and stop" },
  "keep-frames": { type: "bool", help: "keep the frame folder after encoding" },
  resume: { type: "bool", help: "keep frames that already exist (an interrupted render of the SAME plan)" },
  audio: { type: "string", help: "WAV to mux (default: built from the plan with tools/audio.mjs)" },
  "no-audio": { type: "bool", help: "silent film" },
  "no-overlays": { type: "bool", help: "no titles, captions, insets or end card" },
  check: { type: "bool", help: "validate the plan and print the cut list, then exit" },
  "frames-from": { type: "string", help: "use frames rendered elsewhere: DIR/sNN/f_%05d.png|jpg (e.g. the Blender render)" },
  hq: { type: "onoff", default: true, help: "HQ rendering", shown: " (default on)" },
  cad: { type: "bool", help: "load the CAD robots (default adds ?cad=0)" },
  quality: { type: "int", default: 93, help: "JPEG quality of the frames (85 with --preview)" },
  canvas: { type: "string", default: "#viewport canvas.main", help: "3D canvas selector" },
}, "node tools/film.mjs [flags]");

const even = (v) => Math.max(2, Math.round(v / 2) * 2);
const fmtDur = (s) => (s >= 60 ? `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s` : `${s.toFixed(1)}s`);
const pad = (n, w = 2) => String(n).padStart(w, "0");
const OVERLAY_HTML = join(REPO, "tools/lib/film-overlays.html");

// ---------------------------------------------------------------- plan -> render jobs
function prepare() {
  const plan = loadPlan(resolve(flags.plan));
  const fps = flags.fps ?? plan.fps;
  const full = flags.size ?? { width: plan.size[0], height: plan.size[1] };
  const step = flags.preview ? 3 : 1;
  if (fps % step) throw new Error(`--preview renders every 3rd frame: fps ${fps} must be a multiple of 3`);
  const rfps = fps / step;
  const size = flags.preview && !flags.size ? { width: even(full.width / 2), height: even(full.height / 2) } : full;
  const R = segRange(plan, flags.fromSeg ?? 1, flags.toSeg ?? plan.segments.length);
  const segs = plan.segments.slice(R.a - 1, R.b);
  const frac = (x) => Math.abs(x * rfps - Math.round(x * rfps));
  const jobs = segs.map((seg, k) => {
    const xf = k === 0 ? 0 : seg.xfade;      // a subset starts clean on its first segment
    for (const [what, v] of [["dur", seg.dur], ["xfade", xf]]) {
      if (frac(v) > 1e-6) console.warn(`warning: ${seg.at}: ${what} ${v} s is not a whole number of frames at ${rfps} fps (rounded)`);
    }
    return { seg, k, n: Math.round(seg.dur * rfps), xfFrames: Math.round(xf * rfps), xf: Math.round(xf * rfps) / rfps,
             t0: seg.T0 - R.t0, dir: `s${pad(seg.n)}` };
  });
  // output frame count = all frames minus the dissolve overlaps; the film clock of segment k starts at its T0
  const total = jobs.reduce((n, j) => n + j.n - j.xfFrames, 0);
  return { plan, fps, rfps, step, size, R, jobs, total, dur: total / rfps };
}

function printCuts(P) {
  console.log(`plan ${resolve(flags.plan)}: ${P.plan.segments.length} segments, ${P.plan.total.toFixed(2)} s at ${P.plan.fps} fps`);
  console.log(" #  label             film           sim            rate   xfade  caption");
  for (const s of P.plan.segments) {
    console.log(`${String(s.n).padStart(2)}  ${(s.label || "").padEnd(16).slice(0, 16)}  ${s.T0.toFixed(2).padStart(5)}-${s.T1.toFixed(2).padEnd(6)}  `
      + `${s.sim[0].toFixed(2).padStart(5)}-${s.sim[1].toFixed(2).padEnd(6)}  ${s.rate.toFixed(3)}  ${s.xfade ? s.xfade.toFixed(2) : "  -  "}  `
      + `${s.caption ? `${s.caption.style || "chapter"}: ${s.caption.text}` : ""}${s.inset ? ` + ${s.inset.kind}` : ""}`);
  }
  const warn = cameraWarnings(P.plan);
  for (const w of warn) console.warn(`camera warning: ${w}`);
  console.log(`render: segments ${P.R.a}..${P.R.b}, ${P.size.width}x${P.size.height} at ${P.rfps} fps, ${P.total} frames, ${P.dur.toFixed(2)} s`);
  return warn;
}

// ---------------------------------------------------------------- overlays: one transparent PNG per caption or inset
function overlaySpecs(P, L) {
  const out = [];
  const stats = L.STATS || {};
  for (const j of P.jobs) {
    const s = j.seg;
    if (s.caption) {
      const c = s.caption;
      out.push({ id: `cap${pad(s.n)}`, kind: c.style || "chapter", t0: j.t0 + c.in, t1: j.t0 + c.out,
        text: c.text, sub: c.sub || "", n: c.n || "", title: P.plan.title || "",
        stats: c.style === "end" ? {
          cycle: L.CYCLE, perHour: stats.perHour, good: stats.good, rejected: stats.rejected,
          bottleneck: stats.bottleneck, quality: stats.quality, duration: L.DURATION,
          index: L.DIAL ? L.DIAL.index + (L.DIAL.sig || 0) : null,
        } : null });
    }
    if (s.inset && s.inset.kind === "press-curve") {
      // the press test inside this segment's sim range (the first failing one, else the first one)
      const inRange = (L.marks?.press || []).filter((m) => m.t1 >= s.sim[0] && m.t0 <= s.sim[1]);
      const m = inRange.find((x) => !x.pass) || inRange[0];
      const ref = (L.marks?.press || []).find((x) => x.pass);
      if (!m) { console.warn(`warning: ${s.at}: no press test in sim ${s.sim.join("..")}; inset skipped`); continue; }
      out.push({ id: `ins${pad(s.n)}`, kind: "press-curve", t0: j.t0 + s.inset.in, t1: j.t0 + s.inset.out,
        a: m.a, pass: m.pass, f45: m.f45, peak: m.peak, curve: m.curve, ref: ref ? ref.curve : null,
        window: L.PRESS?.window || [3, 4.5], at: 4.5 });
    }
  }
  return out;
}

async function renderOverlays(s, P, specs, dir) {
  if (!specs.length) return [];
  const { page, errors } = await s.newPage(P.size, { seed: 1 });
  await page.setContent(readFileSync(OVERLAY_HTML, "utf8"), { waitUntil: "load", timeout: 30000 });
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 8000))]));
  const files = [];
  for (const sp of specs) {
    await page.evaluate((sp) => window.renderOverlay(sp), sp);
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]));
    await frames(page, 2);
    const file = join(dir, `${sp.id}.png`);
    await page.screenshot({ path: file, omitBackground: true, type: "png" });
    files.push({ ...sp, file });
  }
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family));
  console.log(`overlays: ${files.length} PNG (${[...new Set(fonts)].join(", ") || "system fonts"})`);
  if (errors.length) console.warn(`overlay page: ${errors.length} console error(s): ${errors[0]}`);
  await page.context().close();
  return files;
}

// ---------------------------------------------------------------- capture
async function fitCanvas(page, sel, want) {   // grows/shrinks the page until the canvas is exactly want; returns its clip
  for (let i = 0; i < 8; i++) {
    const r = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, vw: innerWidth, vh: innerHeight };
    }, sel);
    if (!r) throw new Error(`no element matches "${sel}" (pass --canvas SEL)`);
    if (Math.abs(r.w - want.width) < 0.5 && Math.abs(r.h - want.height) < 0.5) return { x: r.x, y: r.y, width: want.width, height: want.height };
    const vw = Math.round(r.vw + want.width - r.w), vh = Math.round(r.vh + want.height - r.h);
    if (vw < 64 || vh < 64 || vw > 8192 || vh > 8192) break;
    await page.setViewportSize({ width: vw, height: vh });
    await page.waitForTimeout(150);
    await frames(page, 3);
  }
  throw new Error(`could not size "${sel}" to ${want.width}x${want.height}`);
}

async function renderFrames(s, P, frameDir) {
  const { page, errors } = await s.newPage(P.size);
  const url = s.url({ cad: flags.cad });
  await openCell(page, url, errors);
  console.log(`page ${url}`);
  const info = await page.evaluate(() => ({
    duration: window.pc?.DURATION,
    missing: ["pause", "seek", "setCamera"].filter((k) => typeof window.pc?.[k] !== "function"),
    camArity: typeof window.pc?.setCamera === "function" ? window.pc.setCamera.length : 0,
  }));
  if (info.missing.length) throw new Error(`window.pc is missing ${info.missing.join(", ")}`);
  const hooks = [];
  if (info.camArity < 3) {
    hooks.push("window.pc.setCamera(pos, target, fov): apply fov (degrees) to the camera and call updateProjectionMatrix()");
    console.warn("warning: the page's pc.setCamera ignores the fov argument: every shot uses the page camera's fov until 70-loop.js takes it");
  }
  const maxSim = Math.max(...P.jobs.map((j) => j.seg.sim[1]));
  if (maxSim > info.duration + 1e-6) console.warn(`warning: the plan reaches sim ${maxSim} s but the run lasts ${info.duration.toFixed(2)} s (seek clamps)`);
  const hq = await settleQuality(page, flags.hq);
  await page.addStyleTag({ content: `body * { visibility: hidden !important; } ${flags.canvas} { visibility: visible !important; }` });
  const clip = await fitCanvas(page, flags.canvas, P.size);
  console.log(`canvas ${P.size.width}x${P.size.height}, HQ ${hq ? (flags.hq ? "on" : "off") : "n/a"}, ${P.jobs.reduce((n, j) => n + j.n, 0)} frames to render`);
  if (errors.length) throw new Error(`console errors before the first frame:\n  ${errors.join("\n  ")}`);

  const quality = flags.preview && flags.quality === 93 ? 85 : flags.quality;
  const t0 = Date.now();
  let done = 0, skipped = 0;
  const all = P.jobs.reduce((n, j) => n + j.n, 0);
  for (const j of P.jobs) {
    const dir = join(frameDir, j.dir);
    mkdirSync(dir, { recursive: true });
    if (!flags.resume) for (const f of readdirSync(dir)) if (/^f_\d+\.jpg$/.test(f)) rmSync(join(dir, f), { force: true });
    console.log(`segment ${j.seg.n} "${j.seg.label}": ${j.n} frames, sim ${j.seg.sim[0]}..${j.seg.sim[1]} s (${j.seg.rate.toFixed(3)}x)${j.xf ? `, dissolve ${j.xf} s` : ""}`);
    for (let i = 0; i < j.n; i++) {
      const file = join(dir, `f_${pad(i, 5)}.jpg`);
      if (flags.resume && existsSync(file)) { skipped++; done++; continue; }
      const c = segmentAt(j.seg, j.seg.T0 + i / P.rfps);
      await page.evaluate(async ({ sim, pos, target, fov }) => {
        window.pc.pause();
        window.pc.seek(sim);
        window.pc.setCamera(pos, target, fov);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }, { sim: c.sim, pos: toScene(c.pos), target: toScene(c.target), fov: c.fov });
      await page.screenshot({ path: file, type: "jpeg", quality, clip });
      if (errors.length) throw new Error(`console errors at segment ${j.seg.n} frame ${i} (sim ${c.sim.toFixed(3)} s):\n  ${errors.join("\n  ")}`);
      done++;
      if (done % 60 === 0 || done === all) {
        const el = (Date.now() - t0) / 1000, rate = (done - skipped) / Math.max(el, 1e-3);
        console.log(`  frame ${done}/${all}  ${rate.toFixed(1)} frames/s  eta ${fmtDur((all - done) / Math.max(rate, 1e-3))}`);
      }
    }
  }
  await page.context().close();
  return { hooks, renderS: (Date.now() - t0) / 1000, rendered: done - skipped, skipped };
}

// ---------------------------------------------------------------- encode
function run(cmd, args, { quiet = false } = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ["ignore", quiet ? "ignore" : "inherit", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; if (!quiet) process.stderr.write(d); });
    p.on("error", rej);
    p.on("exit", (code) => (code === 0 ? res(err) : rej(new Error(`${cmd} exited with ${code}${quiet ? `\n${err.slice(-2000)}` : ""}`))));
  });
}

function encodeArgs(P, frameDir, overlays, audio, out, ext = "jpg") {
  const args = ["-y", "-hide_banner", "-loglevel", "error", process.stderr.isTTY ? "-stats" : "-nostats"];
  const fc = [];
  P.jobs.forEach((j) => args.push("-framerate", String(P.rfps), "-start_number", "0", "-i", join(frameDir, j.dir, `f_%05d.${ext}`)));
  // segments: JPEG (full-range BT.601) -> planar RGB; dissolves with xfade, cuts with concat
  P.jobs.forEach((j, k) => fc.push(`[${k}:v]format=gbrp,setsar=1,settb=1/${P.rfps}[v${k}]`));
  let cur = "v0";
  P.jobs.forEach((j, k) => {
    if (k === 0) return;
    const o = `c${k}`;
    fc.push(j.xfFrames > 0
      ? `[${cur}][v${k}]xfade=transition=fade:duration=${j.xf.toFixed(6)}:offset=${(j.t0).toFixed(6)}[${o}]`
      : `[${cur}][v${k}]concat=n=2:v=1:a=0[${o}]`);
    cur = o;
  });
  // overlays: looped PNG inputs with alpha fades at their caption times
  let input = P.jobs.length;
  for (const ov of overlays) {
    const fade = Math.min(0.45, (ov.t1 - ov.t0) / 3);
    args.push("-loop", "1", "-framerate", String(P.rfps), "-t", P.dur.toFixed(6), "-i", ov.file);
    const o = `o${input}`, d = `d${input}`;
    fc.push(`[${input}:v]format=rgba,fade=t=in:st=${ov.t0.toFixed(3)}:d=${fade.toFixed(3)}:alpha=1,fade=t=out:st=${(ov.t1 - fade).toFixed(3)}:d=${fade.toFixed(3)}:alpha=1[${o}]`);
    fc.push(`[${cur}][${o}]overlay=0:0:format=gbrp:enable='between(t,${ov.t0.toFixed(3)},${ov.t1.toFixed(3)})'[${d}]`);
    cur = d;
    input++;
  }
  // film fades (only where the subset holds the plan's first / last segment), then limited-range BT.709 4:2:0
  const post = [];
  const fin = P.plan.fadeIn ?? 1.0, fout = P.plan.fadeOut ?? 1.5;
  if (P.R.a === 1 && fin > 0) post.push(`fade=t=in:st=0:d=${fin}`);
  if (P.R.b === P.plan.segments.length && fout > 0) post.push(`fade=t=out:st=${(P.dur - fout).toFixed(3)}:d=${fout}`);
  post.push("scale=out_color_matrix=bt709:out_range=tv", "format=yuv420p");
  fc.push(`[${cur}]${post.join(",")}[vout]`);
  if (audio) args.push("-ss", P.R.t0.toFixed(6), "-t", P.dur.toFixed(6), "-i", audio);
  args.push("-filter_complex", fc.join(";"), "-map", "[vout]");
  if (audio) args.push("-map", `${input}:a:0`, "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2");
  const fast = flags.preview;
  args.push("-c:v", "libx264", "-preset", fast ? "veryfast" : "slow", "-crf", fast ? "23" : "17", "-pix_fmt", "yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-r", String(P.rfps), "-frames:v", String(P.total), "-movflags", "+faststart",
    "-metadata", `title=${P.plan.title || "Mini Factory Cell"}`, out);
  return args;
}

// ---------------------------------------------------------------- validation
export function validateFilm(out, want) {
  const res = { file: out, ok: true, problems: [] };
  const fail = (m) => { res.ok = false; res.problems.push(m); };
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_entries",
    "stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,pix_fmt,color_space,color_range,sample_rate,channels,duration:format=duration,size",
    "-of", "json", out], { encoding: "utf8" }));
  const v = probe.streams.find((x) => x.codec_type === "video"), a = probe.streams.find((x) => x.codec_type === "audio");
  if (!v) { fail("no video stream"); return res; }
  res.video = { codec: v.codec_name, width: v.width, height: v.height, fps: v.r_frame_rate, frames: Number(v.nb_read_frames),
                duration: Number(v.duration), pix_fmt: v.pix_fmt, color: `${v.color_space}/${v.color_range}` };
  res.size = Number(probe.format.size);
  res.duration = Number(probe.format.duration);
  if (v.codec_name !== "h264") fail(`video codec ${v.codec_name}`);
  if (v.width !== want.width || v.height !== want.height) fail(`size ${v.width}x${v.height}, want ${want.width}x${want.height}`);
  if (v.r_frame_rate !== `${want.fps}/1`) fail(`frame rate ${v.r_frame_rate}, want ${want.fps}/1`);
  if (Number(v.nb_read_frames) !== want.frames) fail(`${v.nb_read_frames} frames, want ${want.frames}`);
  if (Math.abs(Number(v.duration) - want.frames / want.fps) > 1.5 / want.fps) fail(`video duration ${v.duration} s, want ${(want.frames / want.fps).toFixed(3)}`);
  if (v.pix_fmt !== "yuv420p") fail(`pixel format ${v.pix_fmt}`);
  if (v.color_space !== "bt709" || v.color_range !== "tv") fail(`colour tags ${v.color_space}/${v.color_range}, want bt709/tv`);
  if (want.audio) {
    if (!a) fail("no audio stream");
    else {
      res.audio = { codec: a.codec_name, rate: Number(a.sample_rate), channels: a.channels, duration: Number(a.duration) };
      if (a.codec_name !== "aac" || a.channels !== 2 || Number(a.sample_rate) !== 48000) fail(`audio ${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch, want aac 48000 Hz stereo`);
      if (Math.abs(Number(a.duration) - want.frames / want.fps) > 0.1) fail(`audio duration ${a.duration} s`);
    }
  }
  const dec = spawnSync("ffmpeg", ["-v", "error", "-xerror", "-i", out, "-f", "null", "-"], { encoding: "utf8" });
  res.decode = dec.status === 0 && !dec.stderr.trim() ? "PASS" : `FAIL ${dec.stderr.trim().split("\n")[0] || `exit ${dec.status}`}`;
  if (res.decode !== "PASS") fail(`full decode: ${res.decode}`);
  return res;
}

function fontFile() {
  try { return execFileSync("fc-match", ["-f", "%{file}", "Noto Sans:bold"], { encoding: "utf8" }).trim() || null; } catch { return null; }
}

async function contactSheet(out, P, sheet) {
  const tiles = P.jobs.map((j) => ({ label: `${j.seg.n}  ${j.seg.label || ""}`, f: Math.min(P.total - 1, Math.max(0, Math.round((j.t0 + j.seg.dur / 2) * P.rfps))) }));
  const cols = tiles.length <= 4 ? tiles.length : tiles.length <= 9 ? 3 : tiles.length <= 16 ? 4 : 5;
  const rows = Math.ceil(tiles.length / cols);
  const tw = 480, th = even((480 * P.size.height) / P.size.width);
  const font = fontFile();
  const tmp = join(dirname(sheet), `.labels-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  const vf = [];
  tiles.forEach((t, i) => {
    if (!font) return;
    const tf = join(tmp, `l${i}.txt`);
    writeFileSync(tf, t.label);
    const fs = Math.round(P.size.height / 22);
    vf.push(`drawtext=fontfile=${font}:textfile=${tf}:enable='eq(n\\,${t.f})':x=${Math.round(fs * 0.8)}:y=${Math.round(fs * 0.8)}:fontsize=${fs}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=${Math.round(fs * 0.35)}`);
  });
  vf.push(`select='${tiles.map((t) => `eq(n\\,${t.f})`).join("+")}'`, `scale=${tw}:${th}`, `tile=${cols}x${rows}:padding=6:margin=6:color=0x15181c`);
  try {
    await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", out, "-vf", vf.join(","), "-frames:v", "1", "-fps_mode", "passthrough", "-q:v", "3", sheet], { quiet: true });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return sheet;
}

// External frames (--frames-from): every segment folder must hold exactly its frame count, all of the film size.
function checkExternalFrames(P, dir) {
  let ext = null;
  for (const j of P.jobs) {
    const d = join(dir, j.dir);
    if (!existsSync(d)) throw new Error(`--frames-from: missing ${d} (segment ${j.seg.n} "${j.seg.label}")`);
    const files = readdirSync(d).filter((f) => /^f_\d{5}\.(png|jpg)$/.test(f)).sort();
    const e = files.length ? files[0].slice(-3) : null;
    if (!e) throw new Error(`--frames-from: no f_00000.png|jpg in ${d}`);
    if (ext && e !== ext) throw new Error(`--frames-from: mixed frame types (${ext} and ${e})`);
    ext = e;
    if (files.length !== j.n || files.at(-1) !== `f_${pad(j.n - 1, 5)}.${e}`) throw new Error(`--frames-from: ${d} has ${files.length} frames, segment ${j.seg.n} needs f_00000..f_${pad(j.n - 1, 5)}.${e}`);
  }
  const first = join(dir, P.jobs[0].dir, `f_00000.${ext}`);
  const v = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", first], { encoding: "utf8" })).streams[0];
  if (v.width !== P.size.width || v.height !== P.size.height) throw new Error(`--frames-from: frames are ${v.width}x${v.height}, the film is ${P.size.width}x${P.size.height} (pass --size ${v.width}x${v.height})`);
  return ext;
}

// ---------------------------------------------------------------- main
let session = null;
try {
  const P = prepare();
  const warns = printCuts(P);
  if (flags.check) process.exit(warns.length ? 1 : 0);

  const out = resolve(flags.out || join(REPO, flags.preview ? "_frames/film-preview.mp4" : "_frames/film.mp4"));
  const base = out.replace(/\.mp4$/i, "");
  const work = join(dirname(out), `${basename(base)}.work`);
  const frameDir = join(work, "frames"), ovDir = join(work, "overlays");
  mkdirSync(frameDir, { recursive: true });
  mkdirSync(ovDir, { recursive: true });
  const root = resolve(flags.root || REPO);
  const html = join(root, "index.html");
  if (!existsSync(html)) throw new Error(`no ${html}: run node tools/build.mjs first`);
  const L = loadLogic(html);
  const t0 = Date.now();

  // 1. Chrome: overlays and frames (one session, the shared lock is held only while Chrome runs)
  const external = flags.framesFrom ? resolve(flags.framesFrom) : null;
  let ext = "jpg", fr = { hooks: [], renderS: 0, rendered: 0, skipped: 0 };
  if (external) ext = checkExternalFrames(P, external);
  const specs = flags.noOverlays ? [] : overlaySpecs(P, L);
  let overlays = [];
  if (specs.length || !external) {
    session = await startSession(flags, P.size);
    overlays = await renderOverlays(session, P, specs, ovDir);
    if (!external) fr = await renderFrames(session, P, frameDir);
    await session.close();
    session = null;
  }
  if (external) console.log(`frames: ${P.jobs.reduce((n, j) => n + j.n, 0)} ${ext.toUpperCase()} frames from ${external}`);
  else console.log(`frames: ${fr.rendered} rendered${fr.skipped ? `, ${fr.skipped} kept` : ""} in ${fmtDur(fr.renderS)}`);
  if (flags.framesOnly) {
    console.log(`frames in ${frameDir}${overlays.length ? `, overlays in ${ovDir}` : ""}`);
    process.exit(0);
  }

  // 2. audio (pure Node), for the whole plan; the encode cuts the subset out of it
  let audio = null;
  if (!flags.noAudio) {
    audio = flags.audio ? resolve(flags.audio) : join(work, "film.wav");
    if (flags.audio && !existsSync(audio)) throw new Error(`--audio ${audio}: no such file`);
    if (!flags.audio) {
      const r = buildAudio({ plan: P.plan, html, out: audio, quiet: false });
      const rows = levelReport(r.left, r.right, r.sr);
      const loud = rows.filter((x) => x.s >= Math.floor(P.R.t0) && x.s < Math.ceil(P.R.t1));
      console.log(`audio RMS per second (dBFS, L/R): ${loud.map((x) => `${x.s}:${x.rmsL.toFixed(0)}/${x.rmsR.toFixed(0)}`).join(" ")}`);
    }
  }

  // 3. encode
  mkdirSync(dirname(out), { recursive: true });
  const e0 = Date.now();
  console.log(`encoding ${P.total} frames (${P.dur.toFixed(2)} s) -> ${out}`);
  await run("ffmpeg", encodeArgs(P, external || frameDir, overlays, audio, out, ext));
  console.log(`encoded in ${fmtDur((Date.now() - e0) / 1000)}`);

  // 4. validation and contact sheet
  const val = validateFilm(out, { width: P.size.width, height: P.size.height, fps: P.rfps, frames: P.total, audio: !!audio });
  const sheet = await contactSheet(out, P, `${base}.contact.jpg`);
  const report = {
    plan: resolve(flags.plan), out, sheet, preview: !!flags.preview, segments: [P.R.a, P.R.b], size: P.size, fps: P.rfps,
    frames: P.total, duration: P.dur, overlays: overlays.map((o) => ({ id: o.id, kind: o.kind, t0: o.t0, t1: o.t1 })),
    audio: audio ? basename(audio) : null, pageHooksNeeded: fr.hooks, validation: val, wallS: (Date.now() - t0) / 1000,
  };
  writeFileSync(`${base}.report.json`, JSON.stringify(report, null, 2) + "\n");
  const v = val.video;
  console.log(`ffprobe: ${v.width}x${v.height} ${v.codec} ${v.pix_fmt} ${v.color}, ${v.fps} fps, ${v.frames} frames, ${v.duration.toFixed(3)} s, ${(val.size / 1e6).toFixed(1)} MB`
    + (val.audio ? `; audio ${val.audio.codec} ${val.audio.rate} Hz ${val.audio.channels} ch ${val.audio.duration.toFixed(3)} s` : "; no audio"));
  console.log(`full decode: ${val.decode}`);
  console.log(`contact sheet: ${sheet}`);
  for (const h of fr.hooks) console.warn(`page hook needed: ${h}`);
  if (!val.ok) { for (const p of val.problems) console.error(`validation: ${p}`); process.exitCode = 1; }
  else console.log(`validation: PASS (${fmtDur(report.wallS)} wall)`);
  if (external) { /* never delete frames rendered elsewhere */ }
  else if (!flags.keepFrames) rmSync(frameDir, { recursive: true, force: true });
  else console.log(`frames kept in ${frameDir}`);
} catch (e) {
  reportFatal(e);
} finally {
  await session?.close();
}
