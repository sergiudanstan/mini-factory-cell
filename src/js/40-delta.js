// ---------------------------------------------------------------- delta robot: 1130-class, hung under the portal plate (metres, z up)
const D = DELTA;
const deltaGroup = new THREE.Group(); deltaGroup.name = "delta"; world.add(deltaGroup);
MODULES.delta = deltaGroup;
const dl = LAYOUT.delta;
// Nominal triangle vertices point between the arms; fillets are tangent to its flat sides.
function deltaTriangle(radius, fillet, offsetDeg = 0) {
  const pts = [];
  for (const deg of D.arms.map((a) => a - 90 + 60 + offsetDeg)) {
    const a = deg * RAD, cx = (radius - 2 * fillet) * Math.cos(a), cy = (radius - 2 * fillet) * Math.sin(a);
    for (let j = -60; j <= 60; j += 6) pts.push([cx + fillet * Math.cos(a + j * RAD), cy + fillet * Math.sin(a + j * RAD)]);
  }
  return pts;
}
function deltaCylinder(r, z0, z1, material, parent) {
  const b = Math.min(0.0008, (z1 - z0) / 4, r / 4);
  return lathe([[0, z0], [r - b, z0], [r, z0 + b], [r, z1 - b], [r - b, z1], [0, z1]], material, parent);
}
// ---- fixed part: cast base with three drive lobes and a spun cover, bolted under the portal plate
const deltaFixed = new THREE.Group(); deltaFixed.position.set(D.cx, D.cy, 0); deltaGroup.add(deltaFixed);
const deltaZ0 = dl.baseZ[0], deltaZ1 = dl.baseZ[1];
extrudeXY(deltaTriangle(0.300, 0.060), deltaZ0, deltaZ0 + 0.050, M.ral7035, deltaFixed, 0.004);
extrudeXY(deltaTriangle(0.262, 0.055), deltaZ0 + 0.050, deltaZ1 - 0.030, M.ral7035, deltaFixed, 0.004);
lathe([[0.25, deltaZ1 - 0.030], [0.249, deltaZ1 - 0.029], [0.040, deltaZ1 - 0.002], [0, deltaZ1]], M.ral7035, deltaFixed, 64);
const deltaBadge = labelPlane("DELTA 1130 · 3 kg", 0.16, 0.03, { bg: "#cfd3cf", fg: "#2b2f33", px: 46 });
deltaBadge.position.set(0, -0.215, deltaZ0 + 0.025); deltaBadge.rotation.x = Math.PI / 2; deltaFixed.add(deltaBadge);
const deltaSpringMaterial = M.steel.clone();
{
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d"); ctx.fillStyle = "#aaa"; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#222"; ctx.lineWidth = 5;
  for (let y = -128; y < 256; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y + 16); ctx.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  deltaSpringMaterial.bumpMap = texture; deltaSpringMaterial.bumpScale = 0.0005;
}
// ---- travelling plate (effector), stainless
const eff = new THREE.Group(); eff.name = "delta_effector"; deltaGroup.add(eff);
const deltaPlateOutline = [];
for (const th of D.arms) {
  const c = Math.cos(th * RAD), s = Math.sin(th * RAD);
  for (const sg of [-1, 1]) deltaPlateOutline.push([0.032 * s + sg * 0.060 * c, -0.032 * c + sg * 0.060 * s]);
}
deltaPlateOutline.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
extrudeXY(deltaPlateOutline, -0.008, 0.008, M.stainlessBrushed, eff, 0.002);
const RH = dl.rodHalf;
const deltaArms = D.arms.map((th, ai) => {
  const c = Math.cos(th * RAD), s = Math.sin(th * RAD);
  const shoulder = new THREE.Group(); shoulder.name = `delta_shoulder_${ai}`;
  shoulder.position.set(D.cx + D.F * s, D.cy - D.F * c, D.zb); shoulder.rotation.z = th * RAD; deltaGroup.add(shoulder);
  const gearbox = deltaCylinder(dl.driveR, 0.032, 0.130, M.gearboxSilver, shoulder); gearbox.rotation.y = Math.PI / 2;
  rbox(0.010, 0.085, 0.085, 0.002, M.aluBlasted, 0.135, 0, 0, shoulder);
  rbox(0.170, 0.085, 0.085, 0.005, M.motorBlack, 0.225, 0, 0, shoulder);
  rbox(0.035, 0.028, 0.040, 0.002, M.motorBlack, 0.252, 0.042, 0.020, shoulder);
  for (const x of [0.242, 0.262]) { const gland = deltaCylinder(0.0055, 0, 0.014, M.blackRubber, shoulder); gland.rotation.x = -Math.PI / 2; gland.position.set(x, 0.056, 0.020); }
  rbox(0.070, 0.056, 0.085, 0.004, M.aluBlasted, -0.066, 0, 0, shoulder);
  for (const x of [-0.066, 0.112]) rbox(0.016, 0.056, deltaZ0 - D.zb, 0.002, M.aluBlasted, x, 0, (deltaZ0 - D.zb) / 2, shoulder);
  const pivot = new THREE.Group(); pivot.name = `delta_arm_${ai}`; shoulder.add(pivot);
  const hub = deltaCylinder(0.048, -0.032, 0.032, M.aluClear, pivot); hub.rotation.y = Math.PI / 2;
  const upper = deltaCylinder(0.024, 0, D.RF, M.carbonGloss, pivot); upper.rotation.x = Math.PI / 2;
  rbox(0.056, 0.056, 0.070, 0.004, M.aluClear, 0, -D.RF, 0, pivot);
  const pin = deltaCylinder(0.008, -RH - 0.008, RH + 0.008, M.steel, pivot); pin.rotation.y = Math.PI / 2; pin.position.y = -D.RF;
  const elbowBalls = [], plateBalls = [], rods = [], cups = [];
  for (const sg of [-1, 1]) {
    const eb = mesh(new THREE.SphereGeometry(dl.ball, 20, 12), M.steel, pivot); eb.position.set(sg * RH, -D.RF, 0); elbowBalls.push(eb);
    const pb = mesh(new THREE.SphereGeometry(dl.ball, 20, 12), M.steel, eff); pb.position.set(D.E * s + sg * RH * c, -D.E * c + sg * RH * s, 0); plateBalls.push(pb);
    const stud = deltaCylinder(0.005, 0, D.E - 0.030, M.steel, eff); stud.quaternion.setFromUnitVectors(V(0, 0, 1), V(s, -c, 0)); stud.position.set(0.030 * s + sg * RH * c, -0.030 * c + sg * RH * s, 0);
    const r = rod(dl.rodR, M.carbonMatte, 24); r.name = `delta_rod_${ai}_${sg > 0 ? 1 : 0}`; deltaGroup.add(r); rods.push(r);
    cups.push([0, 1].map(() => lathe([[0.012, -0.013], [0.0165, -0.0125], [0.017, -0.010], [0.017, 0.010], [0.011, 0.026], [0.010, 0.026]], M.whitePOM, deltaGroup, 24)));
  }
  const springs = Array.from({ length: 4 }, () => { const r = rod(0.004, deltaSpringMaterial, 16); deltaGroup.add(r); return r; });
  return { th, c, s, shoulder, pivot, rods, cups, elbowBalls, plateBalls, springs };
});
// ---- stepped 2-finger parallel gripper (one tool for housing, spring and cap). TCP = fingertip centre at z = -D.tool.
deltaCylinder(0.032, -0.020, -0.008, M.aluClear, eff);                                  // ISO flange adaptor
rbox(0.050, 0.034, 0.046, 0.003, M.aluDark, 0, 0, -0.045, eff);                         // gripper body
rbox(0.058, 0.020, 0.010, 0.002, M.aluBlasted, 0, 0, -0.073, eff);                       // jaw guide
const deltaFingers = [-1, 1].map((sg) => {
  const f = new THREE.Group(); f.name = `delta_finger_${sg > 0 ? 1 : 0}`; eff.add(f);
  rbox(0.008, 0.014, 0.020, 0.0015, M.steel, sg * 0.004, 0, -0.088, f);                  // upper finger (housing / cap step)
  rbox(0.004, 0.010, 0.018, 0.0010, M.steel, sg * 0.002, 0, -D.tool + 0.010, f);         // fingertip (spring step)
  return f;
});
const deltaLedMat = M.lampGreen.clone(); deltaLedMat.emissive.setHex(0x18d040); deltaLedMat.emissiveIntensity = 0;
const deltaLed = deltaCylinder(0.004, 0, 0.006, deltaLedMat, eff); deltaLed.position.set(0.026, 0.0, -0.040); deltaLed.rotation.y = Math.PI / 2;
const deltaHoseClips = [0.3, 0.7].map(() => rbox(0.016, 0.016, 0.014, 0.002, M.whitePOM, 0, 0, 0, deltaGroup));
const deltaHoseStart = V(D.cx, D.cy, deltaZ0);
const deltaHose = tubeAlong([deltaHoseStart, V(D.cx, D.cy, 0.8), V(D.cx + 0.025, D.cy, 0.5)], 0.003, M.puBlue, deltaGroup, 64, 10);
let deltaLastPose = null;
// finger gap: gripW of the part + 6 mm when open; the spring uses the fingertip step
function deltaFingerGap(part, grip) { const w = PART[part || "A"].gripW; return lerp(w + 0.006, w, clamp(grip, 0, 1)); }
function setDelta(p, ang, grip = 0, part = "A") {
  eff.position.set(p[0], p[1], p[2] + D.tool);
  const gap = deltaFingerGap(part, grip), tipStep = part === "B" ? 0 : 0.004;
  deltaFingers.forEach((f, i) => { f.position.x = (i ? 1 : -1) * (gap / 2 + tipStep); });
  deltaLedMat.emissiveIntensity = grip > 0.5 ? 1.6 : 0;
  let hosePoints;
  deltaArms.forEach((A, i) => {
    const al = ang[i]; A.pivot.rotation.x = al;
    const E = V(D.cx + (D.F + D.RF * Math.cos(al)) * A.s, D.cy - (D.F + D.RF * Math.cos(al)) * A.c, D.zb - D.RF * Math.sin(al));
    const Pp = V(p[0] + D.E * A.s, p[1] - D.E * A.c, p[2] + D.tool);
    const tangent = V(A.c, A.s, 0), direction = Pp.clone().sub(E).normalize();
    [-1, 1].forEach((sg, j) => {
      const a = E.clone().addScaledVector(tangent, sg * RH), b = Pp.clone().addScaledVector(tangent, sg * RH);
      placeRod(A.rods[j], a, b);
      A.cups[j].forEach((cup, end) => { cup.position.copy(end ? b : a); cup.quaternion.setFromUnitVectors(V(0, 0, 1), direction.clone().multiplyScalar(end ? -1 : 1)); });
    });
    [E, Pp].forEach((end, k) => [-1, 1].forEach((sg, j) => {
      const centre = end.clone().addScaledVector(direction, sg * 0.016);
      placeRod(A.springs[k * 2 + j], centre.clone().addScaledVector(tangent, -RH), centre.clone().addScaledVector(tangent, RH));
    }));
    if (i === 0) {
      const radial = V(A.s, -A.c, 0);
      const clips = [0.3, 0.7].map((f, j) => {
        const point = E.clone().lerp(Pp, f).addScaledVector(tangent, RH).addScaledVector(radial, 0.014);
        deltaHoseClips[j].position.copy(point); deltaHoseClips[j].quaternion.setFromUnitVectors(V(0, 0, 1), direction); return point;
      });
      hosePoints = [deltaHoseStart, E.clone().addScaledVector(radial, 0.040), ...clips, V(p[0] + 0.026, p[1], p[2] + D.tool - 0.040)];
    }
  });
  updateTube(deltaHose, hosePoints);
  deltaLastPose = { p: [...p], ang: [...ang], grip, part };
}
// Check actual rod mesh endpoints against independently parented link ball centres for every sample (mm).
function deltaCheck() {
  const saved = deltaLastPose;
  let maxMM = 0;
  try {
    if (!S.dp.length || S.dp.length !== S.da.length) throw new Error("Missing delta samples");
    for (let n = 0; n < S.dp.length; n += 3) {
      setDelta(S.dp[n], S.da[n]); world.updateWorldMatrix(true, true);
      for (const A of deltaArms) A.rods.forEach((bar, j) => {
        bar.geometry.computeBoundingBox();
        const bounds = bar.geometry.boundingBox, centre = bounds.getCenter(V(0, 0, 0));
        for (const [y, ball] of [[bounds.max.y, A.plateBalls[j]], [bounds.min.y, A.elbowBalls[j]]]) {
          const end = bar.localToWorld(V(centre.x, y, centre.z)), target = ball.getWorldPosition(V(0, 0, 0));
          const mm = end.distanceTo(target) * 1000;
          if (!Number.isFinite(mm)) throw new Error("Non-finite delta endpoint error");
          maxMM = Math.max(maxMM, mm);
        }
      });
    }
  } finally { if (saved) setDelta(saved.p, saved.ang, saved.grip, saved.part); }
  return maxMM;
}
setDelta(S.dp[0], S.da[0], 1, "A");
window.pcHooks = Object.assign(window.pcHooks || {}, { deltaCheck });
