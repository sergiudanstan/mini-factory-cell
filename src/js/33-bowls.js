// ---------------------------------------------------------------- bowl feeders: stand, drive, bowl + helix, hopper, linear feeder, pick nest
// M0 STUB (owner: bowls task). Contract, fixed: BOWLS.root (module "bowls"); updateBowls(t) animates the part flow:
//   - linear-track queue and escapement exactly from feederState(f, t).queue (s = distance behind the pick point),
//   - a deterministic decorative stream on the helix (pure function of t), recirculating at the outlet.
// The part sitting IN the pick nest is drawn by the loop (tracked part), never by this module.
const BOWLS = (() => {
  const root = moduleRoot("bowls");
  const flowGeo = {}, flow = [];
  const merged = (type) => {
    if (flowGeo[type]) return flowGeo[type];
    const list = prodGeometry(type, 2).map((p) => p.geo.index ? p.geo.toNonIndexed() : p.geo.clone());
    list.forEach((g) => { for (const k of Object.keys(g.attributes)) if (!["position", "normal"].includes(k)) g.deleteAttribute(k); });
    return (flowGeo[type] = BufferGeometryUtils.mergeGeometries(list, false));
  };
  LAYOUT.bowls.forEach((b) => {
    const g = new THREE.Group(); g.name = `bowl_${b.id}`; root.add(g);
    const F = LAYOUT.floor;
    vcyl(0.09, b.stand.z1 - F - 0.05, M.ral6011, b.cx, b.cy, (b.stand.z1 + F + 0.05) / 2, 32, g);       // pedestal column
    vcyl(0.20, 0.05, M.ral6011, b.cx, b.cy, F + 0.025, 32, g);                                          // pedestal foot
    vcyl(b.plate.d / 2, b.plate.h, M.ral9005, b.cx, b.cy, b.mount + b.plate.h / 2, 48, g);             // base plate
    vcyl(b.drive.d / 2, b.drive.h, M.ral7035, b.cx, b.cy, b.mount + b.plate.h + b.drive.h / 2, 48, g);  // drive
    const wallMat = M.ss304Blasted.clone(); wallMat.side = THREE.DoubleSide;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(b.rim / 2, b.rim / 2, b.h, 64, 1, true), wallMat);
    wall.rotation.x = Math.PI / 2; wall.position.set(b.cx, b.cy, b.rimZ - b.h / 2); g.add(wall);
    vcyl(b.rim / 2, 0.006, b.type === "stepped" ? M.puBlack : M.ss304Blasted, b.cx, b.cy, b.bottomZ, 64, g);
    // helix track as a tube (stub)
    const pts = [];
    for (let i = 0; i <= 160; i++) { const u = i / 160; pts.push(bowlHelix(b, u)); }
    tubeAlong(pts.map((p) => V(p[0], p[1], p[2] - 0.004)), 0.004, M.ss304Blasted, g, 320, 6);
    // linear feeder: drive + track, pick nest
    const f = FEED[b.f], L = b.linear, ang = f.a;
    const mid = (s) => [f.x + f.ux * s, f.y + f.uy * s];
    const lt = rbox(L.len, L.w, L.h, 0.004, M.ral7035, ...mid((L.s0 + L.s1) / 2), PICK.z - L.trackH - L.h / 2, g); lt.rotation.z = ang;
    const tr = rbox(f.track, 0.03, L.trackH, 0.002, M.ss304Blasted, ...mid(f.track / 2), PICK.z - L.trackH / 2, g); tr.rotation.z = ang;
    vcyl(0.03, L.column.z1 - F, M.ral7035, ...mid((L.s0 + L.s1) / 2), (L.column.z1 + F) / 2, 24, g);
    const nb = rbox(0.06, 0.05, 0.04, 0.003, M.alAnodGrey, f.x, f.y, PICK.z - 0.02, g); nb.rotation.z = ang;
    // flow parts: queue on the track + helix stream
    const n = f.q + 2 + 28;
    const im = new THREE.InstancedMesh(merged(f.part), PROD_MAT[f.part], n);
    im.castShadow = im.receiveShadow = true; im.frustumCulled = false; im.name = `bowl_${b.id}_flow`;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(im);
    flow.push({ b, f, im, n });
  });
  return { root, flow };
})();
// Helix centreline point for bowl b at u in [0, 1] (0 = bowl bottom, 1 = outlet), cell frame.
function bowlHelix(b, u) {
  const sgn = b.dir === "cw" ? 1 : -1, a = b.exitAng + sgn * (1 - u) * b.turns * 2 * Math.PI, r = b.rTrack - (1 - u) * 0.01;
  return [b.cx + r * Math.cos(a), b.cy + r * Math.sin(a), b.bottomZ + (b.outletZ - b.bottomZ) * Math.pow(u, 0.92)];
}
const _bowlM = new THREE.Matrix4(), _bowlQ = new THREE.Quaternion(), _bowlP = new THREE.Vector3(), _bowlS = new THREE.Vector3(1, 1, 1), _bowlZ = V(0, 0, 1);
function updateBowls(t) {
  for (const { b, f, im, n } of BOWLS.flow) {
    const st = feederState(f.i, t);
    let k = 0;
    for (const e of st.queue) {
      if (k >= n) break;
      _bowlP.set(f.x + f.ux * e.s, f.y + f.uy * e.s, PICK.z);
      _bowlQ.setFromAxisAngle(_bowlZ, f.a); _bowlM.compose(_bowlP, _bowlQ, _bowlS); im.setMatrixAt(k++, _bowlM);
    }
    // helix stream: evenly spaced parts moving at 60 mm/s along the track (stub)
    const L = b.turns * 2 * Math.PI * b.rTrack, v = 0.06, spacing = L / 28;
    for (let i = 0; i < 28 && k < n; i++) {
      const s = (i * spacing + v * t) % L, u = s / L;
      const p = bowlHelix(b, u);
      _bowlP.set(p[0], p[1], p[2]); _bowlQ.setFromAxisAngle(_bowlZ, 0); _bowlM.compose(_bowlP, _bowlQ, _bowlS); im.setMatrixAt(k++, _bowlM);
    }
    im.count = k; im.instanceMatrix.needsUpdate = true;
  }
}
