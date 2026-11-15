// Procedural soundtrack of the film: 48 kHz stereo 16-bit WAV in pure Node, deterministic (seeded).
// It evaluates the logic block of the built page (like tests/run.mjs) and maps every machine sound to FILM time through
// the plan's segments: a sound at sim time s plays in every segment whose sim range holds it, at that segment's film time.
// Motion sounds follow the real speeds of the program (servo whines and whooshes from the joint speeds, the press ram,
// the cam indexer, the tray shuttle); one-shots come from the segments (valves, fingers, snaps, end stops, the clatter of
// a reject into the bin). Slow-motion segments stretch the sounds and lower their pitch a little. Each source is panned
// and attenuated from its position relative to the segment's camera. Bowl hum (three detuned 100 Hz drives with
// harmonics and a part rattle) and room tone run under the whole film. Mix: headroom, a small hall reverb, fades, a
// look-ahead limiter and a peak normalise to -3 dBFS.
// Usage: node tools/audio.mjs [--plan film/plan.json] [--out _frames/film.wav] [--html index.html] [--seed N] [--quiet]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadPlan, loadLogic, filmLayers } from "./lib/film-plan.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SR = 48000;
const TAU = 2 * Math.PI;
const BLOCK = 256;                                    // control-rate block (5.3 ms)
const db = (v) => 10 ** (v / 20);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------- primitives
const SIN_N = 8192, SINT = new Float64Array(SIN_N + 1);
for (let i = 0; i <= SIN_N; i++) SINT[i] = Math.sin((TAU * i) / SIN_N);
function sin1(ph) {                                   // sin(2 pi ph), ph in cycles
  ph -= Math.floor(ph);
  const x = ph * SIN_N, i = x | 0;
  return SINT[i] + (SINT[i + 1] - SINT[i]) * (x - i);
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(...xs) {                                // stable 32-bit hash of numbers and strings
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    const s = typeof x === "number" ? x.toFixed(6) : String(x);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  }
  return h;
}
// RBJ biquad, transposed direct form II
class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; this.z1 = 0; this.z2 = 0; }
  set(type, f, q) {
    const w = (TAU * clamp(f, 10, SR * 0.45)) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === "bp") { b0 = al; b1 = 0; b2 = -al; }
    else if (type === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }   // hp
    const a0 = 1 + al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * c) / a0; this.a2 = (1 - al) / a0;
    return this;
  }
  run(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}
const onePole = (f) => 1 - Math.exp((-TAU * f) / SR);

// ---------------------------------------------------------------- one-shot builders (mono, film samples)
// Each returns { buf: Float32Array, n } of the sound. ps = pitch factor, st = decay stretch (slow motion).
function shot(len) { return new Float32Array(Math.max(1, Math.ceil(len * SR))); }
function addNoiseBurst(b, i0, amp, { a = 0.0003, tau = 0.0015, hp = 1000, lp = 9000 }, rnd, st = 1) {
  const n = Math.min(b.length - i0, Math.ceil((a + tau * st * 7) * SR));
  const kh = onePole(hp), kl = onePole(lp);
  let h = 0, l = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = t < a ? t / a : Math.exp(-(t - a) / (tau * st));
    const x = rnd() * 2 - 1;
    h += kh * (x - h);
    l += kl * (x - h - l);
    b[i0 + i] += amp * env * l * 2.2;
  }
}
function addModes(b, i0, amp, modes, rnd, ps = 1, st = 1) {   // modes: [[f, tau, g], ...] damped sines
  for (const [f0, tau0, g] of modes) {
    const f = f0 * ps * (1 + (rnd() - 0.5) * 0.03), tau = tau0 * st, ph = rnd();
    const n = Math.min(b.length - i0, Math.ceil(tau * 7 * SR));
    for (let i = 0; i < n; i++) { const t = i / SR; b[i0 + i] += amp * g * Math.exp(-t / tau) * sin1(ph + f * t); }
  }
}
function addThump(b, i0, amp, f0, f1, tau, ps = 1, st = 1) {   // low sine with a falling pitch
  const n = Math.min(b.length - i0, Math.ceil(tau * st * 7 * SR));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = (f1 + (f0 - f1) * Math.exp(-t / (tau * st * 0.5))) * ps;
    ph += f / SR;
    b[i0 + i] += amp * Math.exp(-t / (tau * st)) * Math.min(1, t / 0.0008) * sin1(ph);
  }
}
function addHiss(b, i0, amp, dur, { a = 0.005, r = 0.05, f = 4000, q = 0.7, hp = 0 }, rnd, ps = 1, st = 1) {
  const bq = new Biquad().set("bp", f * ps, q), hq = hp ? new Biquad().set("hp", hp * ps, 0.7) : null;
  const n = Math.min(b.length - i0, Math.ceil((dur + r * st * 6) * SR));
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = t < a ? t / a : t < dur ? 1 : Math.exp(-(t - dur) / (r * st));
    let x = bq.run(rnd() * 2 - 1);
    if (hq) x = hq.run(x);
    b[i0 + i] += amp * env * x * 2.5;
  }
}

// Event kinds -> sound. e = { kind, s, pos, ... }; k = time stretch (1 / rate), ps = pitch factor.
const PLASTIC = [[1150, 0.018, 1], [2650, 0.012, 0.7], [4050, 0.008, 0.45], [6200, 0.005, 0.25]];
function renderEvent(e, k, ps, rnd) {
  const st = Math.sqrt(Math.max(1, k));               // impacts ring a little longer in slow motion
  const valve = (b, i0, lv) => { addNoiseBurst(b, i0, db(lv), { a: 0.0002, tau: 0.0009, hp: 1800, lp: 10000 }, rnd, st); addModes(b, i0, db(lv - 7), [[2900, 0.005, 1], [4700, 0.003, 0.5]], rnd, ps, st); };
  switch (e.kind) {
    case "valve": { const b = shot(0.06 * st); valve(b, 0, -26); return b; }
    case "exhaust": {
      const b = shot((0.09 + 0.07) * k + 0.4);
      valve(b, 0, -28);
      addHiss(b, Math.round(0.002 * SR), db(-29), 0.03 * k, { a: 0.003, r: 0.05, f: 5200, q: 0.55 }, rnd, ps, st);
      return b;
    }
    case "fill": { const b = shot(0.05 * k + 0.3); addHiss(b, 0, db(-34), 0.025 * k, { a: 0.003, r: 0.025, f: 6000, q: 0.6 }, rnd, ps, st); return b; }
    case "finger": { const b = shot(0.05 * st); addModes(b, 0, db(-30), [[3400, 0.004, 1], [5200, 0.0028, 0.6]], rnd, ps, st); addNoiseBurst(b, 0, db(-34), { tau: 0.0006, hp: 2500 }, rnd, st); return b; }
    case "housingTap": { const b = shot(0.06 * st); addModes(b, 0, db(-31), [[1650, 0.006, 1], [2900, 0.004, 0.6], [4300, 0.003, 0.35]], rnd, ps, st); return b; }
    case "capTap": { const b = shot(0.05 * st); addModes(b, 0, db(-33), [[2100, 0.005, 1], [3600, 0.0035, 0.5]], rnd, ps, st); return b; }
    case "springTink": {
      const b = shot(0.4 * st), modes = [[3150, 0.045, 1], [5240, 0.03, 0.7], [7420, 0.02, 0.5], [9850, 0.012, 0.3]];
      addModes(b, 0, db(-25), modes, rnd, ps, st);
      addModes(b, Math.round(0.014 * k * SR), db(-35), modes.map(([f, t, g]) => [f * 1.01, t * 0.7, g]), rnd, ps, st);
      return b;
    }
    case "indexStart": {
      const b = shot(0.25 * st);
      addThump(b, 0, db(-25), 120, 82, 0.03, ps, st);
      addNoiseBurst(b, 0, db(-31), { a: 0.0004, tau: 0.002, hp: 200, lp: 3000 }, rnd, st);
      return b;
    }
    case "indexStop": {
      const b = shot(0.5 * st);
      addThump(b, 0, db(-17), 82, 60, 0.065, ps, st);
      addModes(b, 0, db(-25), [[1850, 0.012, 1], [2720, 0.008, 0.55], [4100, 0.005, 0.3]], rnd, ps, st);
      addNoiseBurst(b, 0, db(-24), { a: 0.0003, tau: 0.004, hp: 150, lp: 2600 }, rnd, st);
      return b;
    }
    case "snap": {
      const b = shot(0.25 * st), lv = e.hooks >= 2 ? -15 : -19;
      addNoiseBurst(b, 0, db(lv), { a: 0.00015, tau: 0.0008, hp: 1200, lp: 12000 }, rnd, st);
      addModes(b, 0, db(lv - 1), [[2350, 0.018, 1], [3900, 0.012, 0.7], [6100, 0.007, 0.45], [8300, 0.004, 0.25]], rnd, ps, st);
      addThump(b, 0, db(lv - 7), 260, 190, 0.014, ps, st);
      if (e.hooks >= 2) addModes(b, Math.round(0.0016 * k * SR), db(lv - 5), [[2480, 0.014, 1], [4150, 0.009, 0.6]], rnd, ps, st);
      return b;
    }
    case "latch": { const b = shot(0.06 * st); addModes(b, 0, db(e.hooks >= 2 ? -30 : -35), [[3000, 0.006, 1], [4700, 0.004, 0.5]], rnd, ps, st); return b; }
    case "visionTick": {
      const b = shot(0.05);
      addModes(b, 0, db(-35), [[4400, 0.0025, 1], [8800, 0.0015, 0.5]], rnd, ps, 1);
      return b;
    }
    case "cylinder": {   // pneumatic cylinder stroke: valve, air, cushioned end stop
      const d = e.d * k, b = shot(d + 0.5 * st);
      valve(b, 0, -25);
      addHiss(b, Math.round(0.004 * SR), db(-32), d, { a: 0.015, r: 0.04, f: 3600, q: 0.5 }, rnd, ps, st);
      const i1 = Math.round(d * SR);
      addThump(b, i1, db(-25), 190, 140, 0.02, ps, st);
      addModes(b, i1, db(-31), [[1200, 0.01, 1], [2600, 0.006, 0.5]], rnd, ps, st);
      return b;
    }
    case "chute": {      // part sliding down the reject chute
      const d = e.d * k, b = shot(d + 0.2);
      addHiss(b, 0, db(-36), d, { a: 0.04 * k, r: 0.03, f: 1800, q: 0.6 }, rnd, ps, st);
      for (let j = 0; j < 4; j++) addModes(b, Math.round((0.15 + 0.2 * j) * d * SR), db(-38 - 2 * j), PLASTIC, rnd, ps * 1.1, st * 0.6);
      return b;
    }
    case "clatter": {    // housing + spring + cap landing in the reject bin, with bounces
      const b = shot(0.6 * k + 0.6), hits = [[0, 1], [0.07, 0.52], [0.125, 0.3], [0.165, 0.18], [0.195, 0.1]];
      for (const [dt, a] of hits) {
        const i0 = Math.round(dt * k * SR), lv = -13 + 20 * Math.log10(a);
        addNoiseBurst(b, i0, db(lv), { a: 0.0002, tau: 0.0015, hp: 700, lp: 9000 }, rnd, st);
        addModes(b, i0, db(lv - 2), PLASTIC.map(([f, t, g]) => [f * (0.92 + 0.16 * rnd()), t, g]), rnd, ps, st);
        addThump(b, i0, db(lv - 6), 175, 150, 0.03, ps, st);
        if (dt === 0) addModes(b, i0 + 40, db(-27), [[3150, 0.03, 1], [5240, 0.02, 0.6]], rnd, ps, st);   // the spring
      }
      return b;
    }
    case "trayTap": { const b = shot(0.06 * st); addModes(b, 0, db(-32), [[1400, 0.006, 1], [2500, 0.004, 0.5]], rnd, ps, st); return b; }
    case "shuttleStop": {
      const b = shot(0.4 * st);
      addThump(b, 0, db(-23), 130, 100, 0.035, ps, st);
      addModes(b, 0, db(-29), [[900, 0.015, 1], [1900, 0.01, 0.4]], rnd, ps, st);
      return b;
    }
    case "trayLand": {
      const b = shot(0.5 * st);
      addThump(b, 0, db(-21), 230, 200, 0.05, ps, st);
      addModes(b, 0, db(-25), [[620, 0.03, 1], [1340, 0.02, 0.6], [2450, 0.012, 0.4]], rnd, ps, st);
      addNoiseBurst(b, 0, db(-27), { a: 0.0003, tau: 0.003, hp: 300, lp: 4000 }, rnd, st);
      return b;
    }
    case "escape": {     // 2-pin escapement: valve, pins, part arriving in the nest
      const d = e.d * k, b = shot(d + 0.2 * st);
      valve(b, 0, -31);
      addModes(b, Math.round(0.012 * k * SR), db(-33), [[4100, 0.004, 1], [6300, 0.0025, 0.5]], rnd, ps, st);
      addHiss(b, 0, db(-38), 0.03 * k, { a: 0.003, r: 0.02, f: 5000, q: 0.6 }, rnd, ps, st);
      const i1 = Math.round(d * SR);
      if (e.part === "B") addModes(b, i1, db(-35), [[3300, 0.02, 1], [5600, 0.012, 0.5]], rnd, ps, st);
      else addModes(b, i1, db(-33), [[1700, 0.005, 1], [3000, 0.0035, 0.5]], rnd, ps, st);
      return b;
    }
    default: throw new Error(`audio: unknown event kind ${e.kind}`);
  }
}

// ---------------------------------------------------------------- sim-time events and motion from the logic
function simEvents(L) {
  const ev = [], add = (s, kind, pos, x = {}) => ev.push({ s, kind, pos, ...x });
  const IDX = [0, 0, 0.08], CAM5 = [L.st(5).x, L.st(5).y, 0.46], BINP = [L.BIN.x, L.BIN.y, 0.1];
  for (const g of L.segs.dial) {
    if (g.kind !== "index") continue;
    const m0 = g.t0 + L.DIAL.sig / 2;
    add(m0, "indexStart", IDX); add(m0 + L.DIAL.index, "indexStop", IDX);
  }
  for (const g of L.segs.delta) {
    if (g.kind !== "io") continue;
    const p = g.from;
    if (g.grip[1] > g.grip[0]) { add(g.t0, "valve", p); add(g.t0 + 0.004, "fill", p); add(g.t1, "finger", p); }
    else {
      add(g.t0, "exhaust", p);
      if (/spring/i.test(g.label)) add(g.t0 + (L.FALL_T ?? 0.062), "springTink", [p[0], p[1], L.HB + 0.004]);
      else if (/cap/i.test(g.label)) add(g.t0 + 0.004, "capTap", p);
      else if (/housing/i.test(g.label)) add(g.t0 + 0.006, "housingTap", p);
    }
  }
  const S4 = [L.st(4).x, L.st(4).y, 0.26];
  for (const g of L.segs.press) {
    const hooks = g.test?.cond?.hooks ?? 2;
    if (g.kind === "press") {
      // the hooks let go between x = 2.4 and 2.75 mm of the 4.5 mm stroke (pressForce): the audible snap
      const over = (L.PRESS.over ?? 0.0045) * 1000, f = clamp(2.6 / over, 0, 1);
      add(g.t0 + f * (g.t1 - g.t0), "snap", S4, { hooks });
    }
    if (g.kind === "lin" && /latch/i.test(g.label)) add(g.t1, "latch", S4, { hooks: (L.assemblies?.get(g.a)?.defect?.kind === "hook") ? 1 : 2 });
  }
  for (const g of L.segs.vision) if (g.kind === "inspect") add(g.t0 + 0.004, "visionTick", CAM5);
  let nRej = 0;
  for (const g of L.segs.reject) {
    if (g.kind === "wait") continue;
    const p = L.rejectTCP(L.rejectState((g.t0 + g.t1) / 2));
    if (g.kind === "lin") add(g.t0, "cylinder", p, { d: g.t1 - g.t0 });
    else if (g.grip[1] > g.grip[0]) { add(g.t0, "valve", p); add(g.t1, "finger", p); }
    else {
      add(g.t0, "exhaust", p);
      const drop = L.RJ.tDrop ?? 0.45, bin = L.marks.reject[nRej++]?.bin ?? BINP;
      add(g.t0 + 0.06, "chute", [p[0], p[1] - 0.08, 0.3], { d: drop - 0.1 });
      add(g.t0 + drop, "clatter", [bin[0], bin[1], 0.08]);
    }
  }
  for (const g of L.segs.scara) {
    if (g.kind !== "io") continue;
    const p = L.t3FK(g.q1).tcp;
    if (g.grip[1] > g.grip[0]) { add(g.t0, "valve", p); add(g.t1, "finger", p); }
    else { add(g.t0, "exhaust", p); if (/slot/i.test(g.label)) add(g.t0 + 0.003, "trayTap", p); }
  }
  for (const g of L.segs.tray) {
    const m = g.m ?? 0, p = L.trayPose(Math.max(0, m), g.t1) || [L.TRAY.cx, L.TRAY.cy, L.TRAY.top];
    if (g.kind === "shuttle") add(g.t1, "shuttleStop", p);
    if (g.kind === "io") {
      add(g.t0, "cylinder", [L.TRAY.cx + L.TRAY.out, L.TRAY.cy, 0.2], { d: g.t1 - g.t0 - 0.05 });
      add(g.t1, "trayLand", [L.TRAY.cx + L.TRAY.out, L.TRAY.cy, L.TRAY.top]);
    }
  }
  L.FEED.forEach((f) => {
    for (const g of L.segs[f.actor]) if (g.kind === "io") add(g.t0, "escape", [f.x, f.y, 0.23], { d: g.t1 - g.t0, part: f.part });
  });
  return ev.sort((a, b) => a.s - b.s);
}

// Speeds and positions of the moving machines at sim time s (central differences, h = 1 ms).
function motionModel(L) {
  const h = 0.001, D = L.DURATION;
  const at = (s) => clamp(s, 0, D);
  const delta = (s) => {
    const a = L.deltaPose(at(s - h / 2)).p, b = L.deltaPose(at(s + h / 2)).p;
    const ja = L.deltaIK(a), jb = L.deltaIK(b);
    const w = ja && jb ? [0, 1, 2].map((i) => Math.abs(jb[i] - ja[i]) / h) : [0, 0, 0];
    const v = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / h;
    return { w, v, pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + L.DELTA.zb) / 2] };
  };
  const scara = (s) => {
    const a = L.t3Pose(at(s - h / 2)).q, b = L.t3Pose(at(s + h / 2)).q;
    return { w: [0, 1, 2, 3].map((i) => Math.abs(b[i] - a[i]) / h), pos: L.t3FK(b).tcp };
  };
  const press = (s) => {
    const a = L.pressState(at(s - h / 2)), b = L.pressState(at(s + h / 2));
    return { v: Math.abs(b.z - a.z) / h, F: b.F };
  };
  const dial = (s) => {
    const g = L.segAt(L.segs.dial, at(s));
    let on = 0;
    if (g.kind === "index") {
      const m0 = g.t0 + L.DIAL.sig / 2, m1 = m0 + L.DIAL.index;
      on = clamp((s - m0 + 0.02) / 0.03, 0, 1) * clamp((m1 + 0.03 - s) / 0.04, 0, 1);
    }
    return { on, v: Math.abs(L.dialTurn(at(s + h / 2)) - L.dialTurn(at(s - h / 2))) / h };
  };
  const ntr = 1 + (L.trayLog?.swaps?.length ?? 0);
  const tray = (s) => {
    let v = 0, vz = 0, pos = [L.TRAY.cx, L.TRAY.cy, L.TRAY.top];
    for (let m = 0; m < ntr; m++) {
      const a = L.trayPose(m, at(s - h / 2)), b = L.trayPose(m, at(s + h / 2));
      if (!a || !b) continue;
      const vx = Math.abs(b[0] - a[0]) / h, vzz = Math.abs(b[2] - a[2]) / h;
      if (vx > v) { v = vx; pos = b; }
      vz = Math.max(vz, vzz);
    }
    const g = L.segAt(L.segs.tray, at(s));
    return { v: g.kind === "shuttle" ? v : 0, push: g.kind === "io" ? v : 0, lift: vz, pos };
  };
  // normalising maxima over the run
  const mx = { dw: 1e-6, dv: 1e-6, sw: [1e-6, 1e-6, 1e-6, 1e-6], pv: 1e-6, tv: 1e-6, dial: 1e-6 };
  for (let s = 0; s < D; s += 0.004) {
    const d = delta(s); mx.dw = Math.max(mx.dw, ...d.w); mx.dv = Math.max(mx.dv, d.v);
    const q = scara(s); q.w.forEach((w, i) => { mx.sw[i] = Math.max(mx.sw[i], w); });
    mx.pv = Math.max(mx.pv, press(s).v); mx.tv = Math.max(mx.tv, tray(s).v); mx.dial = Math.max(mx.dial, dial(s).v);
  }
  return { delta, scara, press, dial, tray, mx };
}

// ---------------------------------------------------------------- listener: the segment's camera
// Distance law (0.5 m / d)^0.7, sources off the view axis up to 5 dB quieter, pan from the camera's right vector.
function hear(cam, pos) {
  const fx = cam.target[0] - cam.pos[0], fy = cam.target[1] - cam.pos[1], fz = cam.target[2] - cam.pos[2];
  const fn = Math.hypot(fx, fy, fz) || 1;
  const rx = fy / fn, ry = -fx / fn, rn = Math.hypot(rx, ry) || 1;
  const dx = pos[0] - cam.pos[0], dy = pos[1] - cam.pos[1], dz = pos[2] - cam.pos[2], d = Math.hypot(dx, dy, dz);
  const pan = clamp(((dx * rx + dy * ry) / rn) / Math.max(d, 0.05), -1, 1) * 0.8;
  const cosF = (dx * fx + dy * fy + dz * fz) / fn / Math.max(d, 1e-6);
  const g = Math.pow(0.5 / Math.max(0.5, d), 0.7) * (0.56 + 0.44 * Math.max(0, cosF) ** 2);
  return { g, pan, send: 0.5 * Math.pow(0.5 / Math.max(0.5, d), 0.25) };
}
const panL = (p) => Math.cos(((p + 1) * Math.PI) / 4), panR = (p) => Math.sin(((p + 1) * Math.PI) / 4);

// ---------------------------------------------------------------- the render
export function renderFilmAudio({ plan, logic: L, seed, levels = {}, log = console.log }) {
  const A = { seed: 7, fadeIn: 1.0, fadeOut: 1.5, peakDb: -3, reverb: 0.2, slowPitch: 0.12, ...(plan.audio || {}) };
  if (seed !== undefined) A.seed = seed;
  const lv = { ...(A.levels || {}), ...levels };        // per-group trims in dB: bowls room delta scara press dial tray reject feeders events
  const trim = (k) => db(lv[k] ?? 0);
  const N = Math.ceil(plan.total * SR), NB = Math.ceil(N / BLOCK) + 1;
  const outL = new Float32Array(N), outR = new Float32Array(N), send = new Float32Array(N);
  const t0 = Date.now();
  const events = simEvents(L), mot = motionModel(L);
  const GROUP = { valve: "events", exhaust: "events", fill: "events", finger: "events", housingTap: "delta", capTap: "delta", springTink: "delta",
    indexStart: "dial", indexStop: "dial", snap: "press", latch: "press", visionTick: "events", cylinder: "reject", chute: "reject", clatter: "reject",
    trayTap: "scara", shuttleStop: "tray", trayLand: "tray", escape: "feeders" };

  // mono buffer b into the stereo mix at sample i0, with gain, pan (equal power + up to 0.4 ms interaural delay) and send
  const mixIn = (b, i0, g, pan, snd, from = 0, to = b.length) => {
    const gl = g * panL(pan), gr = g * panR(pan), dL = pan > 0 ? Math.round(pan * 19) : 0, dR = pan < 0 ? Math.round(-pan * 19) : 0;
    for (let i = from; i < to; i++) {
      const v = b[i], jl = i0 + i + dL, jr = i0 + i + dR, j = i0 + i;
      if (jl >= 0 && jl < N) outL[jl] += v * gl;
      if (jr >= 0 && jr < N) outR[jr] += v * gr;
      if (j >= 0 && j < N) send[j] += v * g * snd;
    }
  };

  // ---- per segment: one-shots and motion sounds
  let nEv = 0;
  for (const seg of plan.segments) {
    const [s0, s1] = seg.sim, rate = seg.rate;
    const segGain = db(seg.audio?.gainDb ?? 0) * (seg.audio?.gain ?? 1);
    const ps = rate > 0 ? Math.pow(Math.min(rate, 4), A.slowPitch) : 1, k = rate > 0 ? 1 / rate : 1;
    const sendMul = 1 + 1.2 * clamp(1 - rate, 0, 1);  // more hall in slow motion
    // weight of this segment at film time t: dissolves fade over the overlap, cuts over 8 ms around the cut
    const next = plan.segments[seg.i + 1];
    const inW = seg.xfade > 0 ? seg.xfade : 0.008, outW = next && next.xfade > 0 ? next.xfade : 0.008;
    const A0 = seg.xfade > 0 ? seg.T0 : seg.T0 - 0.004, B1 = next && next.xfade > 0 ? seg.T1 : seg.T1 + 0.004;
    const wAt = (t) => {
      const a = seg.i === 0 ? 1 : clamp((t - A0) / inW, 0, 1), b = !next ? 1 : clamp((B1 - t) / outW, 0, 1);
      return Math.sin((Math.PI / 2) * a) * Math.sin((Math.PI / 2) * b);
    };
    const camAtT = (t) => seg.camAt(clamp((t - seg.T0) / seg.dur, 0, 1));
    // one-shots whose sim time is inside this segment
    if (rate > 0) {
      for (const e of events) {
        if (e.s < s0 || e.s >= s1) continue;
        const t = seg.T0 + (e.s - s0) / rate, w = wAt(t);
        if (w < 1e-3) continue;
        const rnd = mulberry(hash(A.seed, e.kind, e.s, seg.i));
        const b = renderEvent(e, k, ps, rnd), h = hear(camAtT(t), e.pos);
        mixIn(b, Math.round(t * SR), h.g * w * segGain * trim(GROUP[e.kind] || "events"), h.pan, h.send * sendMul);
        nEv++;
      }
    }
    // motion sounds, block by block
    const b0 = Math.max(0, Math.floor(A0 * SR / BLOCK)), b1 = Math.min(NB - 1, Math.ceil(B1 * SR / BLOCK));
    if (b1 <= b0) continue;
    const nb = b1 - b0 + 1;
    const P = { t: new Float64Array(nb), w: new Float64Array(nb) };
    const voices = [];   // { gl, gr, snd (per block), f (per block), amp (per block), harm, phase }
    const mk = (name, harm, group) => {
      const v = { name, harm, group, f: new Float64Array(nb), a: new Float64Array(nb), gl: new Float64Array(nb), gr: new Float64Array(nb), snd: new Float64Array(nb), ph: harm.map(() => 0), noise: harm === null };
      voices.push(v);
      return v;
    };
    const HM = [1, 0.5, 0.33, 0.2], HS = [1, 0.45, 0.25];
    const dm = [0, 1, 2].map((i) => mk(`delta${i}`, HS, "delta")), dw = mk("deltaWhoosh", null, "delta");
    const sm = [mk("scara1", HS, "scara"), mk("scara2", HS, "scara"), mk("scaraZ", [1, 0.4], "scara")];
    const pw = mk("pressWhine", HM, "press"), pl = mk("pressLoad", [1, 0.6, 0.4, 0.3, 0.2], "press");
    const xw = mk("dialWhir", [1, 0.6, 0.42, 0.3, 0.18], "dial"), xr = mk("dialRoller", null, "dial");
    const tw = mk("trayMotor", HM, "tray"), tb = mk("trayBelt", null, "tray"), tp = mk("trayPush", null, "tray");
    for (let j = 0; j < nb; j++) {
      const t = ((b0 + j) * BLOCK) / SR, s = clamp(s0 + (t - seg.T0) * rate, 0, L.DURATION);
      P.t[j] = t; P.w[j] = wAt(t) * segGain;
      const cam = camAtT(t), set = (v, f, a, pos) => {
        const h = hear(cam, pos), g = a * h.g * P.w[j] * trim(v.group);
        v.f[j] = f * ps; v.a[j] = 1; v.gl[j] = g * panL(h.pan); v.gr[j] = g * panR(h.pan); v.snd[j] = g * h.send * sendMul;
      };
      const d = mot.delta(s);
      d.w.forEach((w, i) => { const x = w / mot.mx.dw; set(dm[i], 70 + 560 * x, db(-37) * Math.pow(x, 0.8), d.pos); });
      { const x = d.v / mot.mx.dv; set(dw, 260 + 1500 * x, db(-31) * Math.pow(x, 1.6), d.pos); }
      const q = mot.scara(s);
      { const x = q.w[0] / mot.mx.sw[0]; set(sm[0], 150 + 430 * x, db(-35) * Math.pow(x, 0.8), q.pos); }
      { const x = q.w[1] / mot.mx.sw[1]; set(sm[1], 220 + 540 * x, db(-35) * Math.pow(x, 0.8), q.pos); }
      { const x = q.w[2] / mot.mx.sw[2]; set(sm[2], 380 + 900 * x, db(-40) * Math.pow(x, 0.8), q.pos); }
      const pr = mot.press(s), S4 = [L.st(4).x, L.st(4).y, 0.5];
      { const x = pr.v / mot.mx.pv; set(pw, 90 + 650 * x, db(-31) * Math.pow(x, 0.7), S4); }
      set(pl, 105 + 3.2 * pr.F, db(-35) * Math.pow(clamp(pr.F / 22, 0, 1), 0.7), S4);
      const dl = mot.dial(s), IX = [-0.2, 0, 0.08];
      set(xw, 148, db(-29) * dl.on, IX);
      { const x = dl.v / mot.mx.dial; set(xr, 700 + 900 * x, db(-34) * x, [0, 0, 0.15]); }
      const tr = mot.tray(s);
      { const x = tr.v / mot.mx.tv; set(tw, 130 + 300 * x, db(-28) * Math.pow(x, 0.7), tr.pos); set(tb, 900 + 1500 * x, db(-33) * x, tr.pos); }
      { const x = clamp(tr.push / 0.5, 0, 1); set(tp, 700 + 900 * x, db(-31) * x + db(-38) * clamp(tr.lift / 0.2, 0, 1), tr.pos); }
    }
    // synthesis: block-linear interpolation of frequency and gains
    for (const v of voices) {
      const rnd = mulberry(hash(A.seed, v.name, seg.i)), bq = new Biquad();
      let ph = v.ph.slice(), jitter = 0;
      for (let j = 0; j < nb - 1; j++) {
        const gl0 = v.gl[j], gl1 = v.gl[j + 1], gr0 = v.gr[j], gr1 = v.gr[j + 1], sn0 = v.snd[j], sn1 = v.snd[j + 1];
        const base = (b0 + j) * BLOCK;
        if (Math.max(Math.abs(gl0), Math.abs(gl1), Math.abs(gr0), Math.abs(gr1)) < 1e-7) {
          if (!v.noise) for (let h = 0; h < ph.length; h++) ph[h] += ((h + 1) * v.f[j] * BLOCK) / SR;
          continue;
        }
        if (v.noise) bq.set("bp", (v.f[j] + v.f[j + 1]) / 2, 0.8);
        for (let i = 0; i < BLOCK; i++) {
          const n = base + i;
          if (n >= N) break;
          const u = i / BLOCK, f = v.f[j] + (v.f[j + 1] - v.f[j]) * u;
          let x;
          if (v.noise) x = bq.run(rnd() * 2 - 1) * 2.4;
          else {
            jitter += 0.002 * (rnd() - 0.5) - 0.002 * jitter;     // a little drift keeps the whine alive
            x = 0;
            for (let h = 0; h < v.harm.length; h++) { ph[h] += ((h + 1) * f * (1 + jitter)) / SR; x += v.harm[h] * sin1(ph[h]); }
          }
          const gl = gl0 + (gl1 - gl0) * u, gr = gr0 + (gr1 - gr0) * u;
          outL[n] += x * gl; outR[n] += x * gr; send[n] += x * (sn0 + (sn1 - sn0) * u);
        }
      }
    }
  }

  // ---- under the whole film: bowl feeders and room tone, panned from the (blended) cameras
  const bowlDefs = [
    { id: "A", f0: 100.0, size: 1.0, modes: [2300, 3400, 5100], tau: 0.006, rate: 90 },
    { id: "B", f0: 100.35, size: 0.72, modes: [4200, 6100, 7800], tau: 0.012, rate: 150 },
    { id: "C", f0: 99.78, size: 0.9, modes: [1500, 2400, 3300], tau: 0.0035, rate: 70 },
  ].map((b, i) => {
    const F = L.FEED[i], ux = F.ux, uy = F.uy;
    const c = BOWL_CENTRES[b.id];
    return { ...b, pos: [c[0], c[1], 0.18], lin: [F.x + ux * 0.25, F.y + uy * 0.25, 0.15] };
  });
  const HUM = [1, 0.55, 0.32, 0.22, 0.12, 0.08];
  const nbAll = Math.ceil(N / BLOCK);
  const G = bowlDefs.map(() => ({ gl: new Float64Array(nbAll + 1), gr: new Float64Array(nbAll + 1), snd: new Float64Array(nbAll + 1) }));
  const pitch = new Float64Array(nbAll + 1);
  let pSm = 1;
  for (let j = 0; j <= nbAll; j++) {
    const t = Math.min(plan.total, (j * BLOCK) / SR), layers = filmLayers(plan, t);
    let pt = 0;
    for (const ly of layers) pt += ly.w * (ly.seg.rate > 0 ? Math.pow(Math.min(ly.seg.rate, 4), A.slowPitch * 0.5) : 1);
    pSm += (pt - pSm) * (1 - Math.exp(-BLOCK / SR / 0.15));
    pitch[j] = pSm;
    bowlDefs.forEach((b, i) => {
      let gl = 0, gr = 0, sn = 0;
      for (const ly of layers) {
        const h = hear(ly, b.pos), g = ly.w * h.g * trim("bowls");
        gl += g * panL(h.pan); gr += g * panR(h.pan); sn += g * h.send;
      }
      G[i].gl[j] = gl; G[i].gr[j] = gr; G[i].snd[j] = sn;
    });
  }
  bowlDefs.forEach((b, i) => {
    const rnd = mulberry(hash(A.seed, "bowl", b.id)), g = G[i];
    const ph = HUM.map(() => rnd()), am1 = rnd(), am2 = rnd();
    // rattle: a 100 Hz-synchronous impulse train exciting three modes; plus a fine sizzle
    const modes = b.modes.map((f) => { const r = Math.exp(-1 / (b.tau * SR)), w = (TAU * f) / SR; return { c: 2 * r * Math.cos(w), r2: r * r, y1: 0, y2: 0, g: rnd() * 0.5 + 0.5 }; });
    const sizz = new Biquad().set("hp", 4500, 0.7);
    let vph = rnd();
    for (let n = 0; n < N; n++) {
      const j = (n / BLOCK) | 0, u = (n % BLOCK) / BLOCK, p = pitch[j] + (pitch[j + 1] - pitch[j]) * u;
      const t = n / SR, f = b.f0 * p;
      vph += f / SR;
      const am = 1 + 0.07 * sin1(am1 + 0.37 * t) + 0.04 * sin1(am2 + 1.13 * t);
      let x = 0;
      for (let h = 0; h < HUM.length; h++) x += HUM[h] * sin1(ph[h] + (h + 1) * vph);
      x *= db(-33) * b.size * am;
      // impulses cluster near the top of each vibration stroke
      const s1v = sin1(vph), prob = (b.rate / SR) * (1 + 0.95 * s1v) * 1.2;
      let e = 0;
      if (rnd() < prob) e = (0.25 + 0.75 * rnd() ** 2) * (rnd() < 0.5 ? -1 : 1);
      let y = 0;
      for (const m of modes) { const v = m.c * m.y1 - m.r2 * m.y2 + e * m.g; m.y2 = m.y1; m.y1 = v; y += v; }
      x += y * db(-41) * 0.06;
      x += sizz.run(rnd() * 2 - 1) * Math.max(0, s1v) ** 4 * db(-52);
      const gl = g.gl[j] + (g.gl[j + 1] - g.gl[j]) * u, gr = g.gr[j] + (g.gr[j + 1] - g.gr[j]) * u;
      outL[n] += x * gl; outR[n] += x * gr; send[n] += x * (g.snd[j] + (g.snd[j + 1] - g.snd[j]) * u) * 0.6;
    }
  });
  {   // room tone: decorrelated rumble and air per channel, constant level
    const rL = mulberry(hash(A.seed, "roomL")), rR = mulberry(hash(A.seed, "roomR")), kr = onePole(110), ka = onePole(2200), kh = onePole(250);
    let a1 = 0, a2 = 0, b1 = 0, b2 = 0, c1 = 0, c2 = 0, d1 = 0, d2 = 0;
    const gR = db(-43) * trim("room"), gA = db(-51) * trim("room");
    for (let n = 0; n < N; n++) {
      const xl = rL() * 2 - 1, xr = rR() * 2 - 1;
      a1 += kr * (xl - a1); a2 += kr * (a1 - a2); b1 += kr * (xr - b1); b2 += kr * (b1 - b2);
      c1 += ka * (xl - c1); c2 += kh * (c1 - c2); d1 += ka * (xr - d1); d2 += kh * (d1 - d2);
      outL[n] += a2 * 6 * gR + (c1 - c2) * 1.5 * gA;
      outR[n] += b2 * 6 * gR + (d1 - d2) * 1.5 * gA;
    }
  }
  for (const fx of A.fx || []) renderFx(fx, outL, outR, send, N, A.seed);

  // ---- hall reverb on the send bus (Freeverb-style: 8 combs + 4 allpasses per channel)
  reverb(send, outL, outR, N, A.reverb);

  // ---- master: fades, look-ahead limiter, peak normalise
  const fi = Math.round(A.fadeIn * SR), fo = Math.round(A.fadeOut * SR);
  for (let n = 0; n < N; n++) {
    const g = Math.min(1, n / Math.max(1, fi), (N - 1 - n) / Math.max(1, fo));
    outL[n] *= g; outR[n] *= g;
  }
  const lim = master(outL, outR, N, A.peakDb);
  log(`audio: ${plan.total.toFixed(2)} s, ${nEv} one-shots in ${plan.segments.length} segments, rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s; limiter ${lim.reduction.toFixed(1)} dB max on ${lim.limited} samples`);
  return { left: outL, right: outR, sr: SR, events: nEv };
}
// bowl centres (LAYOUT.bowls lives in 23-layout.js, outside the logic block)
const BOWL_CENTRES = { A: [-0.935, 0.649], B: [-0.129, 1.12], C: [0.922, 0.662] };

// Non-positional effects from plan.audio.fx: { kind: "swell", at, dur, peakDb, f } (a low drone with an airy top).
function renderFx(fx, outL, outR, send, N, seed) {
  if (fx.kind !== "swell") return;
  const i0 = Math.round(fx.at * SR), n = Math.round(fx.dur * SR), f = fx.f ?? 55, g = db(fx.peakDb ?? -30);
  const rnd = mulberry(hash(seed, "fx", fx.at)), bq = new Biquad().set("bp", fx.air ?? 900, 0.5);
  const atk = fx.attack ?? fx.dur * 0.45;
  for (let i = 0; i < n && i0 + i < N; i++) {
    const t = i / SR, env = t < atk ? Math.sin((Math.PI / 2) * (t / atk)) ** 2 : Math.cos((Math.PI / 2) * ((t - atk) / (fx.dur - atk))) ** 2;
    const x = (sin1(f * t) + 0.5 * sin1(1.5 * f * t + 0.25) + 0.25 * sin1(2 * f * t)) * 0.55 + bq.run(rnd() * 2 - 1) * 1.6;
    const j = i0 + i;
    if (j < 0) continue;
    outL[j] += x * g * env; outR[j] += x * g * env * (1 + 0.04 * sin1(0.31 * t)); send[j] += x * g * env * 0.3;
  }
}

function reverb(input, outL, outR, N, wet) {
  if (!(wet > 0)) return;
  const sc = SR / 44100, combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225], spread = 23;
  const room = 0.84, fb = room * 0.28 + 0.7, damp = 0.36 * 0.4;
  const mkC = (len) => ({ buf: new Float32Array(Math.round(len * sc)), i: 0, f: 0 });
  const mkA = (len) => ({ buf: new Float32Array(Math.round(len * sc)), i: 0 });
  const CL = combs.map(mkC), CR = combs.map((l) => mkC(l + spread)), AL = aps.map(mkA), AR = aps.map((l) => mkA(l + spread));
  const pre = new Float32Array(Math.round(0.018 * SR));   // pre-delay
  let pi = 0;
  const g = wet * 3.0;
  for (let n = 0; n < N; n++) {
    const xin = pre[pi] * 0.015; pre[pi] = input[n]; pi = (pi + 1) % pre.length;
    let yl = 0, yr = 0;
    for (let c = 0; c < 8; c++) {
      let C = CL[c], o = C.buf[C.i]; C.f = o * (1 - damp) + C.f * damp; C.buf[C.i] = xin + C.f * fb; C.i = (C.i + 1) % C.buf.length; yl += o;
      C = CR[c]; o = C.buf[C.i]; C.f = o * (1 - damp) + C.f * damp; C.buf[C.i] = xin + C.f * fb; C.i = (C.i + 1) % C.buf.length; yr += o;
    }
    for (let a = 0; a < 4; a++) {
      let P = AL[a], o = P.buf[P.i]; P.buf[P.i] = yl + o * 0.5; yl = o - yl; P.i = (P.i + 1) % P.buf.length;
      P = AR[a]; o = P.buf[P.i]; P.buf[P.i] = yr + o * 0.5; yr = o - yr; P.i = (P.i + 1) % P.buf.length;
    }
    outL[n] += yl * g; outR[n] += yr * g;
  }
}

// Gain staging: the loud-but-common level (99.9th percentile) goes to -9 dBFS, peaks above the ceiling are limited
// (3 ms look-ahead, 80 ms release, at most +6 dB into the limiter), then the result is peak-normalised to peakDb.
function master(L, R, N, peakDb) {
  const ceil = db(peakDb);
  let peak = 0;
  const hist = new Float64Array(2000);
  for (let n = 0; n < N; n++) {
    const a = Math.max(Math.abs(L[n]), Math.abs(R[n]));
    if (a > peak) peak = a;
  }
  if (!(peak > 0)) return { reduction: 0, limited: 0 };
  for (let n = 0; n < N; n++) hist[Math.min(1999, Math.floor((Math.max(Math.abs(L[n]), Math.abs(R[n])) / peak) * 2000))]++;
  let acc = 0, p999 = peak;
  for (let k = 1999; k >= 0; k--) { acc += hist[k]; if (acc > N * 0.001) { p999 = ((k + 1) / 2000) * peak; break; } }
  const pre = Math.min(db(-9) / p999, (ceil * db(6)) / peak);
  for (let n = 0; n < N; n++) { L[n] *= pre; R[n] *= pre; }
  const la = Math.round(0.003 * SR), rel = 1 - Math.exp(-1 / (0.08 * SR));
  const need = new Float32Array(N);
  for (let n = 0; n < N; n++) { const a = Math.max(Math.abs(L[n]), Math.abs(R[n])); need[n] = a > ceil ? ceil / a : 1; }
  // sliding minimum of the needed gain over the look-ahead window (monotone deque)
  const gmin = new Float32Array(N), dq = new Int32Array(N);
  let h = 0, tl = 0;
  for (let n = N - 1; n >= 0; n--) {
    while (tl > h && need[dq[tl - 1]] >= need[n]) tl--;
    dq[tl++] = n;
    while (dq[h] > n + la) h++;
    gmin[n] = need[dq[h]];
  }
  let g = 1, maxRed = 1, limited = 0;
  for (let n = 0; n < N; n++) {
    const want = gmin[n];
    g = want < g ? want : g + (want - g) * rel;
    if (g < 0.999) limited++;
    if (g < maxRed) maxRed = g;
    L[n] *= g; R[n] *= g;
  }
  let pk = 0;
  for (let n = 0; n < N; n++) pk = Math.max(pk, Math.abs(L[n]), Math.abs(R[n]));
  const k = ceil / pk;
  for (let n = 0; n < N; n++) { L[n] *= k; R[n] *= k; }
  return { reduction: -20 * Math.log10(maxRed), limited };
}

// 16-bit PCM WAV with TPDF dither (seeded).
export function writeWav(file, left, right, sr = SR, seed = 1) {
  const n = left.length, data = Buffer.alloc(n * 4), rnd = mulberry(hash(seed, "dither"));
  for (let i = 0; i < n; i++) {
    const q = (v) => clamp(Math.round(v * 32767 + (rnd() - rnd())), -32768, 32767);
    data.writeInt16LE(q(left[i]), i * 4);
    data.writeInt16LE(q(right[i]), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([h, data]));
}

// Per-second RMS and peak (dBFS) of a stereo signal, as printable rows.
export function levelReport(left, right, sr = SR) {
  const rows = [], dB = (v) => (v > 1e-9 ? 20 * Math.log10(v) : -180);
  for (let s = 0; s * sr < left.length; s++) {
    let sl = 0, sr2 = 0, pk = 0;
    const a = s * sr, b = Math.min(left.length, a + sr);
    for (let i = a; i < b; i++) { sl += left[i] ** 2; sr2 += right[i] ** 2; pk = Math.max(pk, Math.abs(left[i]), Math.abs(right[i])); }
    rows.push({ s, rmsL: dB(Math.sqrt(sl / (b - a))), rmsR: dB(Math.sqrt(sr2 / (b - a))), peak: dB(pk) });
  }
  return rows;
}

// Builds the WAV for a plan file; returns its path.
export function buildAudio({ planFile, out, html, seed, quiet = false, plan: given }) {
  const plan = given || loadPlan(planFile);
  const L = loadLogic(html);
  const log = quiet ? () => {} : console.log;
  const r = renderFilmAudio({ plan, logic: L, seed, log });
  writeWav(out, r.left, r.right, r.sr, plan.audio?.seed ?? 7);
  return { out, ...r };
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), opt = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help") { console.log("usage: node tools/audio.mjs [--plan film/plan.json] [--out _frames/film.wav] [--html index.html] [--seed N] [--quiet]"); process.exit(0); }
    if (a === "--quiet") { opt.quiet = true; continue; }
    const m = /^--(plan|out|html|seed)(?:=(.*))?$/.exec(a);
    if (!m) { console.error(`audio: unknown argument ${a}`); process.exit(2); }
    opt[m[1]] = m[2] ?? args[++i];
  }
  const planFile = resolve(opt.plan || join(REPO, "film/plan.json")), out = resolve(opt.out || join(REPO, "_frames/film.wav"));
  const html = resolve(opt.html || join(REPO, "index.html"));
  try {
    const r = buildAudio({ planFile, out, html, seed: opt.seed !== undefined ? Number(opt.seed) : undefined, quiet: opt.quiet });
    const rows = levelReport(r.left, r.right, r.sr);
    if (!opt.quiet) {
      console.log("  s   RMS L   RMS R   peak (dBFS)");
      for (const x of rows) console.log(`${String(x.s).padStart(3)}  ${x.rmsL.toFixed(1).padStart(6)}  ${x.rmsR.toFixed(1).padStart(6)}  ${x.peak.toFixed(1).padStart(6)}`);
    }
    console.log(`${out}: ${(r.left.length / r.sr).toFixed(3)} s, 48 kHz stereo 16-bit`);
  } catch (e) {
    console.error(`audio: ${e.stack || e}`);
    process.exit(1);
  }
}
