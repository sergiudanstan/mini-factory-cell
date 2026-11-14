// Checks the cell logic in index.html without a browser.
// Usage: node tests/run.mjs [file.html] [--perturb]
//   --perturb weakens the dial interlock (the dial may index up to 1.2 s before the delta is out of S1-S3),
//   to prove that the mutex and hand-over checks can fail.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) || join(here, "..", "index.html");
const perturb = args.includes("--perturb");
const html = readFileSync(file, "utf8");
const m = html.match(/\/\/ @@logic-start[^\n]*\n([\s\S]*?)\/\/ @@logic-end/);
if (!m) { console.error("logic block not found"); process.exit(2); }
let code = m[1];
if (perturb) {
  const before = code;
  code = code.replace("Math.max(deltaClear, pressClear", "Math.max(deltaClear - 1.2, pressClear");
  if (code === before) { console.error("perturbation target not found"); process.exit(2); }
}
const NAMES = "DIAL, STATIONS, PART, STACK, HB, FEED, DELTA, DM, T3, T3G, SCARA, TRAY, CAP, NC, DEFECTS, PICK, DZ, PICKZ, ESC, PRESS, PZ, " +
  "modSine, dialTurn, deltaIK, t3IK, t3FK, deltaPose, t3Pose, feederState, trayPose, pressForce, pressState, rebuild, cycleFor, current";
const L = new Function("console", code + `\nreturn { ${NAMES} };`)({ log() {} });

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) fails++; };
const mm = (v) => (v * 1000).toFixed(1);
const EPS = 1e-9;
const stationOfNest = (n, t) => ((n + Math.round(L.dialTurn(t))) % 8 + 8) % 8 + 1;
const dialStill = (M, t) => !M.segs.dial.some((s) => s.kind === "index" && t > s.t0 + EPS && t < s.t1 - EPS);

function checkModel(M, tag) {
  console.log(`\n${tag}`);
  const A = [...M.assemblies.values()];
  const real = A.filter((x) => x.a >= 0);
  // ---- 1. assemblies, components, destinations
  const reached = real.filter((x) => x.a <= L.NC - 1);       // assemblies that passed S7 inside the run
  check(reached.length === L.NC && reached.every((x) => (x.status === "good" && x.dest && x.dest.tray != null) || (x.status === "reject" && x.dest && x.dest.bin != null)),
    `${reached.length} assemblies passed S7: each ends in a tray slot or the reject bin`);
  const rej = real.filter((x) => x.status === "reject");
  check(rej.every((x) => L.DEFECTS[x.a]) && Object.keys(L.DEFECTS).map(Number).filter((a) => a <= L.NC - 1).every((a) => M.assemblies.get(a).status === "reject"),
    `rejects ${rej.map((x) => x.a).join(", ")} are exactly the planned defects`);
  check(rej.every((x) => x.dest == null || x.dest.tray == null) && real.filter((x) => x.status === "good").every((x) => x.dest.bin == null),
    "no reject reaches a tray, no good part reaches the bin");
  check(reached.every((x) => x.parts.A && x.parts.B && x.parts.C), "every finished assembly has a housing, a spring and a cap");
  // tray slots
  const bySlot = new Map();
  for (const x of A.filter((x) => x.dest && x.dest.tray != null)) {
    const k = `${x.dest.tray}:${x.dest.slot}`; bySlot.set(k, (bySlot.get(k) || 0) + 1);
  }
  const trays = Math.max(...[...bySlot.keys()].map((k) => Number(k.split(":")[0])));
  let slotsOk = [...bySlot.values()].every((n) => n === 1);
  for (let tr = 0; tr <= trays; tr++) {
    const used = [...bySlot.keys()].filter((k) => k.startsWith(`${tr}:`)).map((k) => Number(k.split(":")[1])).sort((a, b) => a - b);
    slotsOk = slotsOk && used.every((s, i) => s === i) && (tr === trays || used.length === L.CAP);
  }
  check(slotsOk, `tray slots filled once each, in order (${trays + 1} trays, last ${[...bySlot.keys()].filter((k) => k.startsWith(`${trays}:`)).length}/${L.CAP})`);
  const pl = [...M.marks.place].sort((a, b) => a.t - b.t);
  check(pl.every((p, i) => i === 0 || (p.tray > pl[i - 1].tray) || (p.tray === pl[i - 1].tray && p.slot === pl[i - 1].slot + 1)), `${pl.length} placements follow the pallet order`);
  // ---- 2. every component lands at the right station while the dial is at rest
  let wrong = 0, moving = 0, checked = 0;
  const firstKey = (p, mode) => p && p.track.find((k) => k.mode === mode);
  for (const x of real) {
    const tests = [[firstKey(x.parts.A, "dial"), 1], [firstKey(x.parts.B, "fall"), 2], [x.parts.C && x.parts.C.track.find((k) => k.mode === "dial" && k.dz1 === undefined && k.t > 0), 3],
                   [firstKey(x.parts.A, "reject"), 6], [firstKey(x.parts.A, "scara"), 7]];
    for (const [k, s] of tests) {
      if (!k || k.t <= 0) continue;
      checked++;
      if (stationOfNest(x.nest, k.t) !== s) wrong++;
      if (!dialStill(M, k.t)) moving++;
    }
  }
  check(checked > 0 && wrong === 0 && moving === 0, `${checked} hand-overs at S1/S2/S3/S6/S7: ${wrong} at the wrong station, ${moving} while the dial moves`);
  check(real.every((x) => !x.parts.B || !x.parts.C || !firstKey(x.parts.B, "fall") || !x.parts.C.track.find((k) => k.mode === "dial" && k.t > 0)
    || firstKey(x.parts.B, "fall").t1 <= x.parts.C.track.find((k) => k.mode === "dial" && k.t > 0).t + EPS), "every spring has landed before its cap arrives");
  check(M.parts.every((p) => p.track.every((k, i) => i === 0 || k.t >= p.track[i - 1].t - EPS)), `${M.parts.length} component tracks are time-ordered`);

  // ---- 3. mutex: no tool in a nest zone while the dial indexes, one tool per station at a time
  const idx = M.segs.dial.filter((s) => s.kind === "index");
  let ov = 0, zn = 0, same = 0;
  M.zones.forEach((list) => {
    zn += list.length;
    for (const [a, b] of list) for (const s of idx) if (a < s.t1 - EPS && b > s.t0 + EPS) ov++;
    const srt = [...list].sort((p, q) => p[0] - q[0]);
    for (let i = 1; i < srt.length; i++) if (srt[i][0] < srt[i - 1][1] - EPS) same++;
  });
  check(zn > 0 && ov === 0, `${zn} nest-zone intervals, ${ov} overlap a dial index`);
  check(same === 0, `stations: ${same} overlapping tool intervals`);
  // segments per actor are contiguous and ordered
  for (const [a, list] of Object.entries(M.segs)) {
    const gaps = list.filter((s, n) => n && Math.abs(s.t0 - list[n - 1].t1) > EPS).length;
    check(gaps === 0 && Math.abs(list[0].t0) < EPS && Math.abs(list.at(-1).t1 - M.DURATION) < EPS && list.every((s) => s.t1 >= s.t0),
      `${a}: ${list.length} segments, contiguous 0 -> ${M.DURATION.toFixed(2)} s`);
  }
  check(idx.length === L.NC, `${idx.length} dial indexes (${L.NC} planned)`);
  check(M.marks.tip.every((t, k) => Math.abs(L.dialTurn(t) - k) < 1e-9), "dial stands exactly on a station at every in-position time");

  // ---- 4. kinematics
  check(M.ikFail === 0, `delta IK: ${M.ikFail} unreachable samples of ${M.S.dp.length}`);
  const q = M.S.tq;
  const bad = q.filter((v) => Math.abs(v[0]) > L.T3.lim1 * Math.PI / 180 + EPS || Math.abs(v[1]) > L.T3.lim2 * Math.PI / 180 + EPS
    || v[2] > L.T3.zTop + EPS || v[2] < L.T3.zTop - L.T3.stroke - EPS || Math.abs(v[3]) > 2 * Math.PI).length;
  check(bad === 0, `T3 joints and stroke within limits at all ${q.length} samples`);
  const pairs = ["Delta-T3", "Delta-tooling", "T3-tooling"];
  M.minClear.forEach((c, j) => check(c.m >= 0.025, `min clearance ${pairs[j]} = ${mm(c.m)} mm at ${c.at.toFixed(2)} s (>= 25 mm)`));
  // the delta carries a part only with closed fingers
  let open = 0;
  for (const p of M.parts) p.track.forEach((k, i) => {
    if (k.mode !== "delta") return;
    const t1 = p.track[i + 1] ? p.track[i + 1].t : M.DURATION;
    for (let t = k.t + 0.01; t < t1 - 0.01; t += 0.02) if (L.deltaPose(t).grip < 0.99) { open++; break; }
  });
  check(open === 0, `delta fingers closed whenever a part is in the gripper (${open} violations)`);

  // ---- 5. process: press and vision verdicts, feeders, tray exchange
  const pr = M.marks.press;
  check(pr.every((p) => p.pass === !(L.DEFECTS[p.a] && L.DEFECTS[p.a].kind === "spring")), `${pr.length} press tests: only the weak spring fails`);
  check(pr.filter((p) => p.pass).every((p) => p.f45 >= L.PRESS.window[0] && p.f45 <= L.PRESS.window[1] && p.peak >= L.PRESS.snapMin), "every passed press test is inside the force window with a snap");
  check(M.marks.vision.every((v) => v.pass === !(L.DEFECTS[v.a] && L.DEFECTS[v.a].kind === "hook")), `${M.marks.vision.length} inspections: only the unlatched cap fails`);
  let feedBad = 0;
  M.feeds.forEach((F, fi) => {
    F.picks.forEach((p, k) => { if (p.t < F.present[k] - EPS) feedBad++; if (F.escS[k] < p.t - EPS) feedBad++; });
    for (let j = 1; j < F.arrive.length; j++) if (F.arrive[j] < F.arrive[j - 1] - EPS) feedBad++;
    for (let t = 0; t <= M.DURATION; t += 0.25) { const s = L.feederState(fi, t); if (s.queue.length > L.FEED[fi].q + 1 || s.queue.some((e, i) => i && e.s < s.queue[i - 1].s - EPS)) feedBad++; }
  });
  check(feedBad === 0, `feeders: picks only from a filled nest, escapement after the pick, queue ordered and within capacity (${feedBad} issues)`);
  check(M.trayLog.swaps.every((sw) => !M.marks.place.some((p) => p.t > sw.t0 - EPS && p.t < sw.t3 - EPS)), `${M.trayLog.swaps.length} tray exchange(s): no placement while the shuttle runs`);
  check(L.trayPose(0, 0)[0] === L.TRAY.cx && (M.trayLog.swaps.length === 0 || Math.abs(L.trayPose(1, M.trayLog.swaps[0].t3 + 0.01)[0] - L.TRAY.cx) < 1e-9), "trays sit at the fill position when the SCARA uses them");
}

const M0 = L.rebuild();
checkModel({ ...M0 }, `default: index ${L.DIAL.index.toFixed(2)} s, rates ${M0.rates.join("/")} /min`);
for (const o of [{ index: 0.20 }, { index: 0.50 }, { index: 0.80 }, { index: 1.20 }, { rates: [12, 15, 10] }, { speed: 0.7 }]) {
  checkModel({ ...L.rebuild(o) }, `what-if ${JSON.stringify(o)}`);
}
console.log("\nglobal");
const M1 = L.rebuild();
check(Math.abs(M1.DURATION - 59.175) <= 0.01, `default run = ${M1.DURATION.toFixed(3)} s (59.175 ± 0.01)`);
check(Math.abs(M1.CYCLE - 2.188) <= 0.001, `steady-state cycle = ${M1.CYCLE.toFixed(4)} s (2.188 ± 0.001), ${(3600 / M1.CYCLE).toFixed(0)} parts/h`);
check(M1.STATS.good === 25 && M1.STATS.rejected === 2 && M1.STATS.swaps === 1, `default run: ${M1.STATS.good} good, ${M1.STATS.rejected} rejected, ${M1.STATS.swaps} tray exchange`);
check(Math.abs(L.T3G.riser + L.T3G.shaftEnd0 - L.T3G.tool - L.T3.zTop) <= 1e-9, "T3 riser + shaft end at stroke top - tool = TCP top (300 mm)");
check(Math.abs(L.DZ.A - (L.HB + L.PART.A.grip)) < 1e-12 && Math.abs(L.PICKZ.A - L.DZ.A) < 1e-12, "housing pick and place TCP heights match (pick nest = dial nest pocket floor)");
check(Math.abs(L.modSine(0)) < 1e-12 && Math.abs(L.modSine(1) - 1) < 1e-12 && Math.abs(L.modSine(0.125 - 1e-9) - L.modSine(0.125)) < 1e-6 && Math.abs(L.modSine(0.875 - 1e-9) - L.modSine(0.875)) < 1e-6,
  "modified sine: 0 -> 1, continuous at 1/8 and 7/8");
let mono = true; for (let i = 1; i <= 100; i++) if (L.modSine(i / 100) < L.modSine((i - 1) / 100) - 1e-12) mono = false;
check(mono, "modified sine is monotonic");
check(L.pressForce(4.5) >= L.PRESS.window[0] && L.pressForce(4.5, { k: 450 }) < L.PRESS.window[0], `force at 4.5 mm: good ${L.pressForce(4.5).toFixed(2)} N, weak spring ${L.pressForce(4.5, { k: 450 }).toFixed(2)} N`);
const cyc = [0.20, 0.32, 0.50, 0.80, 1.20].map((x) => L.cycleFor({ index: x }).CYCLE);
check(cyc.every((d, i) => i === 0 || d >= cyc[i - 1] - 1e-9), `cycle is nondecreasing with index time (${cyc.map((c) => c.toFixed(3)).join(", ")})`);
const sp = [0.6, 0.8, 1.0, 1.2].map((x) => L.cycleFor({ speed: x }).CYCLE);
check(sp.every((d, i) => i === 0 || d <= sp[i - 1] + 1e-9), `cycle falls as the delta speeds up (${sp.map((c) => c.toFixed(3)).join(", ")})`);
const M8 = L.rebuild({ index: 0.80 });
const before = L.current();
const fc = L.cycleFor({ index: 0.80 });
check(Math.abs(fc.DURATION - M8.DURATION) <= 1e-9, "cycleFor(0.80) matches rebuild(0.80)");
check(L.current().segs === before.segs && L.current().DURATION === before.DURATION, "cycleFor leaves the current model untouched");
L.rebuild();

console.log(`\nrun ${M0.DURATION.toFixed(2)} s · cycle ${M0.CYCLE.toFixed(3)} s · ${(3600 / M0.CYCLE).toFixed(0)} parts/h · ${M0.STATS.good} good · ${M0.STATS.rejected} rejected${perturb ? " · PERTURBED" : ""}`);
console.log(fails ? `${fails} check(s) failed` : "all checks passed");
process.exit(fails ? 1 : 0);
