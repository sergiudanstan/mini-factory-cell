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
function deltaMergeDirect(parent) {
  const batches = new Map();
  for (const o of [...parent.children]) {
    if (!o.isMesh || o.isInstancedMesh) continue;
    o.updateMatrix();
    let g = o.geometry.clone();
    if (g.index) { const old = g; g = g.toNonIndexed(); old.dispose(); }
    g.applyMatrix4(o.matrix);
    for (const key of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(key)) g.deleteAttribute(key);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!batches.has(o.material)) batches.set(o.material, []);
    batches.get(o.material).push(g);
    parent.remove(o); o.geometry.dispose();
  }
  return [...batches].map(([material, geometries]) => {
    const geo = BufferGeometryUtils.mergeGeometries(geometries, false);
    if (!geo) throw new Error("Delta geometry merge failed");
    geometries.forEach((g) => g.dispose());
    return mesh(geo, material, parent);
  });
}
function deltaMergeStatic(groups, target) {
  const batches = new Map();
  for (const group of groups) {
    group.updateMatrix();
    for (const o of [...group.children]) {
      if (!o.isMesh || o.isInstancedMesh) continue;
      o.updateMatrix();
      let g = o.geometry.clone();
      if (g.index) { const old = g; g = g.toNonIndexed(); old.dispose(); }
      g.applyMatrix4(group.matrix.clone().multiply(o.matrix));
      for (const key of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(key)) g.deleteAttribute(key);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!batches.has(o.material)) batches.set(o.material, []);
      batches.get(o.material).push(g);
      group.remove(o); o.geometry.dispose();
    }
  }
  return [...batches].map(([material, geometries]) => {
    const geo = BufferGeometryUtils.mergeGeometries(geometries, false);
    if (!geo) throw new Error("Delta static geometry merge failed");
    geometries.forEach((g) => g.dispose());
    return mesh(geo, material, target);
  });
}
function deltaInstance(geometry, material, count, name, parent = deltaGroup) {
  const o = new THREE.InstancedMesh(geometry, material, count);
  o.name = name; o.castShadow = o.receiveShadow = true; o.frustumCulled = false; parent.add(o);
  return o;
}
const deltaDummy = new THREE.Object3D();
function deltaSetInstance(instances, index, position, quaternion = new THREE.Quaternion(), scale = V(1, 1, 1)) {
  deltaDummy.position.copy(position); deltaDummy.quaternion.copy(quaternion); deltaDummy.scale.copy(scale);
  deltaDummy.updateMatrix(); instances.setMatrixAt(index, deltaDummy.matrix);
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
const deltaStatusMaterial = M.lampGreen.clone();
deltaStatusMaterial.emissive.setHex(0x20c060); deltaStatusMaterial.emissiveIntensity = 0.45;
const deltaNameTemplate = labelPlane("IRB 360", 0.056, 0.014, { bg: "#dce2e5", fg: "#24313a", px: 192 });
const deltaBallInstances = deltaInstance(new THREE.SphereGeometry(dl.ball, 20, 12), M.steel, 12, "delta_ball_sockets");
const deltaCupGeometry = new THREE.LatheGeometry([
  [0.012, -0.013], [0.0165, -0.0125], [0.017, -0.010], [0.017, 0.010], [0.011, 0.026], [0.010, 0.026],
].map(([r, z]) => new THREE.Vector2(r, z)), 24);
deltaCupGeometry.rotateX(Math.PI / 2);
const deltaCupInstances = deltaInstance(deltaCupGeometry, M.whitePOM, 12, "delta_pom_cups");
const deltaSpringGeometry = new THREE.CylinderGeometry(0.004, 0.004, 1, 16); deltaSpringGeometry.clearGroups();
const deltaSpringInstances = deltaInstance(deltaSpringGeometry, deltaSpringMaterial, 12, "delta_end_springs");
const deltaClipGeometry = new RoundedBoxGeometry(0.018, 0.014, 0.006, 3, 0.001); deltaClipGeometry.clearGroups();
const deltaClipInstances = deltaInstance(deltaClipGeometry, M.whitePOM, 2, "delta_hose_clips");
const deltaRodGeometry = new THREE.CylinderGeometry(dl.rodR, dl.rodR, 1, 24); deltaRodGeometry.clearGroups();
const deltaRodInstances = deltaInstance(deltaRodGeometry, M.carbonMatte, 6, "delta_carbon_rods");
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
let deltaBallIndex = 0, deltaCupIndex = 0, deltaSpringIndex = 0, deltaRodIndex = 0;
const deltaStatusRingGeometry = new THREE.TorusGeometry(0.026, 0.0015, 8, 24);
const deltaRibMaterial = M.motorBlack;
const deltaFacePlateMaterial = M.aluClear;
const deltaArms = D.arms.map((th, ai) => {
  const c = Math.cos(th * RAD), s = Math.sin(th * RAD);
  const shoulder = new THREE.Group(); shoulder.name = `delta_shoulder_${ai}`;
  shoulder.position.set(D.cx + D.F * s, D.cy - D.F * c, D.zb); shoulder.rotation.z = th * RAD; deltaGroup.add(shoulder);
  const gearbox = deltaCylinder(dl.driveR, 0.032, 0.130, M.gearboxSilver, shoulder); gearbox.rotation.y = Math.PI / 2;
  rbox(0.010, 0.085, 0.085, 0.002, M.aluBlasted, 0.135, 0, 0, shoulder);
  rbox(0.170, 0.085, 0.085, 0.005, M.motorBlack, 0.225, 0, 0, shoulder);
  rbox(0.035, 0.028, 0.040, 0.002, M.motorBlack, 0.252, 0.042, 0.020, shoulder);
  for (let i = 0; i < 7; i++) rbox(0.006, 0.004, 0.070, 0.001, deltaRibMaterial, 0.158 + i * 0.021, 0.044, 0, shoulder);
  for (const x of [0.155, 0.173, 0.191, 0.259, 0.277, 0.295]) rbox(0.006, 0.004, 0.070, 0.001, deltaRibMaterial, x, -0.044, 0, shoulder);
  rbox(0.060, 0.002, 0.017, 0.001, deltaFacePlateMaterial, 0.225, -0.044, 0, shoulder);
  const nameplate = mesh(deltaNameTemplate.geometry, deltaNameTemplate.material, shoulder);
  nameplate.position.set(0.225, -0.0452, 0); nameplate.rotation.x = Math.PI / 2;
  const statusRing = mesh(deltaStatusRingGeometry, deltaStatusMaterial, shoulder);
  statusRing.position.set(0.314, 0, 0); statusRing.rotation.y = Math.PI / 2;
  for (const x of [0.242, 0.262]) { const gland = deltaCylinder(0.0055, 0, 0.014, M.blackRubber, shoulder); gland.rotation.x = -Math.PI / 2; gland.position.set(x, 0.056, 0.020); }
  rbox(0.070, 0.056, 0.085, 0.004, M.aluBlasted, -0.066, 0, 0, shoulder);
  for (const x of [-0.066, 0.112]) rbox(0.016, 0.056, deltaZ0 - D.zb, 0.002, M.aluBlasted, x, 0, (deltaZ0 - D.zb) / 2, shoulder);
  const pivot = new THREE.Group(); pivot.name = `delta_arm_${ai}`; shoulder.add(pivot);
  const hub = deltaCylinder(0.048, -0.032, 0.032, M.aluClear, pivot); hub.rotation.y = Math.PI / 2;
  const upper = deltaCylinder(0.024, 0, D.RF, M.carbonGloss, pivot); upper.rotation.x = Math.PI / 2;
  rbox(0.056, 0.056, 0.070, 0.004, M.aluClear, 0, -D.RF, 0, pivot);
  const pin = deltaCylinder(0.008, -RH - 0.008, RH + 0.008, M.aluClear, pivot); pin.rotation.y = Math.PI / 2; pin.position.y = -D.RF;
  const rodIndices = [], ballIndices = [], cupIndices = [];
  for (const sg of [-1, 1]) {
    ballIndices.push({ elbow: deltaBallIndex++, plate: deltaBallIndex++ });
    const stud = deltaCylinder(0.005, 0, D.E - 0.030, M.steel, eff); stud.quaternion.setFromUnitVectors(V(0, 0, 1), V(s, -c, 0)); stud.position.set(0.030 * s + sg * RH * c, -0.030 * c + sg * RH * s, 0);
    rodIndices.push(deltaRodIndex++);
    cupIndices.push([deltaCupIndex++, deltaCupIndex++]);
  }
  const springIndices = Array.from({ length: 4 }, () => deltaSpringIndex++);
  deltaMergeDirect(pivot);
  return { th, c, s, shoulder, pivot, rodIndices, ballIndices, cupIndices, springIndices };
});
deltaMergeStatic([deltaFixed, ...deltaArms.map((A) => A.shoulder)], deltaGroup);
// ---- stepped 2-finger parallel gripper (one tool for housing, spring and cap). TCP = fingertip centre at z = -D.tool.
deltaCylinder(0.032, -0.020, -0.008, M.aluClear, eff);                                  // ISO flange adaptor
rbox(0.050, 0.034, 0.046, 0.003, M.aluDark, 0, 0, -0.045, eff);                         // gripper body
rbox(0.058, 0.020, 0.010, 0.002, M.aluBlasted, 0, 0, -0.073, eff);                       // jaw guide
const deltaUpperFingerGeometry = new RoundedBoxGeometry(0.008, 0.014, 0.020, 4, 0.0015);
deltaUpperFingerGeometry.translate(0.004, 0, -0.088);
const deltaLowerFingerGeometry = new RoundedBoxGeometry(0.004, 0.010, 0.018, 4, 0.0010);
deltaLowerFingerGeometry.translate(0.002, 0, -D.tool + 0.010);
const deltaFingerGeometry = BufferGeometryUtils.mergeGeometries(
  [deltaUpperFingerGeometry.toNonIndexed(), deltaLowerFingerGeometry.toNonIndexed()], false,
);
deltaFingerGeometry.clearGroups(); deltaUpperFingerGeometry.dispose(); deltaLowerFingerGeometry.dispose();
const deltaFingers = deltaInstance(deltaFingerGeometry, M.steel, 2, "delta_stepped_fingers", eff);
const deltaLedMat = M.lampGreen.clone(); deltaLedMat.emissive.setHex(0x18d040); deltaLedMat.emissiveIntensity = 0;
const deltaLed = deltaCylinder(0.004, 0, 0.006, deltaLedMat, eff); deltaLed.position.set(0.026, 0.0, -0.040); deltaLed.rotation.y = Math.PI / 2;
deltaMergeDirect(eff);
const deltaHoses = [-1, 1].map(() => tubeAlong([V(D.cx, D.cy, deltaZ0), V(D.cx, D.cy, 0.8), V(D.cx, D.cy, 0.5)], 0.002, M.puBlue, deltaGroup, 64, 10));
let deltaLastPose = null;
// finger gap: gripW of the part + 6 mm when open; the spring uses the fingertip step
function deltaFingerGap(part, grip) { const w = PART[part || "A"].gripW; return lerp(w + 0.006, w, clamp(grip, 0, 1)); }
function setDelta(p, ang, grip = 0, part = "A") {
  eff.position.set(p[0], p[1], p[2] + D.tool);
  const gap = deltaFingerGap(part, grip), tipStep = part === "B" ? 0 : 0.004;
  [-1, 1].forEach((sg, i) => {
    deltaDummy.position.set(sg * (gap / 2 + tipStep), 0, 0);
    deltaDummy.quaternion.setFromAxisAngle(V(0, 0, 1), sg < 0 ? Math.PI : 0);
    deltaDummy.scale.set(1, 1, 1); deltaDummy.updateMatrix(); deltaFingers.setMatrixAt(i, deltaDummy.matrix);
  });
  deltaFingers.instanceMatrix.needsUpdate = true;
  deltaLedMat.emissiveIntensity = grip > 0.5 ? 1.6 : 0;
  const hosePoints = [[], []];
  deltaArms.forEach((A, i) => {
    const al = ang[i]; A.pivot.rotation.x = al;
    const E = V(D.cx + (D.F + D.RF * Math.cos(al)) * A.s, D.cy - (D.F + D.RF * Math.cos(al)) * A.c, D.zb - D.RF * Math.sin(al));
    const Pp = V(p[0] + D.E * A.s, p[1] - D.E * A.c, p[2] + D.tool);
    const tangent = V(A.c, A.s, 0), direction = Pp.clone().sub(E).normalize();
    [-1, 1].forEach((sg, j) => {
      const a = E.clone().addScaledVector(tangent, sg * RH), b = Pp.clone().addScaledVector(tangent, sg * RH);
      const rodDirection = b.clone().sub(a);
      deltaSetInstance(deltaRodInstances, A.rodIndices[j], a.addScaledVector(rodDirection, 0.5),
        new THREE.Quaternion().setFromUnitVectors(UP, rodDirection.clone().normalize()), V(1, rodDirection.length(), 1));
      const rodStart = E.clone().addScaledVector(tangent, sg * RH), rodEnd = Pp.clone().addScaledVector(tangent, sg * RH);
      const balls = A.ballIndices[j];
      deltaSetInstance(deltaBallInstances, balls.elbow, rodStart);
      deltaSetInstance(deltaBallInstances, balls.plate, rodEnd);
      A.cupIndices[j].forEach((index, end) => {
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), direction.clone().multiplyScalar(end ? -1 : 1));
        deltaSetInstance(deltaCupInstances, index, end ? rodEnd : rodStart, q);
      });
    });
    [E, Pp].forEach((end, k) => [-1, 1].forEach((sg, j) => {
      const centre = end.clone().addScaledVector(direction, sg * 0.016);
      const a = centre.clone().addScaledVector(tangent, -RH), b = centre.clone().addScaledVector(tangent, RH);
      const d = b.clone().sub(a);
      deltaSetInstance(deltaSpringInstances, A.springIndices[k * 2 + j], a.addScaledVector(d, 0.5),
        new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()), V(1, d.length(), 1));
    }));
    if (i === 0) {
      const radial = V(A.s, -A.c, 0);
      A.shoulder.updateWorldMatrix(true, false);
      for (let j = 0; j < 2; j++) {
        const sg = j ? 1 : -1;
        const connector = A.shoulder.localToWorld(V(j ? 0.262 : 0.242, 0.070, 0.020));
        hosePoints[j] = [
          connector,
          E.clone().addScaledVector(radial, 0.045).addScaledVector(tangent, sg * 0.006),
          E.clone().lerp(Pp, 0.30).addScaledVector(radial, 0.040).addScaledVector(tangent, sg * 0.006),
          E.clone().lerp(Pp, 0.70).addScaledVector(radial, 0.040).addScaledVector(tangent, sg * 0.006),
          V(p[0] + 0.026, p[1] + sg * 0.006, p[2] + D.tool - 0.040),
        ];
      }
      [0.3, 0.7].forEach((f, j) => {
        const point = E.clone().lerp(Pp, f).addScaledVector(radial, 0.040);
        const q = new THREE.Quaternion().setFromUnitVectors(UP, direction);
        deltaSetInstance(deltaClipInstances, j, point, q);
      });
    }
  });
  hosePoints.forEach((points, i) => updateTube(deltaHoses[i], points));
  [deltaRodInstances, deltaBallInstances, deltaCupInstances, deltaSpringInstances, deltaClipInstances].forEach((o) => { o.instanceMatrix.needsUpdate = true; });
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
      for (const A of deltaArms) A.rodIndices.forEach((rodIndex, j) => {
        const rodMatrix = new THREE.Matrix4(); deltaRodInstances.getMatrixAt(rodIndex, rodMatrix);
        for (const [y, index] of [[0.5, A.ballIndices[j].plate], [-0.5, A.ballIndices[j].elbow]]) {
          const end = V(0, y, 0).applyMatrix4(rodMatrix).applyMatrix4(deltaRodInstances.matrixWorld);
          const ballMatrix = new THREE.Matrix4(); deltaBallInstances.getMatrixAt(index, ballMatrix);
          const target = new THREE.Vector3().setFromMatrixPosition(ballMatrix).applyMatrix4(deltaBallInstances.matrixWorld);
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
