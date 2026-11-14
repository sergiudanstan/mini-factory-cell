// ---------------------------------------------------------------- playback
let time = 0, playing = true, speed = 1;
const playIcon = $("play-icon");
function setPlaying(p) {
  playing = p;
  playIcon.innerHTML = p ? '<path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z"/>' : '<path d="M7 4.5v15l13-7.5z"/>';
  $("play").setAttribute("aria-label", p ? "Pause" : "Play");
}
function seek(t) { time = clamp(t, 0, DURATION); if (mode !== "program") setMode("program"); }
$("play").addEventListener("click", () => { if (mode !== "program") setMode("program"); if (!playing && time >= DURATION) time = 0; setPlaying(!playing); });
$("restart").addEventListener("click", () => { time = 0; });
document.querySelectorAll(".chips button").forEach((b) => b.addEventListener("click", () => {
  speed = Number(b.dataset.speed); document.querySelectorAll(".chips button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
}));
$("trail").addEventListener("change", (e) => paths.forEach((p) => { p.ghost.visible = p.live.visible = e.target.checked && mode === "program"; }));
$("guards").addEventListener("change", (e) => setGuards(e.target.checked));
$("hallbox").addEventListener("change", (e) => setHall(e.target.checked));
const tl = $("timeline");
let scrubbing = false;
const scrubTo = (e) => { const r = tl.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * DURATION); };
tl.addEventListener("pointerdown", (e) => { scrubbing = true; tl.setPointerCapture(e.pointerId); scrubTo(e); });
tl.addEventListener("pointermove", (e) => { if (scrubbing) scrubTo(e); });
tl.addEventListener("pointerup", () => { scrubbing = false; });
tl.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") seek(time + 0.5); if (e.key === "ArrowLeft") seek(time - 0.5); });
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); $("play").click(); }
});
function setMode(m) {
  mode = m;
  document.querySelectorAll(".mode-switch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
  if (m === "manual") { setPlaying(false); $("jog-copy").click(); }
  paths.forEach((p) => { p.ghost.visible = p.live.visible = $("trail").checked && m === "program"; });
  syncPanels();
}
document.querySelectorAll(".mode-switch button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
function setHall(on) { HALL.root.children.forEach((o) => { if (o !== HALL.floor) o.visible = !!on; }); }
if (QS.get("hall") === "0") { $("hallbox").checked = false; setHall(false); }
// ?solo=<module>: only that module (tools/stats.mjs, module screenshots)
const SOLO = QS.get("solo");
if (SOLO && MODULES[SOLO]) for (const [k, g] of Object.entries(MODULES)) g.visible = k === SOLO || (k === "hall" && false);

// ---------------------------------------------------------------- tracked parts: one InstancedMesh per part type
// A component's world pose follows its track keyframes (feeder nest, delta gripper, fall, dial nest, reject unit, bin,
// T3 gripper, tray). Components of one assembly share its carrier, offset by dz (bottom above the housing bottom).
const trackedRoot = moduleRoot("product");
const TYPE_FEED = { A: 0, B: 1, C: 2 };
let tracked = {};
function partGeoMerged(type, lod) {
  const list = prodGeometry(type, lod).map((p) => { let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone(); for (const k of Object.keys(g.attributes)) if (!["position", "normal"].includes(k)) g.deleteAttribute(k); return g; });
  return BufferGeometryUtils.mergeGeometries(list, false);
}
const trackedGeo = { A: partGeoMerged("A", 1), B: partGeoMerged("B", 1), C: partGeoMerged("C", 1) };
function rebuildTracked() {
  for (const k of Object.keys(tracked)) { trackedRoot.remove(tracked[k].im); tracked[k].im.dispose(); }
  tracked = {};
  for (const type of ["A", "B", "C"]) {
    const list = parts.filter((p) => p.type === type);
    const im = new THREE.InstancedMesh(trackedGeo[type], PROD_MAT[type], Math.max(1, list.length));
    im.name = `product_${type}`; im.castShadow = im.receiveShadow = true; im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); trackedRoot.add(im);
    tracked[type] = { im, list };
  }
}
rebuildTracked();
const _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _pq2 = new THREE.Quaternion(), _pe = new THREE.Euler(), _pp = new THREE.Vector3(), _ps = new THREE.Vector3(), _pz = V(0, 0, 1);
function keyAt(track, t) { let k = null; for (const e of track) { if (e.t <= t + 1e-9) k = e; else break; } return k; }
function partPose(p, t, dp, tp) {   // -> { x, y, z (bottom), yaw, tilt, rot?, len } or null when not in the scene
  const k = keyAt(p.track, t);
  if (!k) return null;
  const P = PART[p.type], f = (a, b) => (k.t1 != null ? clamp((t - k.t) / Math.max(1e-6, k.t1 - k.t), 0, 1) : 0);
  const len = k.len != null ? (k.len1 != null ? lerp(k.len, k.len1, f()) : k.len) : P.free;
  switch (k.mode) {
    case "feed": { const F = FEED[k.f]; return { x: F.x, y: F.y, z: PICK.z, yaw: F.a, len }; }
    case "delta": return { x: dp.p[0], y: dp.p[1], z: dp.p[2] - P.grip, yaw: FEED[TYPE_FEED[p.type]].a, len };
    case "fall": { const [x, y] = nestXY(k.n, t), s = f(); return { x, y, z: HB + lerp(k.dz, k.dz1, s * s), yaw: nestAngle(k.n, t), len }; }
    case "dial": { const [x, y] = nestXY(k.n, t); return { x, y, z: HB + (k.dz1 != null ? lerp(k.dz, k.dz1, f()) : k.dz), yaw: nestAngle(k.n, t), tilt: k.tilt || 0, len }; }
    case "reject": { const r = rejectTCP(rejectState(t)); return { x: r[0], y: r[1], z: r[2] - PART.A.grip + k.dz, yaw: st(6).a, len: PART.B.set }; }
    case "drop": {
      const r0 = rejectTCP({ lift: 0, slide: 1 }), s = f(), e = s * s;
      return { x: lerp(r0[0], k.p1[0], s), y: lerp(r0[1], k.p1[1], s), z: lerp(r0[2] - PART.A.grip, k.p1[2], e) + k.dz * (1 - e), yaw: st(6).a, rot: k.rot.map((v) => v * e), len: PART.B.set };
    }
    case "bin": return { x: k.p[0], y: k.p[1], z: k.p[2], yaw: st(6).a, rot: k.rot, dzLocal: k.dz, len: PART.B.set };
    case "scara": { const K = t3FK(tp.q); return { x: K.tcp[0], y: K.tcp[1], z: K.tcp[2] - PART.A.grip + k.dz, yaw: K.yaw + k.yawOff, len }; }
    case "tray": { const T = trayPose(k.m, t); if (!T) return null; const [ox, oy] = traySlot(k.slot); return { x: T[0] + ox, y: T[1] + oy, z: T[2] - TRAY.pocket + k.dz, yaw: k.yaw, len }; }
  }
  return null;
}
function placeParts(t, dp, tp) {
  for (const type of ["A", "B", "C"]) {
    const { im, list } = tracked[type];
    let n = 0;
    for (const p of list) {
      const q = partPose(p, t, dp, tp);
      if (!q) continue;
      _pp.set(q.x, q.y, q.z);
      if (q.rot) {   // tumbling into the bin: rotate about the housing bottom, components keep their stack offset
        _pe.set(q.rot[0], q.rot[1], q.yaw + q.rot[2]); _pq.setFromEuler(_pe);
        if (q.dzLocal) _pp.add(V(0, 0, q.dzLocal).applyQuaternion(_pq));
      } else {
        _pq.setFromAxisAngle(_pz, q.yaw);
        if (q.tilt) { _pq2.setFromAxisAngle(V(Math.cos(q.yaw), Math.sin(q.yaw), 0), q.tilt); _pq.premultiply(_pq2); }
      }
      _ps.set(1, 1, type === "B" ? q.len / PART.B.free : 1);
      _pm.compose(_pp, _pq, _ps); im.setMatrixAt(n++, _pm);
    }
    im.count = n; im.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- per frame
function update(dt) {
  let dp, tp, ang;
  if (mode === "program") {
    if (playing) {
      time += dt * speed;
      if (time >= DURATION) { if ($("loop").checked) time %= DURATION; else { time = DURATION; setPlaying(false); } }
    }
    dp = deltaPose(time); tp = t3Pose(time); ang = deltaIK(dp.p);
    showNow("dial", dialState(time).seg); showNow("delta", dp.seg); showNow("scara", tp.seg);
    showNow("press", segAt(segs.press, time)); showNow("vision", segAt(segs.vision, time)); showNow("reject", segAt(segs.reject, time));
    placeParts(time, dp, tp);
    showOwners(time);
    updateProgram(time);
    const idx = Math.min(NS - 1, Math.round(time * RATE));
    paths.forEach((p) => p.live.geometry.setDrawRange(0, idx + 1));
    $("playhead").style.left = `${(time / DURATION) * 100}%`;
    $("clock-now").textContent = time.toFixed(1);
    $("live-sub").textContent = `${time.toFixed(1)} s`;
  } else {
    ang = deltaIK(jog.dp);
    const ok = !!ang; $("jog-delta-ik").textContent = ok ? "reachable" : "out of reach"; $("jog-delta-ik").className = ok ? "ok" : "warn";
    if (ang) lastJogAng = ang;
    ang = ang || lastJogAng;
    dp = { p: jog.dp, grip: jog.grip, part: "A", seg: null }; tp = { q: jog.q, grip: jog.tgrip };
    placeParts(0, deltaPose(0), t3Pose(0));
    $("live-sub").textContent = "manual";
  }
  const t = mode === "program" ? time : 0;
  if (ang) setDelta(dp.p, ang, dp.grip, dp.part);
  setT3(t3Model, tp.q, tp.grip);
  updateDial(t); updateBowls(t); updateOutfeed(t); updateHall(t);
  const cl = clearances(dp.p, ang, tp.q, t);
  const jMin = cl.reduce((m, c, j) => (c < cl[m] || !Number.isFinite(cl[m]) ? j : m), 0);
  const ps = pressState(t);
  const swap = segAt(segs.tray, t).kind !== "wait";
  setStack(Number.isFinite(cl[jMin]) && cl[jMin] < 0.025 ? "alarm" : swap ? "call" : mode === "program" && playing ? "run" : "hold");
  paintHmi(dt, cl[jMin], ps);
  updateLive(t, { clear: cl[jMin], pair: jMin, press: ps });
  updateProcess(t, ps); updateFeeders(t);
  showJoints(ang, tp.q);
  ["x", "y", "z"].forEach((c, j) => {
    $(`tcp-delta-${c}`).textContent = (dp.p[j] * 1000).toFixed(0);
    $(`tcp-scara-${c}`).textContent = (t3FK(tp.q).tcp[j] * 1000).toFixed(0);
  });
}
let lastJogAng = S.da[0];

// ---------------------------------------------------------------- HMI screen on the swing arm
let hmiAcc = 0.5;
function paintHmi(dt, clearM, ps) {
  hmiAcc += dt;
  if (hmiAcc < 0.5) return;
  hmiAcc = 0;
  const c = hmiScreen.canvas, g = c.getContext("2d");
  g.fillStyle = "#12161b"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#8fd0c8"; g.font = "600 30px sans-serif"; g.fillText("PB-01 · PUSH-BUTTON CELL", 24, 46);
  const hold = !(mode === "program" && playing);
  g.fillStyle = hold ? "#e0b15a" : "#7ddea0"; g.font = "700 50px sans-serif"; g.fillText(hold ? "HOLD" : "AUTO", 24, 112);
  g.fillStyle = "#d7dee6"; g.font = "500 25px sans-serif";
  const good = marks.place.filter((p) => p.t <= time).length, rej = marks.reject.filter((r) => r.t0 <= time).length;
  [`Cycle  ${CYCLE.toFixed(2)} s   ${Math.round(3600 / CYCLE)} /h`, `Good   ${good}    Reject ${rej}`, `S4     ${ps.F.toFixed(1)} N`,
   `Clear  ${Number.isFinite(clearM) ? Math.round(clearM * 1000) : "–"} mm`, `t      ${time.toFixed(1)} / ${DURATION.toFixed(1)} s`]
    .forEach((line, i) => g.fillText(line, 24, 166 + i * 40));
  hmiScreen.texture.needsUpdate = true;
}

// ---------------------------------------------------------------- loop
const timer = new THREE.Timer();
timer.connect(document);
function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  if (flight) {
    flight.t = Math.min(1, flight.t + dt / 0.8); const e = ease(flight.t);
    camera.position.lerpVectors(flight.fromP, flight.toP, e); controls.target.lerpVectors(flight.fromT, flight.toT, e);
    if (flight.t >= 1) flight = null;
  }
  update(dt);
  controls.update();
  renderFrame();
  requestAnimationFrame(frame);
}
window.addEventListener("themechange", applyTheme);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
syncPanels(); resize(); applyTheme(); refreshAll(); syncJog(); setPlaying(true);
// hooks for recording, tools and checks
window.pc = {
  get segs() { return segs; }, get parts() { return parts; }, get marks() { return marks; }, get zones() { return zones; },
  get DURATION() { return DURATION; }, get CYCLE() { return CYCLE; }, get STATS() { return STATS; },
  get minClear() { return minClear; }, get ikFail() { return ikFail; }, get S() { return S; }, get time() { return time; },
  views: Object.keys(views), modules: Object.keys(MODULES),
  seek, pause: () => setPlaying(false), play: () => setPlaying(true), setView, setOpts: refreshModel,
  setCamera: (pos, target) => {
    flight = null;
    camera.position.set(pos[0], pos[1], pos[2]);
    controls.target.set(target[0], target[1], target[2]);
    controls.update();
  },
  renderInfo: () => {   // one plain scene pass (incl. the shadow map), independent of the post-processing passes
    renderer.info.autoReset = false; renderer.info.reset(); renderer.render(scene, camera);
    const i = renderer.info, out = { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
    renderer.info.autoReset = true; return out;
  },
  checks: () => ({ delta: window.pcHooks?.deltaCheck?.(), t3: window.pcHooks?.t3Check?.(), cad: window.pcHooks?.cadCheck?.() }),
  ...(window.pcHooks || {}),
};
window.pcReady = true;
requestAnimationFrame(frame);
