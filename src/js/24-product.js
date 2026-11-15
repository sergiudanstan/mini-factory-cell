// ---------------------------------------------------------------- product: push-button parts (housing A, spring B, cap C)
// Keep the local coordinates in the part frame, origin at the bottom centre with z up.
const PROD_MAT = { A: M.pa66Black, B: M.musicWire, C: M.paRed };
const prodGeoCache = new Map();

function rectHole(cx, cy, w, h) {
  const hole = new THREE.Path();
  hole.moveTo(cx - w / 2, cy - h / 2);
  hole.lineTo(cx + w / 2, cy - h / 2);
  hole.lineTo(cx + w / 2, cy + h / 2);
  hole.lineTo(cx - w / 2, cy + h / 2);
  hole.lineTo(cx - w / 2, cy - h / 2);
  return hole;
}

function bodyRingShape(outerR, innerR, holes = []) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  const inner = new THREE.Path();
  inner.absarc(0, 0, innerR, 0, Math.PI * 2, false);
  shape.holes.push(inner);
  for (const hole of holes) shape.holes.push(hole);
  return shape;
}

function aHousingGeometry() {
  const seg = 40;
  const bodyShape = bodyRingShape(0.010, 0.0065, [
    rectHole(0, 0.008, 0.004, 0.003),
    rectHole(0, -0.008, 0.004, 0.003),
  ]);
  const body = new THREE.ExtrudeGeometry(bodyShape, { depth: 0.018, bevelEnabled: false });
  body.translate(0, 0, 0);

  const boreFloor = new THREE.CylinderGeometry(0.0065, 0.0065, 0.0018, seg, 1, false);
  boreFloor.translate(0, 0, 0.0009);

  const flangeShape = bodyRingShape(0.012, 0.0065, [rectHole(0.009, 0, 0.008, 0.0014)]);
  const flange = new THREE.ExtrudeGeometry(flangeShape, { depth: 0.002, bevelEnabled: false });
  flange.translate(0, 0, 0.018);

  return [
    { geo: body, mat: PROD_MAT.A },
    { geo: boreFloor, mat: PROD_MAT.A },
    { geo: flange, mat: PROD_MAT.A },
  ];
}

function bSpringCurve(length, lod = 1) {
  const P = PART.B;
  const r = (P.od - P.wire) / 2;
  const samples = lod === 2 ? 48 : lod === 0 ? 180 : 120;
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const ang = u * Math.PI * 2 * P.coils;
    pts.push(new THREE.Vector3(Math.cos(ang) * r, Math.sin(ang) * r, u * length));
  }
  return new THREE.CatmullRomCurve3(pts, false, "centripetal");
}

function bSpringGeometry(length, lod = 1) {
  const P = PART.B;
  const curve = bSpringCurve(length, lod);
  const geo = new THREE.TubeGeometry(curve, lod === 2 ? 90 : 220, P.wire / 2, lod === 2 ? 6 : 8, false);
  return [{ geo, mat: PROD_MAT.B }];
}

function cCapGeometry() {
  const P = PART.C;
  const seg = 32;
  const dome = new THREE.LatheGeometry([
    new THREE.Vector2(0.0004, 0),
    new THREE.Vector2(P.d / 2, 0),
    new THREE.Vector2(P.d / 2, 0.005),
    new THREE.Vector2(P.d / 2 * 0.72, 0.011),
    new THREE.Vector2(P.d / 2 * 0.35, 0.014),
    new THREE.Vector2(0.0006, P.h),
  ], seg);
  dome.rotateX(Math.PI / 2);

  const hookGeo = new THREE.BoxGeometry(0.006, 0.0016, 0.0024);
  const items = [{ geo: dome, mat: PROD_MAT.C }];
  for (const sign of [-1, 1]) {
    const hook = hookGeo.clone();
    hook.translate(sign * 0.008, 0, 0.007);
    items.push({ geo: hook, mat: PROD_MAT.C });
  }
  const rib = new THREE.BoxGeometry(0.005, 0.0012, 0.0025);
  rib.translate(0.0025, 0, 0.0081);
  items.push({ geo: rib, mat: PROD_MAT.C });
  return items;
}

function prodGeometry(type, lod = 1) {
  const k = `${type}:${lod}`;
  if (prodGeoCache.has(k)) return prodGeoCache.get(k);

  let parts;
  if (type === "A") parts = aHousingGeometry();
  else if (type === "B") parts = bSpringGeometry(PART.B.free, lod);
  else parts = cCapGeometry();

  prodGeoCache.set(k, parts);
  return parts;
}

function makePart(type, lod = 1) {
  const g = new THREE.Group();
  g.name = `part_${type}`;
  g.userData.type = type;
  for (const { geo, mat } of prodGeometry(type, lod)) {
    const o = new THREE.Mesh(geo, mat);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
  }
  if (type === "B") {
    g.userData.springLength = PART.B.free;
  }
  return g;
}

function setSpringLength(obj, len) {
  if (!obj || obj.userData.type !== "B") return;
  const clamped = Math.max(0.0001, len);
  obj.userData.springLength = clamped;
  for (let i = obj.children.length - 1; i >= 0; i--) obj.remove(obj.children[i]);
  const P = PART.B;
  const curve = bSpringCurve(clamped, 1);
  const geo = new THREE.TubeGeometry(curve, 220, P.wire / 2, 8, false);
  const mesh = new THREE.Mesh(geo, PROD_MAT.B);
  mesh.castShadow = mesh.receiveShadow = true;
  obj.add(mesh);
}
