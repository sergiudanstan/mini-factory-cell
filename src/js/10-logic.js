// @@logic-start  (pure JS, no DOM and no three.js: tests/run.mjs evaluates this block in Node)
// One assembly cell of a small factory. Three vibratory bowl feeders (A housing, B spring, C cap) feed a delta robot that
// loads an 8-station dial: S1 housing, S2 spring, S3 cap. S4 snaps the cap and runs a force-travel test, S5 inspects,
// S6 rejects, S7 an Epson T3-B401S unloads good push-buttons into a 4 x 6 tray, S8 checks that the nest is empty.
// Every pose is a pure function of t. rebuild() schedules the whole program with interlocks.
const DEG = 180 / Math.PI, RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, s) => a + (b - a) * s;
const ease = (s) => s * s * s * (10 + s * (6 * s - 15));          // minimum-jerk profile (peak speed 1.875 x average)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// Modified-sine cam law of a cam indexer: tau 0..1 -> 0..1 (peak velocity 1.76, peak acceleration 5.53, normalised).
function modSine(tau) {
  const t = clamp(tau, 0, 1), k = 4 + Math.PI;
  if (t < 0.125) return (Math.PI * t - 0.25 * Math.sin(4 * Math.PI * t)) / k;
  if (t < 0.875) return (2 + Math.PI * t - 2.25 * Math.sin(Math.PI / 3 + 4 * Math.PI * t / 3)) / k;
  return (4 + Math.PI * t - 0.25 * Math.sin(4 * Math.PI * t)) / k;
}

// ================================================================ frame
// Metres, z up. Origin: dial centre on the machine-base top plate (z = 0). +x is the operator's right, +y points away from
// the operator (the operator stands at -y). Angles are radians inside, degrees in the UI.
const FLOOR = -0.82;                                   // the base top plate is 820 mm above the floor

// Weiss TC220T-class cam indexer, 8 stations, aluminium dial Ø700 x 20. index = cam motion time (what-if knob),
// sig = start + in-position signal time (half before, half after the motion).
const DIAL = { cx: 0, cy: 0, r: 0.350, t: 0.020, top: 0.185, nestR: 0.300, n: 8, nestTop: 0.220, pocket: 0.008,
               step: Math.PI / 4, index0: 0.32, index: 0.32, sig: 0.10, min: 0.20, max: 1.20, knob: 0.02, dwellMin: 0.15 };
// Stations at fixed angles (counter-clockwise from +x). The dial turns clockwise seen from above: S1 -> S2 -> ... -> S8.
const STATIONS = [
  [1, 135, "Load housing", "delta"], [2, 90, "Insert spring", "delta"], [3, 45, "Place cap", "delta"],
  [4, 0, "Snap + force-travel test", "press"], [5, -45, "Vision check", "vision"], [6, -90, "Reject", "reject"],
  [7, -135, "Unload to tray", "scara"], [8, 180, "Empty-nest check", "check"],
].map(([s, ang, name, actor]) => ({ s, code: `S${s}`, ang, a: ang * RAD, name, actor,
  x: DIAL.cx + DIAL.nestR * Math.cos(ang * RAD), y: DIAL.cy + DIAL.nestR * Math.sin(ang * RAD) }));
const st = (s) => STATIONS[s - 1];

// ---------------------------------------------------------------- product: push-button (housing + spring + cap)
// Each part's origin is its bottom centre. grip = TCP height above the part bottom, gripW = finger gap when closed.
const PART = {
  A: { key: "A", name: "Housing", mat: "PA66 black", d: 0.020, flangeD: 0.024, h: 0.022, flangeH: 0.002, bore: 0.013,
       boreFloor: 0.004, windows: [0.0145, 0.0175], grip: 0.014, gripW: 0.020 },
  B: { key: "B", name: "Spring", mat: "music wire 0.6", od: 0.007, wire: 0.0006, free: 0.013, set: 0.010, coils: 7.5,
       k: 820, grip: 0.0065, gripW: 0.007 },
  C: { key: "C", name: "Cap", mat: "PA red", d: 0.0125, h: 0.015, hooks: 2, grip: 0.009, gripW: 0.0125 },
};
// Stack heights inside the housing: component bottom above the housing bottom.
// C0 = cap resting on the free spring, C1 = cap latched, Cover = cap at the press overtravel.
const STACK = { B: 0.004, C0: 0.017, C1: 0.014, Cover: 0.0125 };
const HB = DIAL.nestTop - DIAL.pocket;                 // housing bottom in a dial nest (z = 0.212)

// ---------------------------------------------------------------- feeders (bowl -> linear feeder -> pick nest)
// Pick nests at radius PICK.r on the station rays of S1-S3, part bottom at PICK.z. The linear track runs outward along
// the ray for `track` metres to the bowl outlet. The track is kept full: q parts wait behind the pick nest at `pitch`.
// rate = what the bowl delivers to the linear track when there is room (parts/min).
const PICK = { r: 0.60, z: 0.212 };
const ESC = { t: 0.18, travel: 0.25 };                 // escapement move time; outlet -> queue-back travel time
const FEED = [["A", 135, 60, 0.0245], ["B", 90, 80, 0.0078], ["C", 45, 60, 0.0135]].map(([id, ang, rate, pitch], i) => {
  const track = 0.52;
  return { i, id, part: id, name: `${PART[id].name} feeder`, ang, a: ang * RAD, rate0: rate, rate, pitch, track,
    q: Math.floor((track - 0.02) / pitch) - 1, actor: `feed${id}`,
    x: DIAL.cx + PICK.r * Math.cos(ang * RAD), y: DIAL.cy + PICK.r * Math.sin(ang * RAD),
    ux: Math.cos(ang * RAD), uy: Math.sin(ang * RAD) };   // u: outward along the track (pick -> outlet)
});

// ---------------------------------------------------------------- delta robot (1130-class, ABB IRB 360 / Omron Hornet scale)
// Three shoulders at radius F on a base hung under the portal plate (mount = plate underside), upper arm RF,
// parallelogram forearm RE, effector radius E, tool = effector plane to the TCP (fingertip centre).
const DELTA = { cx: 0.0, cy: 0.36, mount: 1.33, zb: 1.17, F: 0.140, E: 0.045, RF: 0.330, RE: 0.800, tool: 0.115,
                lim: [-35, 95], arms: [60, 180, 300] };   // no arm points at the dial centre (star hub)
const DM = { a: 0.10, b: 0.28, lin: 0.055, close: 0.045, open: 0.035, app: 0.035, arch: 0.040, clear: 0.02, speed: 1.0 };
// motion times scale with the what-if delta speed (gripper times do not)
const archT = (from, to) => (DM.a + DM.b * dist3(from, to)) / DM.speed, linT = () => DM.lin / DM.speed;
// TCP heights. Place A in the nest pocket; release B 1 mm over the housing (it drops into the bore); C onto the free spring.
const DZ = { A: HB + PART.A.grip, B: HB + PART.A.h + 0.001 + PART.B.grip, C: HB + STACK.C0 + PART.C.grip };
const PICKZ = { A: PICK.z + PART.A.grip, B: PICK.z + PART.B.grip, C: PICK.z + PART.C.grip };
const FALL_T = Math.sqrt(2 * (PART.A.h + 0.001 - STACK.B) / 9.81);   // spring free fall into the bore (s)

// ---------------------------------------------------------------- Epson T3-B401S SCARA (single robot, on a pedestal)
// 225 + 175 mm arms, 150 mm Z stroke, J1 ±132°, J2 ±141°, J4 ±360°. zTop = TCP at the top of the stroke.
const T3 = { L1: 0.225, L2: 0.175, zTop: 0.30, stroke: 0.150, lim1: 132, lim2: 141, lim4: 360 };
// Real T3 envelope from Epson's outer-dimension drawing, metres above the T3 mounting face (riser top).
// riser + shaftEnd0 - tool = T3.zTop (the TCP is the fingertip centre, tool = shaft end to TCP).
const T3G = { riser: 0.225, tool: 0.0857, a1: [0.1923, 0.2273], a2: [0.2362, 0.4127], a2Front: 0.0478, a2Rear: 0.070,
              shaftEnd0: 0.1607, shaftLen: 0.330, ductBase: 0.446, ductTop: 0.5985, ductR: 0.017 };
const SCARA = { id: "scara", name: "T3-B401S", x: -0.50, y: -0.40, face: -30 * RAD, yaw: 0 };
const TM = { ptpA: 0.18, ptpB: 0.22, linA: 0.08, linB: 0.8, close: 0.10, open: 0.08, clear: 0.02 };

// ---------------------------------------------------------------- tray (4 x 6, palletised by the SCARA) and its shuttle
// Slot n: column n % 6 along x, row floor(n / 6) stepping away from the robot (row 0 nearest). A full tray shuttles out
// along -x (out), is pushed onto the full-tray table (push) while an empty one drops from the magazine (drop), and the
// shuttle brings the empty tray back in.
const TRAY = { cx: -0.333, cy: -0.599, top: 0.170, pocket: 0.008, rows: 4, cols: 6, pitch: 0.032, w: 0.215, d: 0.150, t: 0.020,
               prefill: 14, out: -1.05, push: -0.32, drop: 0.12, tOut: 1.0, tSwap: 0.8, tIn: 1.0 };
const CAP = TRAY.rows * TRAY.cols;
const traySlot = (n) => [(n % TRAY.cols - (TRAY.cols - 1) / 2) * TRAY.pitch, ((TRAY.rows - 1) / 2 - Math.floor(n / TRAY.cols)) * TRAY.pitch];

// ---------------------------------------------------------------- tooling on the dial (centre column + star arms, S4-S6, S8)
// The column rises from the indexer's stationary centre through the dial bore. Star arms carry the S4 press, the S5 camera,
// the S6 reject unit and the S8 sensor bracket. S1-S3 and S7 stay open from above for the robots.
const TOOL = {
  column: { r: 0.045, z0: 0.165, z1: 0.52 },
  star: { z0: 0.52, z1: 0.54, hubR: 0.08, armW: 0.06, armEnd: 0.34, stations: [4, 5, 6, 8] },
  press: { r: 0.040, z0: 0.30, z1: 0.78 },
  camera: { r: 0.035, z0: 0.40, z1: 0.52, ringZ: 0.30, ringR: 0.045 },
  rej: { up: 0.30, down: HB + PART.A.grip, out: 0.13, railZ: 0.50 },
  s8: { offset: 0.030, z0: 0.226, z1: 0.52 },
};
const PRESS = { tApp: 0.12, tPress: 0.22, tDwell: 0.05, tRel: 0.04, tRet: 0.12, clear: 0.02,
                over: STACK.C0 - STACK.Cover, latch: STACK.C0 - STACK.C1, up: 0.040, window: [3.0, 4.5], snapMin: 8 };
const PZ = { contact: HB + STACK.C0 + PART.C.h };      // press tool face z when it touches the unseated cap (0.244)
PZ.up = PZ.contact + PRESS.up; PZ.bottom = PZ.contact - PRESS.over; PZ.latch = PZ.contact - PRESS.latch;
const VISION = { settle: 0.05, tCap: 0.06, tProc: 0.26 };
const RJ = { tDown: 0.12, tClose: 0.10, tUp: 0.12, tOut: 0.22, tOpen: 0.08, tBack: 0.22, clear: 0.02, tDrop: 0.45 };
const BIN = { x: 0.0, y: -0.62, floor: 0.035, w: 0.20, d: 0.16, h: 0.14, chute: [0.43, 0.53] };
const CHECK = { t: 0.10 };

// ---------------------------------------------------------------- the run: steady state with work in progress at t = 0
// Assembly a gets its housing at S1 in cycle a - 6, so at t = 0 the dial already holds assemblies 0-5 (0 at S7 ... 5 at S2)
// and the delta holds housing 6 over S1. Two planned rejects: a weak spring (S4) and a cap whose hook did not latch (S5).
const NC = 27;                                          // dial cycles in the film
const DEFECTS = {
  8: { kind: "spring", k: 450, station: 4, text: "Weak spring: S4 force 2.4 N at 4.5 mm (window 3.0-4.5 N)" },
  15: { kind: "hook", hooks: 1, tilt: 4.2, rise: 0.0016, station: 5, text: "Cap tilt 4.2°, one hook not latched (S5)" },
};
const nestOf = (a) => (((6 - a) % 8) + 8) % 8;          // nest n sits at station ((n + c) mod 8) + 1 in cycle c

// ---------------------------------------------------------------- kinematics
function deltaIK(p) {   // p: TCP [x,y,z] -> shoulder angles (rad, + = down) or null
  const x = p[0] - DELTA.cx, y = p[1] - DELTA.cy, z = p[2] + DELTA.tool - DELTA.zb;
  const out = [];
  for (const th of DELTA.arms) {
    const c = Math.cos(th * RAD), s = Math.sin(th * RAD);
    const xl = x * c + y * s, yl = -x * s + y * c;            // world -> arm frame
    const a = yl - DELTA.E + DELTA.F;
    const A = 2 * a * DELTA.RF, B = 2 * z * DELTA.RF;
    const C = DELTA.RE ** 2 - xl * xl - a * a - DELTA.RF ** 2 - z * z;
    const r = Math.hypot(A, B);
    if (Math.abs(C / r) > 1) return null;
    const al = Math.atan2(B, A) + Math.acos(C / r);
    if (al * DEG < DELTA.lim[0] || al * DEG > DELTA.lim[1]) return null;
    out.push(al);
  }
  return out;
}
// Elbow and effector-ball points per arm (for the 3D model, the capsules and the checks).
function deltaJoints(p, ang) {
  const eff = [p[0], p[1], p[2] + DELTA.tool];
  return DELTA.arms.map((th, i) => {
    const c = Math.cos(th * RAD), s = Math.sin(th * RAD), al = ang[i];
    const S = [DELTA.cx + DELTA.F * s, DELTA.cy - DELTA.F * c, DELTA.zb];
    const ry = DELTA.F + DELTA.RF * Math.cos(al);
    const E = [DELTA.cx + ry * s, DELTA.cy - ry * c, DELTA.zb - DELTA.RF * Math.sin(al)];
    const Pp = [eff[0] + DELTA.E * s, eff[1] - DELTA.E * c, eff[2]];
    return { S, E, P: Pp, c, s };
  });
}
function t3FK(q) {      // q: [q1, q2 (rad), z (TCP), q4] -> points
  const p1 = SCARA.face + q[0], p2 = p1 + q[1];
  const j2 = [SCARA.x + T3.L1 * Math.cos(p1), SCARA.y + T3.L1 * Math.sin(p1)];
  const j3 = [j2[0] + T3.L2 * Math.cos(p2), j2[1] + T3.L2 * Math.sin(p2)];
  return { j2, j3, tcp: [j3[0], j3[1], q[2]], yaw: p2 + q[3] };
}
function t3IK(p, yaw = SCARA.yaw, prefer = null) {
  const dx = p[0] - SCARA.x, dy = p[1] - SCARA.y, r2 = dx * dx + dy * dy;
  const c2 = (r2 - T3.L1 ** 2 - T3.L2 ** 2) / (2 * T3.L1 * T3.L2);
  if (Math.abs(c2) > 1) return null;
  const sols = [1, -1].map((sg) => {
    const q2 = sg * Math.acos(c2);
    const p1 = Math.atan2(dy, dx) - Math.atan2(T3.L2 * Math.sin(q2), T3.L1 + T3.L2 * Math.cos(q2));
    return { q: [wrap(p1 - SCARA.face), q2, p[2], wrap(yaw - p1 - q2)], sg };
  }).filter((s) => Math.abs(s.q[0]) <= T3.lim1 * RAD && Math.abs(s.q[1]) <= T3.lim2 * RAD);
  if (!sols.length) return null;
  if (prefer) {   // continuity: the solution nearest the previous joint position
    const jd = (s) => Math.abs(s.q[0] - prefer[0]) + Math.abs(s.q[1] - prefer[1]);
    sols.sort((a, b) => jd(a) - jd(b));
  } else {        // otherwise keep the elbow away from the dial tooling
    const far = (s) => { const f = t3FK(s.q); return -Math.hypot(f.j2[0] - DIAL.cx, f.j2[1] - DIAL.cy); };
    sols.sort((a, b) => far(a) - far(b));
  }
  return sols[0].q;
}
function mustIK(p, prefer) {
  const q = t3IK(p, SCARA.yaw, prefer);
  if (!q) throw new Error(`T3: point ${p.map((v) => (v * 1000).toFixed(0)).join(", ")} mm is out of reach`);
  return q;
}

// ---------------------------------------------------------------- press physics: force-travel of one push-button
// x = press travel from first contact (mm). Spring rate k (N/m) plus the hook snap: each hook rises to 10 N by 2.4 mm and
// lets go by 2.75 mm (the audible snap). The test reads the force at the overtravel (4.5 mm) and needs a snap.
function pressForce(x, cond = {}) {
  const k = (cond.k ?? PART.B.k) / 1000, hooks = cond.hooks ?? PART.C.hooks;
  let snap = 0;
  if (x > 0.8 && x <= 2.4) snap = 10 * Math.sin((Math.PI / 2) * (x - 0.8) / 1.6) ** 2;
  else if (x > 2.4 && x < 2.75) snap = 10 * (1 - (x - 2.4) / 0.35);
  return Math.max(0, k * x + hooks * snap + (x > 0 ? 0.35 : 0));
}
function pressTest(a) {
  const d = DEFECTS[a] || {}, cond = { k: d.kind === "spring" ? d.k : PART.B.k, hooks: d.kind === "hook" ? d.hooks : PART.C.hooks };
  const xs = [], curve = [];
  for (let i = 0; i <= 45; i++) { const x = i / 10; xs.push(x); curve.push([x, pressForce(x, cond)]); }
  const peak = Math.max(...curve.filter(([x]) => x <= 2.8).map(([, f]) => f));
  const f45 = pressForce(4.5, cond);
  const snapOk = peak >= PRESS.snapMin && peak - pressForce(2.8, cond) >= 5;
  const pass = snapOk && f45 >= PRESS.window[0] && f45 <= PRESS.window[1];
  return { curve, peak, f45, snapOk, pass, cond, reason: pass ? "" : (d.text || "Force window") };
}

// ---------------------------------------------------------------- program model
const ACTORS = ["dial", "delta", "press", "vision", "reject", "scara", "tray", "feedA", "feedB", "feedC"];
let segs, zones, parts, assemblies, marks, feeds, trayLog, DURATION, CYCLE, NC_RUN = NC;
function resetModel() {
  segs = Object.fromEntries(ACTORS.map((a) => [a, []]));
  zones = STATIONS.map(() => []);                       // per station: [t0, t1, actor]
  parts = [];                                           // tracked components (feeder pick nest onwards)
  assemblies = new Map();
  marks = { index: [], press: [], vision: [], reject: [], place: [], check: [], swap: [], pick: [] };
  feeds = FEED.map(() => ({ arrive: [], present: [0], escS: [], picks: [] }));
  trayLog = { swaps: [] };
}
// End state of a segment, carried by the wait that add() inserts before the next one.
function holdOf(actor, s) {
  if (actor === "delta") return { from: s.to, to: s.to, grip: [s.grip[1], s.grip[1]], part: s.part };
  if (actor === "scara") return { q0: s.q1, q1: s.q1, grip: [s.grip[1], s.grip[1]] };
  if (actor === "press") return { z0: s.z1, z1: s.z1 };
  if (actor === "reject") return { v0: s.v1, v1: s.v1, grip: [s.grip[1], s.grip[1]] };
  if (actor === "dial") return { turn0: s.turn1, turn1: s.turn1 };
  return {};
}
// Appends a segment; a gap before it becomes a wait that holds the previous end state.
function add(actor, seg, wait = "Idle", waitCmd = "") {
  const list = segs[actor], last = list.at(-1);
  if (last && seg.t0 > last.t1 + 1e-12) list.push({ t0: last.t1, t1: seg.t0, kind: "wait", label: wait, cmd: waitCmd, ...holdOf(actor, last) });
  list.push(seg);
  return seg.t1;
}
function comp(type, a, t, entry) {
  const p = { id: parts.length, type, a, track: [{ t, ...entry }] };
  parts.push(p);
  return p;
}
const key = (p, t, entry) => { if (p) p.track.push({ t, ...entry }); };
const asmOf = (a) => {
  if (!assemblies.has(a)) assemblies.set(a, { a, nest: nestOf(a), parts: {}, status: "wip", defect: DEFECTS[a] || null, dest: null });
  return assemblies.get(a);
};

function schedule() {
  const IDX = DIAL.sig + DIAL.index;
  const tip = [0];                                      // in-position time per cycle
  // ---- seeds: state at t = 0
  const appOf = (s, part) => [st(s).x, st(s).y, DZ[part] + DM.app];
  const atOf = (s, part) => [st(s).x, st(s).y, DZ[part]];
  const fApp = (f) => [FEED[f].x, FEED[f].y, PICKZ[FEED[f].part] + DM.app];
  const fAt = (f) => [FEED[f].x, FEED[f].y, PICKZ[FEED[f].part]];
  segs.dial.push({ t0: 0, t1: 0, kind: "wait", label: "In position", cmd: "", turn0: 0, turn1: 0 });
  segs.delta.push({ t0: 0, t1: 0, kind: "wait", label: "Holding housing over S1", cmd: "", from: appOf(1, "A"), to: appOf(1, "A"), grip: [1, 1], part: "A" });
  const qS7app = mustIK([st(7).x, st(7).y, T3.zTop]);
  const qS7 = [...qS7app]; qS7[2] = HB + PART.A.grip;
  segs.scara.push({ t0: 0, t1: 0, kind: "wait", label: "Ready over S7", cmd: "", q0: qS7app, q1: qS7app, grip: [0, 0] });
  segs.press.push({ t0: 0, t1: 0, kind: "wait", label: "Up", cmd: "", z0: PZ.up, z1: PZ.up });
  segs.reject.push({ t0: 0, t1: 0, kind: "wait", label: "Home", cmd: "", v0: [0, 0], v1: [0, 0], grip: [0, 0] });
  for (const a of ["vision", "tray", "feedA", "feedB", "feedC"]) segs[a].push({ t0: 0, t1: 0, kind: "wait", label: "Idle", cmd: "" });

  // ---- work in progress on the dial, the housing in the delta, the prefilled tray
  for (let a = 0; a <= 5; a++) {
    const A = asmOf(a), n = A.nest;
    A.parts.A = comp("A", a, 0, { mode: "dial", n, dz: 0 });
    if (a <= 4) A.parts.B = comp("B", a, 0, { mode: "dial", n, dz: STACK.B, len: a <= 2 ? PART.B.set : PART.B.free });
    if (a <= 3) A.parts.C = comp("C", a, 0, { mode: "dial", n, dz: a <= 2 ? STACK.C1 : STACK.C0 });
    if (a <= 2) A.pressed = true;
  }
  const h6 = asmOf(6); h6.parts.A = comp("A", 6, 0, { mode: "delta" });
  for (let i = 0; i < TRAY.prefill; i++) {
    const a = -TRAY.prefill + i, A = asmOf(a);
    A.status = "good"; A.dest = { tray: 0, slot: i }; A.nest = null;
    for (const [type, dz] of [["A", 0], ["B", STACK.B], ["C", STACK.C1]])
      A.parts[type] = comp(type, a, 0, { mode: "tray", m: 0, slot: i, dz, yaw: -135 * RAD, len: PART.B.set });
  }

  // ---- feeder bookkeeping: part j of feeder f (j = 0 sits in the pick nest at t = 0, j = 1..q wait on the track)
  const F = FEED.map((f) => ({ k: 0, dt: 60 / f.rate }));
  const arriveOf = (fi, j) => {
    const L = feeds[fi], f = FEED[fi];
    if (j <= f.q) return -1;
    while (L.arrive.length <= j) {
      const jj = L.arrive.length;
      if (jj <= f.q) { L.arrive.push(-1); continue; }
      const room = L.escS[jj - f.q - 1];
      if (room === undefined) return Infinity;            // that escapement is not scheduled yet
      L.arrive.push(Math.max((L.arrive[jj - 1] ?? -1) + F[fi].dt, room + ESC.travel));
    }
    return L.arrive[j];
  };
  // delta picks part k of feeder fi; returns the time the part is in the gripper and the delta is up again
  let dT = 0, dAt = appOf(1, "A");
  function deltaPick(fi, a, label) {
    const f = FEED[fi], L = feeds[fi], k = F[fi].k, type = f.part;
    let t = add("delta", { t0: dT, t1: dT + archT(dAt, fApp(fi)), kind: "arch", label: `Transfer to ${f.id} pick`, cmd: `MOVJ arch above_pick${f.id}`, from: dAt, to: fApp(fi), grip: [0, 0], part: type });
    const ready = L.present[k];
    t = Math.max(t, ready);
    const down = add("delta", { t0: t, t1: t + linT(), kind: "lin", label: `Down to ${PART[type].name.toLowerCase()} ${a}`, cmd: `MOVL pick${f.id} v=600`, from: fApp(fi), to: fAt(fi), grip: [0, 0], part: type },
      `Wait: ${f.id} part present`, `WAIT pick${f.id}_present`);
    const closed = add("delta", { t0: down, t1: down + DM.close, kind: "io", label: "Close gripper", cmd: "DO grip=1; WAIT grip_ok", from: fAt(fi), to: fAt(fi), grip: [0, 1], part: type });
    const up = add("delta", { t0: closed, t1: closed + linT(), kind: "lin", label: "Lift", cmd: `MOVL above_pick${f.id}`, from: fAt(fi), to: fApp(fi), grip: [1, 1], part: type });
    // the tracked component: in the pick nest from its present time, in the gripper once the fingers close
    const p = comp(type, a, ready, { mode: "feed", f: fi });
    key(p, closed, { mode: "delta" });
    asmOf(a).parts[type] = p;
    L.picks.push({ k, t: closed, a });
    marks.pick.push({ f: fi, k, t: closed, a });
    // escapement: the next part moves into the pick nest once the fingers are clear and that part has arrived
    const nxt = arriveOf(fi, k + 1);
    const s0 = Math.max(up, nxt);
    L.escS.push(s0);
    L.present.push(s0 + ESC.t);
    add(f.actor, { t0: s0, t1: s0 + ESC.t, kind: "io", label: `Escapement: part to pick nest`, cmd: `OUT esc${f.id}=1; WAIT nest${f.id}_full`, k: k + 1 },
      nxt > up + 1e-9 ? "Starved: waiting for parts" : "Queue full, bowl recirculating", "");
    F[fi].k++;
    dT = up; dAt = fApp(fi);
    return p;
  }
  function deltaPlace(s, type, a, release) {   // arch to S, wait for the dial, down, open, up; returns the zone interval
    const app = appOf(s, type), at = atOf(s, type);
    let t = dT;
    if (dist3(dAt, app) > 1e-6) t = add("delta", { t0: dT, t1: dT + archT(dAt, app), kind: "arch", label: `Transfer to ${st(s).code}`, cmd: `MOVJ arch above_${st(s).code}`, from: dAt, to: app, grip: [1, 1], part: type });
    t = Math.max(t, tip.at(-1));
    const down = add("delta", { t0: t, t1: t + linT(), kind: "lin", label: `Down into ${st(s).code}`, cmd: `MOVL ${st(s).code} v=400`, from: app, to: at, grip: [1, 1], part: type },
      "Wait: dial in position", "WAIT dial_inpos");
    const open = add("delta", { t0: down, t1: down + DM.open, kind: "io", label: release, cmd: "DO grip=0", from: at, to: at, grip: [1, 0], part: type });
    const up = add("delta", { t0: open, t1: open + linT(), kind: "lin", label: `Up out of ${st(s).code}`, cmd: `MOVL above_${st(s).code}`, from: at, to: app, grip: [0, 0], part: type });
    zones[s - 1].push([t, up + DM.clear, "delta"]);
    dT = up; dAt = app;
    return { t0: t, down, open, up, clear: up + DM.clear };
  }

  // ---- scara and tray state
  let sT = 0, sQ = qS7app, slot = TRAY.prefill, trayM = 0, trayReady = 0, pT = 0, rT = 0, vT = 0;
  for (let c = 0; c < NC_RUN; c++) {
    const Tip = tip[c];
    // ======== delta: S1 housing (held) -> S2 spring -> S3 cap, then pick the next housing during the index
    const aA = c + 6, aB = c + 5, aC = c + 4;
    const pA = asmOf(aA).parts.A;
    const z1 = deltaPlace(1, "A", aA, "Open: housing in nest");
    key(pA, z1.open - DM.open, { mode: "dial", n: nestOf(aA), dz: 0 });
    const pB = deltaPick(1, aB);
    const z2 = deltaPlace(2, "B", aB, "Open: spring drops into bore");
    const relZ = DZ.B - PART.B.grip - HB;            // spring bottom above the housing bottom at release
    key(pB, z2.open - DM.open, { mode: "fall", n: nestOf(aB), dz: relZ, dz1: STACK.B, t1: z2.open - DM.open + FALL_T, len: PART.B.free });
    key(pB, z2.open - DM.open + FALL_T, { mode: "dial", n: nestOf(aB), dz: STACK.B, len: PART.B.free });
    const pC = deltaPick(2, aC);
    const z3 = deltaPlace(3, "C", aC, "Open: cap on spring");
    key(pC, z3.open - DM.open, { mode: "dial", n: nestOf(aC), dz: STACK.C0 });
    const deltaClear = z3.clear;
    const pNext = deltaPick(0, c + 7);              // housing for the next cycle, picked while the dial indexes

    // ======== S4 press: snap the cap of assembly c + 3 and run the force-travel test
    const aP = c + 3, AP = asmOf(aP), test = pressTest(aP);
    let t = Math.max(pT, Tip);
    const app = add("press", { t0: t, t1: t + PRESS.tApp, kind: "lin", label: "Ram down to cap", cmd: "MOVE.ABS 0 V=250", z0: PZ.up, z1: PZ.contact, a: aP }, "Wait: dial in position", "WAIT DialInPos");
    const prs = add("press", { t0: app, t1: app + PRESS.tPress, kind: "press", label: `Snap cap ${aP} + force-travel`, cmd: "PRESS.FORCE_TRAVEL 4.5 mm  WINDOW 3.0-4.5 N", z0: PZ.contact, z1: PZ.bottom, a: aP, test });
    const dw = add("press", { t0: prs, t1: prs + PRESS.tDwell, kind: "io", label: "Hold, read load cell", cmd: "READ F@4.5", z0: PZ.bottom, z1: PZ.bottom, a: aP });
    const hookFail = AP.defect && AP.defect.kind === "hook";
    const rel = add("press", { t0: dw, t1: dw + PRESS.tRel, kind: "lin", label: "Release to latch", cmd: "MOVE.REL -1.5", z0: PZ.bottom, z1: PZ.latch + (hookFail ? AP.defect.rise : 0), a: aP });
    const ret = add("press", { t0: rel, t1: rel + PRESS.tRet, kind: "lin", label: "Ram up", cmd: "MOVE.ABS HOME", z0: PZ.latch + (hookFail ? AP.defect.rise : 0), z1: PZ.up, a: aP });
    zones[3].push([t, ret + PRESS.clear, "press"]);
    const pressClear = ret + PRESS.clear;
    AP.press = test; AP.pressed = true;
    marks.press.push({ a: aP, t0: app, t1: prs, rel, pass: test.pass, f45: test.f45, peak: test.peak, curve: test.curve, reason: test.reason });
    if (!test.pass) { AP.status = "reject"; AP.reason = test.reason; AP.failAt = 4; }
    if (AP.parts.C) {
      key(AP.parts.C, app, { mode: "dial", n: AP.nest, dz: STACK.C0, dz1: STACK.Cover, t1: prs });
      key(AP.parts.C, dw, { mode: "dial", n: AP.nest, dz: STACK.Cover, dz1: STACK.C1 + (hookFail ? AP.defect.rise : 0), t1: rel, tilt: hookFail ? AP.defect.tilt * RAD : 0 });
    }
    if (AP.parts.B) {
      key(AP.parts.B, app, { mode: "dial", n: AP.nest, dz: STACK.B, len: PART.B.free, len1: STACK.Cover - STACK.B, t1: prs });
      key(AP.parts.B, dw, { mode: "dial", n: AP.nest, dz: STACK.B, len: STACK.Cover - STACK.B, len1: STACK.C1 + (hookFail ? AP.defect.rise : 0) - STACK.B, t1: rel });
    }
    pT = ret;

    // ======== S5 vision on assembly c + 2 (capture blocks the index, processing does not)
    const aV = c + 2, AV = asmOf(aV);
    t = Math.max(vT, Tip + VISION.settle);
    const vPass = !(AV.defect && AV.defect.kind === "hook");
    const cap = add("vision", { t0: t, t1: t + VISION.tCap, kind: "inspect", label: `Capture assembly ${aV}`, cmd: "TRIG InspButton; FLASH 6 ms", a: aV }, "Wait: dial in position", "WAIT DialInPos");
    const proc = add("vision", { t0: cap, t1: cap + VISION.tProc, kind: "process", label: vPass ? "Cap height + tilt: OK" : "Cap tilt 4.2°: FAIL", cmd: "GET InspButton.Pass", a: aV, pass: vPass });
    const visionClear = cap;
    vT = proc;
    marks.vision.push({ a: aV, t0: t, t1: proc, pass: vPass, capH: vPass ? 0 : AV.defect.rise, tilt: vPass ? 0 : AV.defect.tilt, reason: vPass ? "" : AV.defect.text });
    if (!vPass && AV.status !== "reject") { AV.status = "reject"; AV.reason = AV.defect.text; AV.failAt = 5; }

    // ======== S6 reject unit: remove assembly c + 1 if it failed S4 or S5
    const aR = c + 1, AR = asmOf(aR);
    let rejectClear = Tip;
    if (AR.status === "reject") {
      t = Math.max(rT, Tip);
      const d1 = add("reject", { t0: t, t1: t + RJ.tDown, kind: "lin", label: `Down to reject ${aR}`, cmd: "Y1 ON (lift down)", v0: [0, 0], v1: [1, 0], grip: [0, 0], a: aR }, "Wait: dial in position", "WAIT DialInPos");
      const c1 = add("reject", { t0: d1, t1: d1 + RJ.tClose, kind: "io", label: "Close gripper", cmd: "Y2 ON (grip)", v0: [1, 0], v1: [1, 0], grip: [0, 1], a: aR });
      const u1 = add("reject", { t0: c1, t1: c1 + RJ.tUp, kind: "lin", label: "Lift", cmd: "Y1 OFF", v0: [1, 0], v1: [0, 0], grip: [1, 1], a: aR });
      const o1 = add("reject", { t0: u1, t1: u1 + RJ.tOut, kind: "lin", label: "Slide out over chute", cmd: "Y3 ON (slide)", v0: [0, 0], v1: [0, 1], grip: [1, 1], a: aR });
      const r1 = add("reject", { t0: o1, t1: o1 + RJ.tOpen, kind: "io", label: "Drop into reject chute", cmd: "Y2 OFF", v0: [0, 1], v1: [0, 1], grip: [1, 0], a: aR });
      const b1 = add("reject", { t0: r1, t1: r1 + RJ.tBack, kind: "lin", label: "Slide home", cmd: "Y3 OFF", v0: [0, 1], v1: [0, 0], grip: [0, 0], a: aR });
      zones[5].push([t, u1 + RJ.clear, "reject"]);
      rejectClear = u1 + RJ.clear;
      rT = b1;
      const nBin = marks.reject.length;
      const jit = (s) => Math.sin((nBin + 1) * s) * 0.5;
      const binP = [BIN.x + jit(12.9898) * 0.09, BIN.y + jit(78.233) * 0.05, BIN.floor + 0.006 * nBin];
      const rot = [1.2 + jit(3.1), 0.4 * jit(5.7), 2.0 * jit(9.3)];
      for (const [type, dz] of [["A", 0], ["B", STACK.B], ["C", AR.defect && AR.defect.kind === "hook" ? STACK.C1 + AR.defect.rise : STACK.C1]]) {
        const p = AR.parts[type];
        key(p, c1, { mode: "reject", dz });
        key(p, r1 - RJ.tOpen, { mode: "drop", dz, t1: r1 - RJ.tOpen + RJ.tDrop, p1: binP, rot });
        key(p, r1 - RJ.tOpen + RJ.tDrop, { mode: "bin", dz, p: binP, rot });
      }
      AR.dest = { bin: nBin };
      marks.reject.push({ a: aR, t0: t, t1: b1, reason: AR.reason, bin: binP });
    }

    // ======== S7 scara: unload assembly c (if it is still there) into the tray
    const aS = c, AS = asmOf(aS);
    let scaraClear = Tip;
    if (AS.status !== "reject") {
      t = Math.max(sT, Tip);
      const linT = (dz) => TM.linA + TM.linB * Math.abs(dz);
      const d1 = add("scara", { t0: t, t1: t + linT(qS7app[2] - qS7[2]), kind: "lin", label: `Move down to assembly ${aS}`, cmd: "Move P_S7", q0: qS7app, q1: qS7, grip: [0, 0], a: aS }, "Wait: dial in position", "Wait Sw(DialInPos) = On");
      const c1 = add("scara", { t0: d1, t1: d1 + TM.close, kind: "io", label: "Close fingers", cmd: "On Grip; Wait Sw(GripOK) = On", q0: qS7, q1: qS7, grip: [0, 1], a: aS });
      const u1 = add("scara", { t0: c1, t1: c1 + linT(qS7app[2] - qS7[2]), kind: "lin", label: "Move up", cmd: "Move P_S7App", q0: qS7, q1: qS7app, grip: [1, 1], a: aS });
      zones[6].push([t, u1 + TM.clear, "scara"]);
      scaraClear = u1 + TM.clear;
      const yawOff = st(7).a - SCARA.yaw;
      for (const [type, dz] of [["A", 0], ["B", STACK.B], ["C", STACK.C1]]) key(AS.parts[type], c1, { mode: "scara", dz, yawOff, len: PART.B.set });
      // tray slot (wait for an exchange in progress)
      const [ox, oy] = traySlot(slot), sx = TRAY.cx + ox, sy = TRAY.cy + oy;
      const qA = mustIK([sx, sy, T3.zTop], qS7app), qP = [...qA]; qP[2] = TRAY.top - TRAY.pocket + PART.A.grip;
      const ptpT = (qa, qb) => TM.ptpA + TM.ptpB * Math.max(Math.abs(qb[0] - qa[0]), Math.abs(qb[1] - qa[1]), 0.3 * Math.abs(qb[3] - qa[3]));
      const n = slot + 1;
      let u = add("scara", { t0: u1, t1: u1 + ptpT(qS7app, qA), kind: "ptp", label: `Go over tray slot ${n}`, cmd: `Go Pallet(1, ${n}) +Z(${((T3.zTop - qP[2]) * 1000).toFixed(0)})`, q0: qS7app, q1: qA, grip: [1, 1], a: aS });
      u = Math.max(u, trayReady);
      const d2 = add("scara", { t0: u, t1: u + linT(qA[2] - qP[2]), kind: "lin", label: "Move down into slot", cmd: `Move Pallet(1, ${n})`, q0: qA, q1: qP, grip: [1, 1], a: aS }, "Wait: tray exchange", "Wait Sw(TrayReady) = On");
      const o2 = add("scara", { t0: d2, t1: d2 + TM.open, kind: "io", label: `Release in slot ${n}`, cmd: "Off Grip", q0: qP, q1: qP, grip: [1, 0], a: aS });
      const u2 = add("scara", { t0: o2, t1: o2 + linT(qA[2] - qP[2]), kind: "lin", label: "Move up", cmd: "Move Here +Z", q0: qP, q1: qA, grip: [0, 0], a: aS });
      for (const [type, dz] of [["A", 0], ["B", STACK.B], ["C", STACK.C1]]) key(AS.parts[type], d2, { mode: "tray", m: trayM, slot, dz, yaw: yawOff + SCARA.yaw, len: PART.B.set });
      AS.status = "good"; AS.dest = { tray: trayM, slot };
      marks.place.push({ a: aS, tray: trayM, slot, t: d2 });
      slot++;
      const back = add("scara", { t0: u2, t1: u2 + ptpT(qA, qS7app), kind: "ptp", label: "Go over S7", cmd: "Go P_S7App", q0: qA, q1: qS7app, grip: [0, 0] });
      sT = back; sQ = qS7app;
      if (slot === CAP) {                              // tray full: exchange it
        const s0 = u2;
        const o = add("tray", { t0: s0, t1: s0 + TRAY.tOut, kind: "shuttle", label: `Full tray ${trayM + 1} out`, cmd: "SHUTTLE OUT", m: trayM, phase: "out" }, "Filling", "");
        const w = add("tray", { t0: o, t1: o + TRAY.tSwap, kind: "io", label: "Push full tray, drop empty", cmd: "PUSHER ON; MAG.DROP", m: trayM, phase: "swap" });
        const i = add("tray", { t0: w, t1: w + TRAY.tIn, kind: "shuttle", label: `Empty tray ${trayM + 2} in`, cmd: "SHUTTLE IN", m: trayM + 1, phase: "in" });
        trayLog.swaps.push({ m: trayM, t0: s0, t1: o, t2: w, t3: i });
        marks.swap.push({ m: trayM, t0: s0, t1: i });
        trayReady = i; trayM++; slot = 0;
      }
    }

    // ======== S8 empty-nest check
    const checkClear = Tip + CHECK.t;
    marks.check.push({ t: Tip, n: ((7 - c) % 8 + 8) % 8, empty: true });

    // ======== index: only when every tool is out of its nest zone (the interlock the tests perturb)
    let tIdx = Math.max(deltaClear, pressClear, rejectClear, scaraClear, visionClear, checkClear, Tip + DIAL.dwellMin);
    const i1 = add("dial", { t0: tIdx, t1: tIdx + IDX, kind: "index", label: `Index ${c + 1}`, cmd: `INDEX 45° T=${DIAL.index.toFixed(2)} s (modified sine)`, turn0: c, turn1: c + 1, k: c + 1 },
      "Dwell: stations working", "WAIT all_clear");
    marks.index.push({ k: c + 1, t0: tIdx, t1: i1 });
    tip.push(i1);
  }
  // the delta ends over S1 holding the next housing, like at t = 0
  const lastApp = appOf(1, "A");
  add("delta", { t0: dT, t1: dT + archT(dAt, lastApp), kind: "arch", label: "Transfer to S1", cmd: "MOVJ arch above_S1", from: dAt, to: lastApp, grip: [1, 1], part: "A" });
  // arrivals on each linear track for the whole run (the queue drawing needs them past the last pick)
  FEED.forEach((f, fi) => { const L = feeds[fi]; for (let j = 0; j < L.escS.length + f.q + 2; j++) if (arriveOf(fi, j) === Infinity) break; });
  // components still waiting in the pick nests at the end
  FEED.forEach((f, fi) => {
    const L = feeds[fi], k = F[fi].k;
    if (L.present[k] !== undefined) comp(f.part, null, L.present[k], { mode: "feed", f: fi });
  });
  const end = Math.max(...ACTORS.map((a) => segs[a].at(-1).t1), tip.at(-1)) + 0.10;
  for (const a of ACTORS) {
    const last = segs[a].at(-1);
    if (last.t1 < end - 1e-12) segs[a].push({ t0: last.t1, t1: end, kind: "wait", label: a === "dial" ? "Dwell" : "Idle", cmd: "", ...holdOf(a, last) });
    segs[a] = segs[a].filter((s, i, l) => s.t1 - s.t0 > 1e-12 || l.length === 1);
  }
  // steady-state cycle: average in-position spacing over the second half of the run (after the tray exchange settles)
  const h = Math.floor(tip.length / 2);
  CYCLE = (tip.at(-1) - tip[h]) / (tip.length - 1 - h);
  marks.tip = tip;
  return end;
}

// ---------------------------------------------------------------- evaluation: pure functions of t
function segAt(list, t) {
  let lo = 0, hi = list.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (list[mid].t0 <= t) lo = mid; else hi = mid - 1; }
  return list[lo];
}
const fracOf = (s, t) => clamp((t - s.t0) / Math.max(1e-9, s.t1 - s.t0), 0, 1);
function deltaPose(t) {
  const s = segAt(segs.delta, t), f = fracOf(s, t), e = ease(f);
  const a = s.from, b = s.to || a;
  const p = [lerp(a[0], b[0], e), lerp(a[1], b[1], e), lerp(a[2], b[2], e)];
  if (s.kind === "arch") p[2] += DM.arch * Math.sin(Math.PI * e);
  const grip = s.kind === "io" ? lerp(s.grip[0], s.grip[1], f) : s.grip[1];
  return { p, grip, part: s.part, seg: s, f };
}
function t3Pose(t) {
  const s = segAt(segs.scara, t), f = fracOf(s, t), e = ease(f);
  const q = s.q0.map((v, i) => lerp(v, s.q1[i], e));
  const grip = s.kind === "io" ? lerp(s.grip[0], s.grip[1], f) : s.grip[1];
  return { q, grip, seg: s, f };
}
function dialTurn(t) {   // dial steps completed (fractional while indexing)
  const s = segAt(segs.dial, t);
  if (s.kind !== "index") return s.turn1;
  return s.turn0 + modSine((t - s.t0 - DIAL.sig / 2) / DIAL.index);
}
const dialAngle = (t) => -dialTurn(t) * DIAL.step;           // radians, clockwise negative
const nestAngle = (n, t) => STATIONS[n].a + dialAngle(t);     // nest n starts at station n + 1
const nestXY = (n, t) => { const a = nestAngle(n, t); return [DIAL.cx + DIAL.nestR * Math.cos(a), DIAL.cy + DIAL.nestR * Math.sin(a)]; };
function dialState(t) { const s = segAt(segs.dial, t); return { seg: s, moving: s.kind === "index", turn: dialTurn(t), k: Math.floor(dialTurn(t) + 1e-9) }; }
function pressState(t) {
  const s = segAt(segs.press, t), f = fracOf(s, t);
  const e = s.kind === "press" ? f : ease(f);
  const z = lerp(s.z0, s.z1, e);
  const x = Math.max(0, (PZ.contact - z) * 1000);
  const test = s.test || (s.a != null && assemblies.get(s.a) ? assemblies.get(s.a).press : null);
  let F = 0;
  if (s.kind === "press" || (s.kind === "io" && s.a != null)) F = pressForce(x, test ? test.cond : {});
  else if (s.kind === "lin" && s.label === "Release to latch") F = lerp(pressForce(PRESS.over * 1000, test ? test.cond : {}), (test ? test.cond.k : PART.B.k) / 1000 * PRESS.latch * 1000, f);
  return { z, F, x, seg: s, f, a: s.a, test };
}
function visionState(t) {
  const s = segAt(segs.vision, t), f = fracOf(s, t);
  return { seg: s, f, flash: s.kind === "inspect" ? Math.sin(Math.PI * f) : 0, busy: s.kind !== "wait", a: s.a, pass: s.pass };
}
function rejectState(t) {   // lift 0 = up .. 1 = down, slide 0 = over the nest .. 1 = over the chute, grip 0 open .. 1 closed
  const s = segAt(segs.reject, t), f = fracOf(s, t), e = ease(f);
  const grip = s.kind === "io" ? lerp(s.grip[0], s.grip[1], f) : s.grip[1];
  return { seg: s, f, lift: lerp(s.v0[0], s.v1[0], e), slide: lerp(s.v0[1], s.v1[1], e), grip, a: s.a };
}
// Reject gripper TCP from its state (radial slide outward from S6).
function rejectTCP(r) {
  const S = st(6), ux = Math.cos(S.a), uy = Math.sin(S.a), d = r.slide * TOOL.rej.out;
  return [S.x + ux * d, S.y + uy * d, lerp(TOOL.rej.up, TOOL.rej.down, r.lift)];
}
function trayPose(m, t) {   // centre of tray m's top face, or null when it is not in the cell yet
  const sw = trayLog.swaps;
  const base = [TRAY.cx, TRAY.cy, TRAY.top];
  if (m === 0) {
    const s = sw[0];
    if (!s || t < s.t0) return base;
    if (t < s.t1) return [TRAY.cx + TRAY.out * ease((t - s.t0) / (s.t1 - s.t0)), TRAY.cy, TRAY.top];
    return [TRAY.cx + TRAY.out + TRAY.push * ease(clamp((t - s.t1) / (s.t2 - s.t1), 0, 1)), TRAY.cy, TRAY.top];
  }
  const s = sw[m - 1];
  if (!s) return null;
  const mag = [TRAY.cx + TRAY.out, TRAY.cy, TRAY.top + TRAY.drop];
  if (t < s.t1) return mag;
  if (t < s.t2) return [mag[0], mag[1], TRAY.top + TRAY.drop * (1 - ease((t - s.t1) / (s.t2 - s.t1)))];
  if (t < s.t3) return [TRAY.cx + TRAY.out * (1 - ease((t - s.t2) / (s.t3 - s.t2))), TRAY.cy, TRAY.top];
  const nx = sw[m];
  if (!nx || t < nx.t0) return base;
  if (t < nx.t1) return [TRAY.cx + TRAY.out * ease((t - nx.t0) / (nx.t1 - nx.t0)), TRAY.cy, TRAY.top];
  return [TRAY.cx + TRAY.out + TRAY.push * ease(clamp((t - nx.t1) / (nx.t2 - nx.t1), 0, 1)), TRAY.cy, TRAY.top];
}
function trayState(t) {
  const s = segAt(segs.tray, t), n = trayLog.swaps.length + 1;
  const count = (m) => marks.place.filter((p) => p.tray === m && p.t <= t).length + (m === 0 ? TRAY.prefill : 0);
  return { seg: s, phase: s.phase || "fill", trays: Array.from({ length: n }, (_, m) => ({ m, p: trayPose(m, t), count: count(m) })) };
}
// Linear feeder f at time t: the part in the pick nest, the queue on the track, the escapement progress.
// queue: [{ j, s }] with s = distance behind the pick point (m), front part first. During an escapement move the front
// part travels from s = pitch to s = 0 and the whole queue advances one pitch with it (esc = eased progress 0..1).
function feederState(fi, t) {
  const f = FEED[fi], L = feeds[fi];
  let k = 0;                                            // parts that have entered the pick nest by t (part 0 at t = 0)
  while (k + 1 < L.present.length && L.present[k + 1] <= t) k++;
  const picked = L.picks.filter((p) => p.t <= t).length;
  const present = picked <= k;                          // part k is in the nest until the delta closes on it
  let esc = 0;
  if (k < L.escS.length && t >= L.escS[k]) esc = ease(clamp((t - L.escS[k]) / ESC.t, 0, 1));
  const queue = [];
  let rank = 0;
  for (let j = k + 1; j < k + 1 + f.q + 2; j++) {
    const arr = j <= f.q ? -1 : (L.arrive[j] ?? Infinity);
    if (arr > t) {
      if (arr - ESC.travel <= t && arr !== Infinity) {      // travelling from the bowl outlet to the back of the queue
        const back = (rank + 1 - esc) * f.pitch, u = (t - (arr - ESC.travel)) / ESC.travel;
        queue.push({ j, s: lerp(f.track, back, ease(clamp(u, 0, 1))), moving: true });
      }
      break;
    }
    queue.push({ j, s: (rank + 1 - esc) * f.pitch });
    rank++;
  }
  const starved = queue.length < Math.min(f.q, 3);
  return { f: fi, present, k, esc, queue, picks: picked, starved, seg: segAt(segs[f.actor], t) };
}
function zoneOwner(s, t) { for (const [a, b, who] of zones[s - 1]) if (t >= a && t < b) return who; return null; }

// ---------------------------------------------------------------- clearance: capsule model (plain arrays)
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function segDist(p1, q1, p2, q2) {
  const d1 = vsub(q1, p1), d2 = vsub(q2, p2), r = vsub(p1, p2);
  const a = vdot(d1, d1), e = vdot(d2, d2), f = vdot(d2, r);
  let s, t;
  if (a < 1e-12 && e < 1e-12) return Math.hypot(...r);
  if (a < 1e-12) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = vdot(d1, r);
    if (e < 1e-12) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = vdot(d1, d2), den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  return Math.hypot(...[0, 1, 2].map((j) => p1[j] + d1[j] * s - (p2[j] + d2[j] * t)));
}
function deltaCapsules(p, ang) {   // upper arm + hub, elbow pin, rod pair + sockets + springs, effector plate, gripper
  const caps = [], eff = [p[0], p[1], p[2] + DELTA.tool];
  for (const J of deltaJoints(p, ang)) {
    caps.push([J.S, J.E, 0.040],
      [[J.E[0] - J.c * 0.055, J.E[1] - J.s * 0.055, J.E[2]], [J.E[0] + J.c * 0.055, J.E[1] + J.s * 0.055, J.E[2]], 0.022],
      [J.E, J.P, 0.060]);
  }
  caps.push([[eff[0], eff[1], eff[2] + 0.008], [eff[0], eff[1], eff[2] - 0.008], 0.075]);
  caps.push([eff, [p[0], p[1], p[2] - 0.002], 0.026]);
  return caps;
}
function t3Capsules(q) {       // envelopes of the real T3: arm 1, arm 2 (two layers), gripper, shaft, cable duct
  const k = t3FK(q), zb = T3G.riser, J1 = [SCARA.x, SCARA.y], J2 = k.j2, J3 = k.j3;
  const d = [J3[0] - J2[0], J3[1] - J2[1]], n = Math.hypot(d[0], d[1]);
  const tip = [J3[0] + d[0] / n * T3G.a2Front, J3[1] + d[1] / n * T3G.a2Front];
  const mid = [(J1[0] + J2[0]) / 2, (J1[1] + J2[1]) / 2];
  return [
    [[J1[0], J1[1], zb + 0.21], [J2[0], J2[1], zb + 0.21], 0.045],
    [[J2[0], J2[1], zb + 0.275], [tip[0], tip[1], zb + 0.275], 0.055],
    [[J2[0], J2[1], zb + 0.365], [tip[0], tip[1], zb + 0.335], 0.050],
    [[J3[0], J3[1], q[2] - 0.005], [J3[0], J3[1], q[2] + T3G.tool], 0.030],
    [[J3[0], J3[1], q[2] + T3G.tool], [J3[0], J3[1], q[2] + T3G.tool + T3G.shaftLen], 0.016],
    [[J1[0], J1[1], zb + T3G.ductBase], [mid[0], mid[1], zb + T3G.ductTop], 0.024],
    [[mid[0], mid[1], zb + T3G.ductTop], [J2[0], J2[1], zb + T3G.a2[1]], 0.024],
  ];
}
// Fixed tooling on the dial (column, star hub and arms, press, camera, S8 bracket) plus the moving reject unit.
function toolCapsules(t) {
  const caps = [], zs = (TOOL.star.z0 + TOOL.star.z1) / 2;
  caps.push([[0, 0, TOOL.column.z0], [0, 0, TOOL.column.z1], TOOL.column.r]);
  caps.push({ disc: [DIAL.cx, DIAL.cy, zs], R: TOOL.star.hubR, h: TOOL.star.z1 - TOOL.star.z0 });   // star hub: a flat disc
  for (const s of TOOL.star.stations) {
    const a = st(s).a;
    caps.push([[TOOL.star.hubR * Math.cos(a), TOOL.star.hubR * Math.sin(a), zs], [TOOL.star.armEnd * Math.cos(a), TOOL.star.armEnd * Math.sin(a), zs], 0.032]);
  }
  caps.push([[st(4).x, st(4).y, TOOL.press.z0], [st(4).x, st(4).y, TOOL.press.z1], TOOL.press.r]);
  caps.push([[st(5).x, st(5).y, TOOL.camera.z0], [st(5).x, st(5).y, TOOL.camera.z1], TOOL.camera.r]);
  caps.push([[st(5).x, st(5).y, TOOL.camera.ringZ], [st(5).x, st(5).y, TOOL.camera.ringZ + 0.012], TOOL.camera.ringR]);
  const s8 = st(8), tx = -Math.sin(s8.a) * TOOL.s8.offset, ty = Math.cos(s8.a) * TOOL.s8.offset;
  caps.push([[s8.x + tx, s8.y + ty, TOOL.s8.z0], [s8.x + tx, s8.y + ty, TOOL.s8.z1], 0.012]);
  const r = rejectTCP(rejectState(t)), S6 = st(6);
  caps.push([[S6.x, S6.y, TOOL.rej.railZ], [S6.x + Math.cos(S6.a) * TOOL.rej.out, S6.y + Math.sin(S6.a) * TOOL.rej.out, TOOL.rej.railZ], 0.028]);
  caps.push([[r[0], r[1], r[2] - 0.004], [r[0], r[1], TOOL.rej.railZ], 0.030]);
  return caps;
}
// Distance from segment pq to a flat disc (centre c, radius R, thickness h, axis z), by sampling the segment.
function segDiscDist(p, q, D) {
  let best = Infinity;
  for (let i = 0; i <= 32; i++) {
    const s = i / 32, x = p[0] + (q[0] - p[0]) * s - D.disc[0], y = p[1] + (q[1] - p[1]) * s - D.disc[1], z = p[2] + (q[2] - p[2]) * s - D.disc[2];
    const rho = Math.hypot(x, y), dz = Math.max(0, Math.abs(z) - D.h / 2);
    best = Math.min(best, rho <= D.R ? dz : Math.hypot(rho - D.R, dz));
  }
  return best;
}
function capsClear(A, B) {   // minimum surface distance between two capsule lists (B may also hold discs)
  let m = Infinity;
  for (const a of A) for (const b of B) m = Math.min(m, b.disc ? segDiscDist(a[0], a[1], b) - a[2] : segDist(a[0], a[1], b[0], b[1]) - a[2] - b[2]);
  return m;
}
const PAIRS = [["Delta", "T3"], ["Delta", "Tooling"], ["T3", "Tooling"]];
function clearances(dp, ang, q, t) {   // [delta-T3, delta-tooling, T3-tooling] in metres (NaN where the delta IK failed)
  const tc = t3Capsules(q), oc = toolCapsules(t), dc = ang ? deltaCapsules(dp, ang) : null;
  return [dc ? capsClear(dc, tc) : NaN, dc ? capsClear(dc, oc) : NaN, capsClear(tc, oc)];
}

// ---------------------------------------------------------------- sampling (report, paths, tests, CSV)
const RATE = 30;
let NS, S, ikFail, minClear, peakV, peakW, STATS;
function sampleCycle() {
  NS = Math.ceil(DURATION * RATE) + 1;
  S = { dp: [], da: [], tq: [], tp: [], cl: [[], [], []], dial: [] };
  ikFail = 0;
  for (let n = 0; n < NS; n++) {
    const t = Math.min(DURATION, n / RATE);
    const d = deltaPose(t), a = deltaIK(d.p), q = t3Pose(t).q;
    if (!a) ikFail++;
    S.dp.push(d.p); S.da.push(a || S.da.at(-1) || [0, 0, 0]);
    S.tq.push(q); S.tp.push(t3FK(q).tcp); S.dial.push(dialAngle(t));
    clearances(d.p, a, q, t).forEach((c, j) => S.cl[j].push(c));
  }
  minClear = S.cl.map((list) => {
    let m = Infinity, at = 0;
    list.forEach((c, n) => { if (c < m) { m = c; at = n / RATE; } });
    return { m, at };
  });
  peakV = 0; peakW = 0;
  for (let n = 1; n < NS; n++) {
    peakV = Math.max(peakV, Math.hypot(...S.dp[n].map((x, j) => x - S.dp[n - 1][j])) * RATE);
    for (let j = 0; j < 3; j++) peakW = Math.max(peakW, Math.abs(S.da[n][j] - S.da[n - 1][j]) * RATE);
  }
}
function busyOf(a, upTo = DURATION) { return segs[a].filter((s) => s.kind !== "wait").reduce((n, s) => n + Math.max(0, Math.min(s.t1, upTo) - s.t0), 0); }
function stats() {
  const all = [...assemblies.values()].filter((A) => A.a >= 0);
  const good = all.filter((A) => A.status === "good").length, rej = all.filter((A) => A.status === "reject" && A.dest && A.dest.bin != null).length;
  const util = Object.fromEntries(ACTORS.map((a) => [a, busyOf(a) / DURATION]));
  const bottleneck = ["delta", "press", "scara", "reject", "vision"].sort((x, y) => util[y] - util[x])[0];
  return { cycle: CYCLE, perHour: 3600 / CYCLE, good, rejected: rej, util, bottleneck, swaps: trayLog.swaps.length,
           quality: good / Math.max(1, good + rej), performance: (DIAL.sig + DIAL.index + 1.76) / CYCLE };
}
// what-if options: { index (s), rates: [A, B, C] parts/min, speed (delta motion speed, 1 = nominal) }
function applyOpts(o = {}) {
  DIAL.index = clamp(Math.round((o.index ?? DIAL.index0) / DIAL.knob) * DIAL.knob, DIAL.min, DIAL.max);
  DM.speed = clamp(o.speed ?? 1, 0.5, 1.25);
  FEED.forEach((f, i) => { f.rate = clamp(o.rates && o.rates[i] != null ? o.rates[i] : f.rate0, 5, 200); });
}
function rebuild(o = {}) {
  applyOpts(typeof o === "number" ? { index: o } : o);
  resetModel();
  DURATION = schedule();
  sampleCycle();
  STATS = stats();
  return { segs, zones, parts, assemblies, marks, feeds, trayLog, DURATION, CYCLE, S, NS, minClear, ikFail, peakV, peakW, STATS, index: DIAL.index, rates: FEED.map((f) => f.rate), speed: DM.speed };
}
// Schedule only (no sampling), for the what-if chart. Leaves the current model untouched.
function cycleFor(o = {}) {
  const keep = { segs, zones, parts, assemblies, marks, feeds, trayLog, DURATION, CYCLE, idx: DIAL.index, rates: FEED.map((f) => f.rate), speed: DM.speed };
  applyOpts(typeof o === "number" ? { index: o } : o);
  resetModel();
  const d = schedule();
  const util = Object.fromEntries(ACTORS.map((a) => [a, segs[a].filter((s) => s.kind !== "wait").reduce((n, s) => n + s.t1 - s.t0, 0) / d]));
  const waitOf = (a, label) => segs[a].filter((s) => s.kind === "wait" && s.label.startsWith(label)).reduce((n, s) => n + s.t1 - s.t0, 0);
  const out = { index: DIAL.index, rates: FEED.map((f) => f.rate), speed: DM.speed, DURATION: d, CYCLE, perHour: 3600 / CYCLE, util,
                deltaWaitsDial: waitOf("delta", "Wait: dial in position"), deltaWaitsParts: waitOf("delta", "Wait: A") + waitOf("delta", "Wait: B") + waitOf("delta", "Wait: C"),
                dialWaits: waitOf("dial", "Dwell") };
  ({ segs, zones, parts, assemblies, marks, feeds, trayLog, DURATION, CYCLE } = keep);
  DIAL.index = keep.idx; DM.speed = keep.speed; FEED.forEach((f, i) => { f.rate = keep.rates[i]; });
  return out;
}
function current() { return { segs, DURATION, CYCLE }; }
rebuild();
console.log("[cell] duration", DURATION.toFixed(2), "cycle", CYCLE.toFixed(3), "ikFail", ikFail, "minClear mm", minClear.map((c) => (c.m * 1000).toFixed(1)).join(" / "));
// @@logic-end
