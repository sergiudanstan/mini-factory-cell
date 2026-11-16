// Film plan shared by tools/film.mjs and tools/audio.mjs: loads and checks film/plan.json, lays the segments out on
// the film clock (cuts and dissolves), evaluates the cameras (cell frame, centripetal Catmull-Rom with smooth timing)
// and evaluates the logic block of the built page in Node (like tests/run.mjs).
//
// Plan format (all times in seconds, positions in the CELL frame: metres, z up, origin dial centre, floor z = -0.82):
//   { "fps": 30, "size": [1920, 1080], "title": "...", "subtitle": "...", "fadeIn": 1.0, "fadeOut": 1.5,
//     "audio": { "seed": 7, ... },
//     "segments": [ {
//       "label": "Hall", "dur": 8,                  film seconds
//       "sim": [s0, s1],                            sim time s0 -> s1 over dur (dur > s1 - s0 is slow motion)
//       "xfade": 0.6,                               optional dissolve from the previous segment (overlap, s)
//       "ease": "smooth",                           optional: linear | smooth | smoother | sine | in | out | in-sine | out-sine
//       "cam": [ { "u": 0, "pos": [x,y,z], "target": [x,y,z], "fov": 34 }, ... ],     u = 0..1 over the segment
//       or "orbit": { "target": [x,y,z], "radius": r, "z": camZ, "a0": deg, "a1": deg, "fov": 30,
//                     "r1": r, "z1": camZ, "target1": [x,y,z], "fov1": 30 },          angles CCW from +x
//       "caption": { "style": "title|chapter|end", "n": "02", "text": "...", "sub": "...", "in": a, "out": b },
//       "inset": { "kind": "press-curve", "in": a, "out": b },                        optional data graphic
//       "audio": { "gain": 1 }                      optional per-segment event gain
//       "blender": { "fstop": 4, "blur": true }      optional Blender-only shot settings (depth of field f-stop, motion blur)
//     } ] }
// Keys: 1 key = static; 2 keys = smoothstep between them (or the segment ease); 3+ keys = centripetal Catmull-Rom through
// the keys, passing key i at its u (timing is a monotone cubic through the keys' arc lengths, so the speed is smooth).
// A middle key without "u" gets one from the arc length (even speed). Missing fov = the previous key's, or 34.
import { readFileSync } from "node:fs";

export const DEFAULT_FOV = 34;
export const toScene = (p) => [p[0], p[2], -p[1]];          // cell (x, y, z) -> three.js scene (x, z, -y)
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a, b, s) => a + (b - a) * s;
const lerp3 = (a, b, s) => [lerp(a[0], b[0], s), lerp(a[1], b[1], s), lerp(a[2], b[2], s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const EASE = {
  linear: (u) => u,
  smooth: (u) => u * u * (3 - 2 * u),
  smoother: (u) => u * u * u * (u * (6 * u - 15) + 10),
  sine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * u),
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  "in-sine": (u) => 1 - Math.cos((Math.PI * u) / 2),
  "out-sine": (u) => Math.sin((Math.PI * u) / 2),
};

// ---------------------------------------------------------------- splines
// One centripetal Catmull-Rom piece between p1 and p2 (Barry-Goldman), s = 0..1.
function crPiece(p0, p1, p2, p3, s) {
  const kn = (a, b) => Math.max(1e-4, Math.sqrt(len(sub(b, a))));
  const t0 = 0, t1 = kn(p0, p1), t2 = t1 + kn(p1, p2), t3 = t2 + kn(p2, p3);
  const t = t1 + (t2 - t1) * s;
  const L = (a, b, ta, tb) => lerp3(a, b, (t - ta) / (tb - ta));
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  return L(L(A1, A2, t0, t2), L(A2, A3, t1, t3), t1, t2);
}
// Monotone cubic (Fritsch-Carlson) through (xs[i], ys[i]); xs strictly increasing.
function pchip(xs, ys) {
  const n = xs.length, h = [], d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { h.push(xs[i + 1] - xs[i]); d.push((ys[i + 1] - ys[i]) / h[i]); }
  if (n === 2) { m[0] = m[1] = d[0]; }
  else {
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0;
      else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
    }
    const end = (h0, h1, d0, d1) => {   // non-centred three-point end slope, kept shape-preserving
      let v = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
      if (Math.sign(v) !== Math.sign(d0)) v = 0;
      else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(v) > Math.abs(3 * d0)) v = 3 * d0;
      return v;
    };
    m[0] = end(h[0], h[1], d[0], d[1]);
    m[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const s = (x - xs[i]) / h[i], s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h[i] * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h[i] * m[i + 1];
  };
}
// Path through pts passing pts[i] at us[i]: centripetal CR geometry, timed by a monotone cubic of the arc length.
function makePath(pts, us) {
  const n = pts.length;
  if (n === 1 || pts.every((p) => len(sub(p, pts[0])) < 1e-9)) return () => pts[0].slice();
  if (n === 2) return (u) => lerp3(pts[0], pts[1], clamp((u - us[0]) / (us[1] - us[0]), 0, 1));
  const P = (i) => (i < 0 ? sub(pts[0], sub(pts[1], pts[0])) : i >= n ? sub(pts[n - 1], sub(pts[n - 2], pts[n - 1])) : pts[i]);
  const N = 48, table = [];                   // per piece: cumulative arc length at N + 1 samples
  const cum = [0];
  for (let i = 0; i < n - 1; i++) {
    const row = [0];
    let prev = pts[i], acc = 0;
    for (let k = 1; k <= N; k++) { const q = crPiece(P(i - 1), P(i), P(i + 1), P(i + 2), k / N); acc += len(sub(q, prev)); prev = q; row.push(acc); }
    table.push(row);
    cum.push(cum[i] + acc);
  }
  // keys that do not move (zero-length pieces) keep the timing monotone: nudge equal arc lengths apart
  const ys = cum.map((c, i) => c + i * 1e-9);
  const arcAt = pchip(us, ys);
  return (u) => {
    const a = clamp(arcAt(clamp(u, us[0], us[n - 1])), 0, ys[n - 1]);
    let i = 0;
    while (i < n - 2 && a > ys[i + 1]) i++;
    const row = table[i], local = clamp(a - ys[i], 0, row[N]);
    if (row[N] < 1e-9) return pts[i].slice();
    let k = 1;
    while (k < N && row[k] < local) k++;
    const s = (k - 1 + (local - row[k - 1]) / Math.max(1e-12, row[k] - row[k - 1])) / N;
    return crPiece(P(i - 1), P(i), P(i + 1), P(i + 2), clamp(s, 0, 1));
  };
}

// Camera function of one segment: u (0..1, before the ease) -> { pos, target, fov } in the cell frame.
function makeCamera(seg, at) {
  if (seg.orbit) {
    const o = seg.orbit, e = EASE[seg.ease || "linear"];
    for (const k of ["target", "radius", "z", "a0", "a1"]) if (o[k] === undefined) throw new Error(`${at}: orbit needs "${k}"`);
    vec3(o.target, `${at}: orbit.target`);
    if (o.target1) vec3(o.target1, `${at}: orbit.target1`);
    return (u) => {
      const s = e(clamp(u, 0, 1)), a = (lerp(o.a0, o.a1, s) * Math.PI) / 180, r = lerp(o.radius, o.r1 ?? o.radius, s);
      const target = o.target1 ? lerp3(o.target, o.target1, s) : o.target.slice();
      return { pos: [target[0] + r * Math.cos(a), target[1] + r * Math.sin(a), lerp(o.z, o.z1 ?? o.z, s)], target,
               fov: lerp(o.fov ?? DEFAULT_FOV, o.fov1 ?? o.fov ?? DEFAULT_FOV, s) };
    };
  }
  const keys = seg.cam;
  if (!Array.isArray(keys) || !keys.length) throw new Error(`${at}: needs "cam" (a list of keys) or "orbit"`);
  keys.forEach((k, i) => { vec3(k.pos, `${at}: cam[${i}].pos`); vec3(k.target, `${at}: cam[${i}].target`); });
  // u values: given, or 0 / 1 at the ends, middle ones from the arc length
  const us = keys.map((k, i) => (k.u !== undefined ? k.u : i === 0 ? 0 : i === keys.length - 1 ? 1 : null));
  if (us.some((u) => u === null)) {
    const step = (i) => len(sub(keys[i].pos, keys[i - 1].pos)) + 0.3 * len(sub(keys[i].target, keys[i - 1].target));
    let total = 0;
    for (let i = 1; i < keys.length; i++) total += step(i);
    const d = [0];                              // + a small constant per key, so a hold (two equal keys) still advances
    for (let i = 1; i < keys.length; i++) d.push(d[i - 1] + step(i) + 0.15 * (total + 1e-3) / keys.length);
    for (let i = 0; i < keys.length; i++) {
      if (us[i] !== null) continue;
      let a = i - 1, b = i + 1;
      while (us[b] === null) b++;
      us[i] = lerp(us[a], us[b], (d[i] - d[a]) / Math.max(1e-9, d[b] - d[a]));
    }
  }
  for (let i = 0; i < us.length; i++) {
    if (!Number.isFinite(us[i]) || us[i] < 0 || us[i] > 1) throw new Error(`${at}: cam[${i}].u must be in 0..1`);
    if (i && us[i] <= us[i - 1]) throw new Error(`${at}: cam[${i}].u must be greater than cam[${i - 1}].u`);
  }
  const fovs = [];
  keys.forEach((k, i) => fovs.push(k.fov ?? (i ? fovs[i - 1] : DEFAULT_FOV)));
  const posAt = makePath(keys.map((k) => k.pos), us), tgtAt = makePath(keys.map((k) => k.target), us);
  const fovAt = keys.length >= 3 ? pchip(us, fovs) : (u) => lerp(fovs[0], fovs.at(-1), keys.length === 2 ? clamp((u - us[0]) / (us[1] - us[0]), 0, 1) : 0);
  const e = EASE[seg.ease || (keys.length === 2 ? "smooth" : "linear")];
  return (u) => { const s = e(clamp(u, 0, 1)); return { pos: posAt(s), target: tgtAt(s), fov: fovAt(s) }; };
}
function vec3(v, what) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) throw new Error(`${what} must be [x, y, z]`);
}

// ---------------------------------------------------------------- plan
// Returns { ...plan, fps, size, total, segments: [{ ...seg, i, n (1-based), T0, T1, rate, xfade, camAt(u) }] }.
export function loadPlan(file) {
  let raw;
  try { raw = JSON.parse(readFileSync(file, "utf8")); } catch (e) { throw new Error(`plan ${file}: ${e.message}`); }
  return preparePlan(raw);
}
export function preparePlan(raw) {
  const fps = raw.fps ?? 30, size = raw.size ?? [1920, 1080];
  if (!Number.isInteger(fps) || fps < 1 || fps > 120) throw new Error(`plan.fps ${fps}: use an integer 1..120`);
  if (!Array.isArray(size) || size.length !== 2 || !size.every((v) => Number.isInteger(v) && v >= 64)) throw new Error("plan.size must be [width, height]");
  if (!Array.isArray(raw.segments) || !raw.segments.length) throw new Error("plan.segments must be a non-empty list");
  const KNOWN = ["label", "dur", "sim", "xfade", "ease", "cam", "orbit", "caption", "inset", "audio", "note", "poster", "blender"];
  let T = 0;
  const segments = raw.segments.map((s, i) => {
    const at = `segment ${i + 1}${s && s.label ? ` "${s.label}"` : ""}`;
    if (!s || typeof s !== "object") throw new Error(`${at}: not an object`);
    for (const k of Object.keys(s)) if (!KNOWN.includes(k) && !k.startsWith("_")) console.warn(`warning: ${at}: unknown key "${k}"`);
    if (!(s.dur > 0)) throw new Error(`${at}: "dur" must be > 0`);
    if (!Array.isArray(s.sim) || s.sim.length !== 2 || !s.sim.every(Number.isFinite) || s.sim[1] < s.sim[0] || s.sim[0] < 0) throw new Error(`${at}: "sim" must be [s0, s1] with 0 <= s0 <= s1`);
    if (s.ease && !EASE[s.ease]) throw new Error(`${at}: unknown ease "${s.ease}" (${Object.keys(EASE).join(", ")})`);
    const xfade = i === 0 ? 0 : s.xfade ?? 0;
    if (i > 0 && !(xfade >= 0 && xfade <= Math.min(s.dur, raw.segments[i - 1].dur) / 2 + 1e-9)) {
      throw new Error(`${at}: "xfade" ${xfade} must be 0..half the shorter of this and the previous segment`);
    }
    const T0 = i === 0 ? 0 : T - xfade;
    T = T0 + s.dur;
    if (s.caption) {
      const c = s.caption;
      if (!["title", "chapter", "end"].includes(c.style || "chapter")) throw new Error(`${at}: caption.style must be title, chapter or end`);
      if (!(Number.isFinite(c.in) && Number.isFinite(c.out) && c.out > c.in)) throw new Error(`${at}: caption needs numbers "in" < "out" (seconds from the segment start)`);
    }
    if (s.inset && !(Number.isFinite(s.inset.in) && Number.isFinite(s.inset.out) && s.inset.out > s.inset.in)) throw new Error(`${at}: inset needs numbers "in" < "out"`);
    return { ...s, i, n: i + 1, at, T0, T1: T0 + s.dur, xfade, rate: (s.sim[1] - s.sim[0]) / s.dur, camAt: makeCamera(s, at) };
  });
  return { ...raw, fps, size, segments, total: Math.max(...segments.map((s) => s.T1)) };
}

// Sim time and camera of segment seg at film time t (seconds from the film start).
export function segmentAt(seg, t) {
  const local = clamp(t - seg.T0, 0, seg.dur), u = local / seg.dur;
  return { sim: seg.sim[0] + local * seg.rate, u, ...seg.camAt(u) };
}
// Layers of film time t: one entry, or two inside a dissolve ({ seg, w, sim, u, pos, target, fov }, weights sum to 1).
export function filmLayers(plan, t) {
  const S = plan.segments;
  let k = S.findIndex((s) => t < s.T1 - 1e-9);
  if (k < 0) k = S.length - 1;
  const cur = S[k], out = [];
  const nxt = S[k + 1];
  if (nxt && nxt.xfade > 0 && t >= nxt.T0) {         // inside the dissolve into the next segment
    const w = EASE.smooth(clamp((t - nxt.T0) / nxt.xfade, 0, 1));
    if (w < 1 - 1e-4) out.push({ seg: cur, w: 1 - w, ...segmentAt(cur, t) });
    if (w > 1e-4) out.push({ seg: nxt, w, ...segmentAt(nxt, t) });
    return out;
  }
  out.push({ seg: cur, w: 1, ...segmentAt(cur, t) });
  return out;
}
// Film-time range of segments a..b (1-based, inclusive).
export function segRange(plan, a = 1, b = plan.segments.length) {
  const n = plan.segments.length;
  if (!(a >= 1 && b <= n && a <= b)) throw new Error(`segment range ${a}..${b} is outside 1..${n}`);
  const t0 = plan.segments[a - 1].T0, t1 = plan.segments[b - 1].T1;
  return { a, b, t0, t1, dur: t1 - t0 };
}

// OrbitControls on the page clamps the camera: distance 0.12..30 m and at least 0.9° above the target (polar 0.495 pi).
// Returns readable warnings for sampled cameras outside those limits.
export function cameraWarnings(plan) {
  const out = [];
  for (const s of plan.segments) {
    let worst = null;
    for (let k = 0; k <= 40; k++) {
      const c = s.camAt(k / 40), d = sub(c.pos, c.target), dist = len(d);
      const elev = Math.asin(clamp(d[2] / Math.max(1e-9, dist), -1, 1)) * 180 / Math.PI;
      const bad = dist < 0.12 ? `${dist.toFixed(3)} m from its target (< 0.12)` : dist > 30 ? `${dist.toFixed(1)} m from its target (> 30)`
        : elev < 0.95 ? `${elev.toFixed(2)}° above its target (< 0.9°, OrbitControls lifts it)` : null;
      if (bad && !worst) worst = `${s.at} at u ${(k / 40).toFixed(2)}: camera ${bad}`;
    }
    if (worst) out.push(worst);
  }
  return out;
}

// ---------------------------------------------------------------- logic block of the built page (pure JS, no DOM)
const LOGIC_NAMES = "DIAL, STATIONS, st, PART, STACK, HB, FEED, PICK, ESC, DELTA, DM, T3, T3G, SCARA, TRAY, CAP, TOOL, PRESS, PZ, VISION, RJ, BIN, " +
  "DEFECTS, FLOOR, FALL_T, segs, marks, feeds, trayLog, parts, assemblies, DURATION, CYCLE, STATS, minClear, peakV, peakW, " +
  "deltaPose, deltaIK, t3Pose, t3FK, dialTurn, dialAngle, nestXY, pressState, visionState, rejectState, rejectTCP, trayPose, trayState, feederState, segAt";
export function loadLogic(htmlFile) {
  const html = readFileSync(htmlFile, "utf8");
  const m = html.match(/\/\/ @@logic-start[^\n]*\n([\s\S]*?)\/\/ @@logic-end/);
  if (!m) throw new Error(`${htmlFile}: logic block (// @@logic-start ... // @@logic-end) not found; run node tools/build.mjs`);
  const names = LOGIC_NAMES.split(",").map((s) => s.trim());
  // names the block does not define (older or newer logic) come back undefined instead of failing the whole load
  const body = names.map((k) => `${k}: (typeof ${k} === "undefined" ? undefined : ${k})`).join(", ");
  return new Function("console", `${m[1]}\nreturn { ${body} };`)({ log() {}, warn() {}, error() {} });
}
