// ---------------------------------------------------------------- product: push-button parts (housing A, spring B, cap C)
// Keep the local coordinates in the part frame, origin at the bottom centre with z up.
const PROD_MAT = { A: M.pa66Black, B: M.musicWire, C: M.paRed };
const prodGeoCache = new Map();

function prodQuad(vertices, a, b, c, d, reverse = false) {
  const points = reverse ? [a, d, c, a, c, b] : [a, b, c, a, c, d];
  for (const p of points) vertices.push(...p);
}

function prodWallPoint(r, a, z) {
  return [r * Math.cos(a), r * Math.sin(a), z];
}

function aWindowedWall() {
  const outerR = PART.A.d / 2, innerR = PART.A.bore / 2;
  const z0 = 0.004, z1 = 0.020, zLow = PART.A.windows[0], zHigh = PART.A.windows[1];
  const segments = 80, halfAngle = Math.asin(0.002 / outerR);
  const centers = [Math.PI / 2, -Math.PI / 2];
  const vertices = [];
  const inWindow = (a) => centers.some((center) => Math.abs(Math.atan2(Math.sin(a - center), Math.cos(a - center))) < halfAngle);
  const angles = Array.from({ length: segments + 1 }, (_, i) => (Math.PI * 2 * i) / segments);
  const heights = [z0, zLow, zHigh, z1];

  for (let band = 0; band < heights.length - 1; band++) {
    const za = heights[band], zb = heights[band + 1], cutBand = za >= zLow && zb <= zHigh;
    for (let i = 0; i < segments; i++) {
      const a = angles[i], b = angles[i + 1], mid = (a + b) / 2;
      if (cutBand && inWindow(mid)) continue;
      prodQuad(vertices, prodWallPoint(outerR, a, za), prodWallPoint(outerR, b, za), prodWallPoint(outerR, b, zb), prodWallPoint(outerR, a, zb));
      prodQuad(vertices, prodWallPoint(innerR, a, za), prodWallPoint(innerR, a, zb), prodWallPoint(innerR, b, zb), prodWallPoint(innerR, b, za));
    }
  }

  for (const center of centers) {
    const a0 = center - halfAngle, a1 = center + halfAngle;
    for (const z of [zLow, zHigh]) {
      prodQuad(vertices, prodWallPoint(innerR, a0, z), prodWallPoint(outerR, a0, z), prodWallPoint(outerR, a1, z), prodWallPoint(innerR, a1, z), z === zLow);
    }
    for (const a of [a0, a1]) {
      prodQuad(vertices, prodWallPoint(innerR, a, zLow), prodWallPoint(innerR, a, zHigh), prodWallPoint(outerR, a, zHigh), prodWallPoint(outerR, a, zLow));
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  return geo;
}

function aHousingGeometry(lod = 1) {
  if (lod === 2) {
    const seg = 12, outerR = PART.A.d / 2, innerR = PART.A.bore / 2;
    const outer = new THREE.CylinderGeometry(outerR, outerR, PART.A.h - PART.A.flangeH, seg, 1, true);
    outer.rotateX(Math.PI / 2);
    outer.translate(0, 0, (PART.A.h - PART.A.flangeH) / 2);
    const inner = new THREE.CylinderGeometry(innerR, innerR, PART.A.h - PART.A.boreFloor - PART.A.flangeH, seg, 1, true);
    inner.rotateX(Math.PI / 2);
    inner.translate(0, 0, PART.A.boreFloor + (PART.A.h - PART.A.boreFloor - PART.A.flangeH) / 2);
    inner.scale(-1, 1, 1);
    inner.computeVertexNormals();
    const bottom = new THREE.CylinderGeometry(outerR, outerR, PART.A.boreFloor, seg);
    bottom.rotateX(Math.PI / 2);
    bottom.translate(0, 0, PART.A.boreFloor / 2);
    const flangeR = PART.A.flangeD / 2;
    const flangeWall = new THREE.CylinderGeometry(flangeR, flangeR, PART.A.flangeH, seg, 1, true);
    flangeWall.rotateX(Math.PI / 2);
    flangeWall.translate(0, 0, PART.A.h - PART.A.flangeH / 2);
    const flangeBore = new THREE.CylinderGeometry(innerR, innerR, PART.A.flangeH, seg, 1, true);
    flangeBore.rotateX(Math.PI / 2);
    flangeBore.translate(0, 0, PART.A.h - PART.A.flangeH / 2);
    flangeBore.scale(-1, 1, 1);
    flangeBore.computeVertexNormals();
    const flangeTop = new THREE.RingGeometry(innerR, flangeR, seg);
    flangeTop.translate(0, 0, PART.A.h);
    const flangeBottom = new THREE.RingGeometry(innerR, flangeR, seg);
    flangeBottom.rotateX(Math.PI);
    flangeBottom.translate(0, 0, PART.A.h - PART.A.flangeH);
    return [outer, inner, bottom, flangeWall, flangeBore, flangeTop, flangeBottom].map((geo) => ({ geo, mat: PROD_MAT.A }));
  }

  const wall = aWindowedWall();
  const bottom = new THREE.CylinderGeometry(PART.A.d / 2, PART.A.d / 2, 0.004, 40);
  bottom.rotateX(Math.PI / 2);
  bottom.translate(0, 0, 0.002);

  const outerR = PART.A.flangeD / 2, innerR = PART.A.bore / 2;
  const z0 = PART.A.h - PART.A.flangeH, z1 = PART.A.h;
  const segments = 80, halfAngle = Math.asin(0.0007 / outerR), vertices = [];
  const angles = Array.from({ length: segments + 1 }, (_, i) => (Math.PI * 2 * i) / segments);
  for (let i = 0; i < segments; i++) {
    const a = angles[i], b = angles[i + 1], mid = (a + b) / 2;
    if (Math.abs(Math.atan2(Math.sin(mid), Math.cos(mid))) < halfAngle) continue;
    prodQuad(vertices, prodWallPoint(outerR, a, z0), prodWallPoint(outerR, b, z0), prodWallPoint(outerR, b, z1), prodWallPoint(outerR, a, z1));
    prodQuad(vertices, prodWallPoint(innerR, a, z0), prodWallPoint(innerR, a, z1), prodWallPoint(innerR, b, z1), prodWallPoint(innerR, b, z0));
    prodQuad(vertices, prodWallPoint(innerR, a, z1), prodWallPoint(outerR, a, z1), prodWallPoint(outerR, b, z1), prodWallPoint(innerR, b, z1));
    prodQuad(vertices, prodWallPoint(innerR, a, z0), prodWallPoint(outerR, a, z0), prodWallPoint(outerR, b, z0), prodWallPoint(innerR, b, z0), true);
  }
  for (const a of [-halfAngle, halfAngle]) {
    prodQuad(vertices, prodWallPoint(innerR, a, z0), prodWallPoint(innerR, a, z1), prodWallPoint(outerR, a, z1), prodWallPoint(outerR, a, z0));
  }
  const flange = new THREE.BufferGeometry();
  flange.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  flange.computeVertexNormals();

  return [
    { geo: wall, mat: PROD_MAT.A },
    { geo: bottom, mat: PROD_MAT.A },
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
  const tubeSegments = lod === 0 ? 180 : lod === 2 ? 48 : 96;
  const radialSegments = lod === 0 ? 10 : lod === 2 ? 3 : 8;
  const geo = new THREE.TubeGeometry(curve, tubeSegments, P.wire / 2, radialSegments, false);
  return [{ geo, mat: PROD_MAT.B }];
}

function cCapGeometry(lod = 1) {
  const P = PART.C;
  const seg = lod === 0 ? 48 : lod === 2 ? 12 : 32;
  const bezierSamples = lod === 0 ? 12 : lod === 2 ? 3 : 8;
  const sphereSamples = lod === 0 ? 24 : lod === 2 ? 4 : 16;
  const bodyR = P.d / 2, domeR = 0.0091, domeBase = 0.0125;
  const sphereCenter = P.h - domeR;
  const profile = [new THREE.Vector2(0, 0), new THREE.Vector2(bodyR, 0), new THREE.Vector2(bodyR, domeBase - 0.0004)];
  for (let i = 1; i <= bezierSamples; i++) {
    const u = i / bezierSamples, v = 1 - u;
    const r = v ** 3 * bodyR + 3 * v ** 2 * u * bodyR + 3 * v * u ** 2 * (bodyR + 0.00012) + u ** 3 * Math.sqrt(domeR ** 2 - (domeBase - sphereCenter) ** 2);
    const z = v ** 3 * (domeBase - 0.0004) + 3 * v ** 2 * u * (domeBase - 0.00027) + 3 * v * u ** 2 * (domeBase - 0.00013) + u ** 3 * domeBase;
    profile.push(new THREE.Vector2(r, z));
  }
  for (let i = 1; i <= sphereSamples; i++) {
    const z = domeBase + (P.h - domeBase) * i / sphereSamples;
    const r = Math.sqrt(Math.max(0, domeR ** 2 - (z - sphereCenter) ** 2));
    profile.push(new THREE.Vector2(r, z));
  }
  const cap = new THREE.LatheGeometry(profile, seg);
  cap.rotateX(Math.PI / 2);

  const legGeo = new THREE.BoxGeometry(0.002, 0.001, 0.007);
  const barbGeo = new THREE.BoxGeometry(0.001, 0.0015, 0.001);
  const items = [{ geo: cap, mat: PROD_MAT.C }];
  for (const sign of [-1, 1]) {
    const leg = legGeo.clone();
    leg.translate(0, sign * 0.00575, 0.0005);
    const barb = barbGeo.clone();
    barb.translate(0, sign * 0.00598, -0.0025);
    items.push({ geo: leg, mat: PROD_MAT.C }, { geo: barb, mat: PROD_MAT.C });
  }
  const rib = new THREE.BoxGeometry(0.0004, 0.001, 0.004);
  rib.translate(0.00645, 0, 0.0085);
  items.push({ geo: rib, mat: PROD_MAT.C });
  return items;
}

function prodGeometry(type, lod = 1) {
  const k = `${type}:${lod}`;
  if (prodGeoCache.has(k)) return prodGeoCache.get(k);

  let parts;
  if (type === "A") parts = aHousingGeometry(lod);
  else if (type === "B") parts = bSpringGeometry(PART.B.free, lod);
  else parts = cCapGeometry(lod);

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
  const geo = new THREE.TubeGeometry(curve, 96, P.wire / 2, 8, false);
  const mesh = new THREE.Mesh(geo, PROD_MAT.B);
  mesh.castShadow = mesh.receiveShadow = true;
  obj.add(mesh);
}
