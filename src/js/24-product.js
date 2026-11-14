// ---------------------------------------------------------------- product: push-button parts (housing A, spring B, cap C)
// M0 STUB (owner: product task). Contract, fixed:
//   makePart(type, lod = 0) -> THREE.Group, origin at the part's bottom centre, z up, key feature along +x.
//                              lod 0 = close-up detail, 1 = normal, 2 = far / instanced flow parts.
//   prodGeometry(type, lod) -> { geo, mat }[]: the same part as plain geometries (for InstancedMesh in other modules).
//   setSpringLength(obj, len)  scales a spring made by makePart("B") to length len (m), keeping the wire size.
//   PROD_MAT: { A, B, C } materials.
const PROD_MAT = { A: M.pa66Black, B: M.musicWire, C: M.paRed };
const prodGeoCache = new Map();
function prodGeometry(type, lod = 1) {
  const k = `${type}:${lod}`;
  if (prodGeoCache.has(k)) return prodGeoCache.get(k);
  const P = PART[type];
  let parts;
  if (type === "A") {
    const g = new THREE.CylinderGeometry(P.d / 2, P.d / 2, P.h - P.flangeH, 24); g.rotateX(Math.PI / 2); g.translate(0, 0, (P.h - P.flangeH) / 2);
    const f = new THREE.CylinderGeometry(P.flangeD / 2, P.flangeD / 2, P.flangeH, 24); f.rotateX(Math.PI / 2); f.translate(0, 0, P.h - P.flangeH / 2);
    parts = [{ geo: g, mat: PROD_MAT.A }, { geo: f, mat: PROD_MAT.A }];
  } else if (type === "B") {
    const g = new THREE.CylinderGeometry(P.od / 2, P.od / 2, P.free, 12, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, P.free / 2);
    parts = [{ geo: g, mat: PROD_MAT.B }];
  } else {
    const g = new THREE.CylinderGeometry(P.d / 2, P.d / 2, P.h, 24); g.rotateX(Math.PI / 2); g.translate(0, 0, P.h / 2);
    parts = [{ geo: g, mat: PROD_MAT.C }];
  }
  prodGeoCache.set(k, parts);
  return parts;
}
function makePart(type, lod = 1) {
  const g = new THREE.Group(); g.name = `part_${type}`;
  for (const { geo, mat } of prodGeometry(type, lod)) { const o = new THREE.Mesh(geo, mat); o.castShadow = o.receiveShadow = true; g.add(o); }
  g.userData.type = type;
  return g;
}
function setSpringLength(obj, len) { obj.scale.z = len / PART.B.free; }
