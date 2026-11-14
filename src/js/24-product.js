// ---------------------------------------------------------------- product: push-button parts (housing A, spring B, cap C)
// Model the housing, spring and cap as single-material solids built from a few robust
// geometries. The API is fixed and the origin remains at the part bottom centre.
const PROD_MAT = { A: M.pa66Black, B: M.musicWire, C: M.paRed };
const prodGeoCache = new Map();

function prodGeometry(type, lod = 1) {
  const k = `${type}:${lod}`;
  if (prodGeoCache.has(k)) return prodGeoCache.get(k);

  const P = PART[type];
  const seg = lod === 0 ? 40 : lod === 1 ? 24 : 12;
  const parts = [];

  if (type === "A") {
    const body = new THREE.CylinderGeometry(P.d / 2, P.d / 2, P.h - P.flangeH, seg, 1, false);
    body.rotateX(Math.PI / 2);
    body.translate(0, 0, (P.h - P.flangeH) / 2);
    parts.push({ geo: body, mat: PROD_MAT.A });

    const flange = new THREE.CylinderGeometry(P.flangeD / 2, P.flangeD / 2, P.flangeH, seg, 1, false);
    flange.rotateX(Math.PI / 2);
    flange.translate(0, 0, P.h - P.flangeH / 2);
    parts.push({ geo: flange, mat: PROD_MAT.A });

    const boreWall = new THREE.CylinderGeometry(P.bore / 2, P.bore / 2, Math.max(0.002, P.h - P.boreFloor - 0.001), seg, 1, true);
    boreWall.rotateX(Math.PI / 2);
    boreWall.translate(0, 0, (P.h - P.boreFloor - 0.001) / 2 + P.boreFloor);
    parts.push({ geo: boreWall, mat: PROD_MAT.A });

    const boreFloor = new THREE.CylinderGeometry(P.bore / 2, P.bore / 2, 0.002, seg, 1, false);
    boreFloor.rotateX(Math.PI / 2);
    boreFloor.translate(0, 0, P.boreFloor / 2);
    parts.push({ geo: boreFloor, mat: PROD_MAT.A });

    const slot = new THREE.BoxGeometry(0.012, 0.0015, 0.0014);
    slot.translate(0.006, 0, P.h - 0.0007);
    parts.push({ geo: slot, mat: PROD_MAT.A });

    const windowW = 0.004, windowH = 0.003, windowD = 0.0018;
    for (const sign of [-1, 1]) {
      const win = new THREE.BoxGeometry(windowW, windowH, windowD);
      win.translate(0, sign * (P.d / 2 - 0.001), 0.016);
      parts.push({ geo: win, mat: PROD_MAT.A });
    }

    const rib = new THREE.BoxGeometry(0.010, 0.0008, 0.0025);
    rib.translate(0.0, 0.0, 0.018);
    parts.push({ geo: rib, mat: PROD_MAT.A });
  } else if (type === "B") {
    if (lod === 2) {
      const shell = new THREE.CylinderGeometry(P.od / 2, P.od / 2, Math.max(P.free * 0.72, 0.006), 14, 1, true);
      shell.rotateX(Math.PI / 2);
      shell.translate(0, 0, P.free * 0.36);
      parts.push({ geo: shell, mat: PROD_MAT.B });
      const cap = new THREE.CylinderGeometry(P.wire * 1.8, P.wire * 1.8, 0.0018, 10, 1, false);
      cap.rotateX(Math.PI / 2);
      cap.translate(0, 0, 0.0009);
      const cap2 = cap.clone(); cap2.translate(0, 0, P.free - 0.0009);
      parts.push({ geo: cap, mat: PROD_MAT.B }, { geo: cap2, mat: PROD_MAT.B });
    } else {
      const pts = [];
      const turns = P.coils;
      const n = lod === 0 ? 160 : 96;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const a = u * Math.PI * 2 * turns;
        const r = P.od / 2;
        pts.push(new THREE.Vector3(Math.sin(a) * r, Math.cos(a) * r, P.free * u));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, lod === 0 ? 220 : 140, P.wire / 2, lod === 0 ? 10 : 8, false);
      parts.push({ geo, mat: PROD_MAT.B });

      const cap1 = new THREE.CylinderGeometry(P.wire * 1.9, P.wire * 1.9, 0.0018, 10, 1, false);
      cap1.rotateX(Math.PI / 2);
      cap1.translate(0, 0, 0.0009);
      const cap2 = cap1.clone(); cap2.translate(0, 0, P.free - 0.0009);
      parts.push({ geo: cap1, mat: PROD_MAT.B }, { geo: cap2, mat: PROD_MAT.B });
    }
  } else {
    const body = new THREE.CylinderGeometry(P.d / 2, P.d / 2, P.h, seg, 1, false);
    body.rotateX(Math.PI / 2);
    body.translate(0, 0, P.h / 2);
    parts.push({ geo: body, mat: PROD_MAT.C });

    const dome = new THREE.SphereGeometry(P.d / 2, seg, Math.max(10, seg), 0, Math.PI * 2, 0, Math.PI / 2);
    dome.translate(0, 0, P.h + P.d / 2 * 0.5);
    parts.push({ geo: dome, mat: PROD_MAT.C });

    const hookLen = 0.003, hookW = 0.0024, hookD = 0.002;
    for (const sign of [-1, 1]) {
      const hook = new THREE.BoxGeometry(hookLen, hookW, hookD);
      hook.translate(0, sign * (P.d / 2 + 0.001), -0.0028);
      parts.push({ geo: hook, mat: PROD_MAT.C });
    }

    const rib = new THREE.BoxGeometry(0.009, 0.0012, 0.0025);
    rib.translate(0.004, 0, P.h * 0.55);
    parts.push({ geo: rib, mat: PROD_MAT.C });
  }

  prodGeoCache.set(k, parts);
  return parts;
}

function makePart(type, lod = 1) {
  const g = new THREE.Group();
  g.name = `part_${type}`;
  for (const { geo, mat } of prodGeometry(type, lod)) {
    const o = new THREE.Mesh(geo, mat);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
  }
  g.userData.type = type;
  return g;
}

function setSpringLength(obj, len) {
  obj.scale.z = len / PART.B.free;
}
