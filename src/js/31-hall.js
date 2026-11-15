// ---------------------------------------------------------------- hall: building, floor, light fixtures and props around the cell
// The hall floor is the floor of the whole scene (z = LAYOUT.floor). ?hall=0 hides the hall except its floor.
// Everything static is merged per material; repeated loads are instanced. No lights, only emissive materials.
const HALL = (() => {
  const root = moduleRoot("hall"), H = LAYOUT.hall, F = LAYOUT.floor;
  const X0 = H.x0, X1 = H.x1, Y0 = H.y0, Y1 = H.y1, TOP = F + H.h;
  const UPC = new THREE.Vector3(0, 0, 1);                     // cell up

  // ---------------------------------------------------------------- floor (the single scene floor)
  const floorMat = M.floor.clone(); floorMat.map = epoxyMap.clone(); floorMat.map.repeat.set(24, 14); floorMat.map.needsUpdate = true;
  floorMat.clearcoat = 0.28; floorMat.clearcoatRoughness = 0.42; floorMat.envMapIntensity = 0.7;
  floorMat.color.multiplyScalar(0.78);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Y1 - Y0), floorMat);
  floor.position.set((X0 + X1) / 2, (Y0 + Y1) / 2, F); floor.receiveShadow = true; floor.name = "hall_floor"; root.add(floor);
  window.addEventListener("themechange", () => { floorMat.color.copy(M.floor.color).multiplyScalar(0.78); });

  // ---------------------------------------------------------------- procedural textures and materials
  const wallMap = procTex(64, 64, 91, (data, w, h, rnd) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const rib = (x / w) * 4 - Math.floor((x / w) * 4);
      let v = 205 + Math.floor((rnd() - 0.5) * 5);
      if (rib < 0.08) v = 176; else if (rib < 0.18) v = 229; else if (rib < 0.26) v = 214;
      if (x < 2) v = 162;                                    // panel joint, 1 m pitch
      put(data, (y * w + x) * 4, v, v, v);
    }
  }, { color: true });
  const wallBump = procTex(64, 64, 92, (data, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const rib = (x / w) * 4 - Math.floor((x / w) * 4);
      let v = 120;
      if (rib < 0.08) v = 28; else if (rib < 0.18) v = 235; else if (rib < 0.26) v = 170;
      if (x < 2) v = 20;
      put(data, (y * w + x) * 4, v, v, v);
    }
  });
  const woodMap = procTex(256, 128, 101, (data, w, h, rnd) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const grain = Math.sin(x * 0.11 + Math.sin(y * 0.22) * 2.4) * 18 + Math.sin(x * 0.47 + y * 0.9) * 7;
      const v = 168 + grain + Math.floor((rnd() - 0.5) * 12);
      put(data, (y * w + x) * 4, v + 26, v + 2, v - 38);
    }
  }, { color: true });
  const graniteMap = procTex(128, 128, 111, (data, w, h, rnd) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = rnd(), speck = n > 0.93 ? 90 : n < 0.06 ? -18 : 0;
      const v = 22 + speck + Math.floor((rnd() - 0.5) * 8);
      put(data, (y * w + x) * 4, v, v, v + 3);
    }
  }, { color: true });
  const pegMap = procTex(128, 128, 121, (data, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x % 16) - 8, dy = (y % 16) - 8, hole = dx * dx + dy * dy < 6;
      const v = hole ? 54 : 205 + ((x * 7 + y * 3) % 9);
      put(data, (y * w + x) * 4, v, v - 2, v - 8);
    }
  }, { color: true });
  const hatchMap = tapeMap.clone(); hatchMap.repeat.set(1, 1); hatchMap.needsUpdate = true;

  const wallMat = phys(0xd7dad9, 0.62, 0.04, { map: wallMap, bumpMap: wallBump, bumpScale: 0.012 });
  const plinthMat = phys(0x64686a, 0.82, 0.04);
  const roofMat = phys(0x3c4044, 0.9, 0.08);
  const skyMat = new THREE.MeshStandardMaterial({ color: 0xc4d9e8, emissive: 0xdcefff, emissiveIntensity: 1.15, roughness: 0.4, metalness: 0 });
  const hatchMat = phys(0xffffff, 0.72, 0, { map: hatchMap });
  const jointMat = phys(0x83878a, 0.85, 0);
  const woodMat = phys(0xb78b57, 0.86, 0, { map: woodMap });
  const graniteMat = phys(0x17181b, 0.24, 0.18, { map: graniteMap, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const topMat = phys(0xd3d5d1, 0.5, 0.06, { roughnessMap: brushRough });
  const pegMat = phys(0xd8d5cc, 0.72, 0, { map: pegMap, bumpMap: pegMap, bumpScale: 0.004 });
  const airMat = phys(0x2b6db3, 0.28, 0.85, { clearcoat: 0.3, clearcoatRoughness: 0.3 });
  const doorMat = phys(0xc9cdcb, 0.55, 0.06);
  const officeMat = phys(0xe6e7e4, 0.62, 0.02);
  const darkMat = phys(0x2b2f33, 0.68, 0.1);
  const blindMat = phys(0xd9d3c6, 0.78, 0);
  const kltMat = M.kltBlue.clone(); kltMat.side = THREE.DoubleSide;
  const glassMat = M.pcClear.clone(); glassMat.color.set(0xc7d9e2); glassMat.opacity = 0.17; glassMat.roughness = 0.06;
  const truckMat = phys(0xd0441d, 0.52, 0.12);
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x3d3a35, emissive: 0xffe8c4, emissiveIntensity: 2.4, roughness: 0.5 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x443f38, emissive: 0xfff0d8, emissiveIntensity: 0.6, roughness: 0.7 });

  // ---------------------------------------------------------------- merge buckets: one draw call per material
  const B = {};
  const bucket = (name, mat, cast = true) => { B[name] = { mat, list: [], cast }; };
  bucket("marks", M.ral1023); bucket("hatch", hatchMat); bucket("joints", jointMat);
  bucket("walls", wallMat, false); bucket("plinth", plinthMat, false);
  bucket("structure", M.ral7016); bucket("steel", M.galv); bucket("roof", roofMat, false); bucket("sky", skyMat, false);
  bucket("door", doorMat); bucket("glass", glassMat, false); bucket("alu", M.aluClear);
  bucket("officeWall", officeMat); bucket("officeDark", darkMat); bucket("officeGlow", glowMat, false);
  bucket("cardboardProps", M.cardboard); bucket("tableTop", topMat); bucket("tableLegs", M.ral7016);
  bucket("granite", graniteMat); bucket("darkParts", M.t3Dark); bucket("steelParts", M.steel);
  bucket("pegboard", pegMat); bucket("plasticDark", M.blackPlastic); bucket("rubber", M.blackRubber);
  bucket("truckBody", truckMat); bucket("bluePaint", M.ral5015); bucket("airPipe", airMat); bucket("redPaint", M.ral3020);
  bucket("woodProps", woodMat);

  const putGeom = (name, g) => { B[name].list.push(g); return g; };
  function xf(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  }
  function putBox(name, w, d, h, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.BoxGeometry(w, d, h);
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    g.translate(x, y, z); return putGeom(name, g);
  }
  function putRound(name, w, d, h, r, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = new RoundedBoxGeometry(w, d, h, 3, r);
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    g.translate(x, y, z); return putGeom(name, g);
  }
  function putCyl(name, r, len, x, y, z, rx = Math.PI / 2, ry = 0, rz = 0, seg = 18, rTop = null) {
    const g = new THREE.CylinderGeometry(rTop == null ? r : rTop, r, len, seg);
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    g.translate(x, y, z); return putGeom(name, g);
  }
  function putSphere(name, r, x, y, z, seg = 12) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)); g.translate(x, y, z); return putGeom(name, g);
  }
  function putRod(name, a, b, r, seg = 8) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    if (L < 1e-6) return;
    const g = new THREE.CylinderGeometry(r, r, L, seg);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.multiplyScalar(1 / L));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    return putGeom(name, g);
  }
  function scaleUV(g, su, sv) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    return g;
  }
  function putFloor(name, w, d, x, y, z, u = null, v = null) {
    const g = new THREE.PlaneGeometry(w, d);
    if (u != null) scaleUV(g, u, v);
    g.translate(x, y, z); return putGeom(name, g);
  }
  function facadeGeo(w, h, x, y, z, nx, ny) {
    const g = new THREE.PlaneGeometry(w, h);
    const n = new THREE.Vector3(nx, ny, 0).normalize();
    const right = new THREE.Vector3().crossVectors(UPC, n);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(right, UPC.clone(), n));
    g.translate(x, y, z); return g;
  }
  const putFacade = (name, w, h, x, y, z, nx, ny) => putGeom(name, facadeGeo(w, h, x, y, z, nx, ny));

  // ---------------------------------------------------------------- floor paint
  const FL = F + 0.004, HZ = F + 0.007, JT = F + 0.002;
  const hLine = (x0, x1, y, w = 0.08, z = FL) => putFloor("marks", x1 - x0, w, (x0 + x1) / 2, y, z);
  const vLine = (x, y0, y1, w = 0.08, z = FL) => putFloor("marks", w, y1 - y0, x, (y0 + y1) / 2, z);
  const lineRect = (x0, y0, x1, y1, w = 0.08) => {
    hLine(x0, x1, y0, w); hLine(x0, x1, y1, w);
    vLine(x0, y0 + w / 2, y1 - w / 2, w); vLine(x1, y0 + w / 2, y1 - w / 2, w);
  };
  // safety outline around the cell (0.6 m off the guard)
  lineRect(-1.95, -1.70, 1.95, 2.05, 0.09);
  // pedestrian walkway across the hall and two cross aisles
  hLine(-10.4, 12.4, -3.45); hLine(-10.4, 12.4, -2.30);
  vLine(-5.40, -3.41, 5.10); vLine(-4.30, -3.41, 5.10);
  vLine(9.40, -3.41, 3.35); vLine(10.50, -3.41, 3.35);
  // saw-cut floor joints on the column grid
  for (const x of [-5, 7]) vLine(x, Y0 + 0.05, Y1 - 0.05, 0.008, JT);
  for (const y of [-4.6, 4.6]) hLine(X0 + 0.05, X1 - 0.05, y, 0.008, JT);
  // hazard hatching in front of the cabinet and the tray outfeed
  putFloor("hatch", 1.24, 0.52, 1.78, 1.11, HZ, 1.24 / 0.5, 0.52 / 0.5);
  putFloor("hatch", 1.24, 0.66, -2.11, -0.60, HZ, 1.24 / 0.5, 0.66 / 0.5);
  // L-shaped corner marks for pallet places in front of the racks and at the sectional door
  const lMark = (x, y, w = 1.4, d = 1.0, leg = 0.24, t = 0.07) => {
    for (const [sx, sy] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) {
      putFloor("marks", leg, t, x + sx * (w / 2 - leg / 2), y + sy * (d / 2 - t / 2), FL);
      putFloor("marks", t, leg, x + sx * (w / 2 - t / 2), y + sy * (d / 2 - leg / 2), FL);
    }
  };
  lMark(-8.3, 4.55); lMark(-3.1, 4.55); lMark(2.2, 4.55); lMark(11.1, -6.2);

  // ---------------------------------------------------------------- sandwich-panel walls (three sides, the front is open for the view)
  function wallBox(w, d, h, x, y, z, span) {
    const g = scaleUV(new THREE.BoxGeometry(w, d, h), span, h);
    g.translate(x, y, z); return putGeom("walls", g);
  }
  // side walls: the visible x-face maps u to height and v to length, so swap the ribs back to vertical
  function wallBoxX(len, h, x, y, z) {
    const g = new THREE.BoxGeometry(0.10, len, h), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v * len, u * h); }
    g.translate(x, y, z); return putGeom("walls", g);
  }
  // back wall y = 7, with the personnel door
  wallBox(13.70, 0.10, 7, -4.15, 6.95, F + 3.5, 13.70);
  wallBox(9.35, 0.10, 7, 8.325, 6.95, F + 3.5, 9.35);
  wallBox(0.95, 0.10, 4.9, 3.175, 6.95, F + 4.55, 0.95);
  // left wall x = -11
  wallBoxX(14, 7, -10.95, 0, F + 3.5);
  // right wall x = 13, with the sectional door
  wallBoxX(1.90, 7, 12.95, -6.05, F + 3.5);
  wallBoxX(8.50, 7, 12.95, 2.75, F + 3.5);
  wallBoxX(3.60, 3.40, 12.95, -3.30, F + 5.30);
  // plinth along the three walls
  putBox("plinth", 23.9, 0.05, 0.14, 0, 6.88, F + 0.07);
  putBox("plinth", 0.05, 13.9, 0.14, -10.88, 0, F + 0.07);
  putBox("plinth", 0.05, 13.9, 0.14, 12.88, 0, F + 0.07);
  // wall head trim
  putBox("plinth", 23.9, 0.06, 0.10, 0, 6.89, TOP - 0.10);
  putBox("plinth", 0.06, 13.9, 0.10, -10.89, 0, TOP - 0.10);
  putBox("plinth", 0.06, 13.9, 0.10, 12.89, 0, TOP - 0.10);

  // ---------------------------------------------------------------- steel portal frame, purlins, roof and skylights
  const colsX = [X0, -5, 1, 7, X1];
  const colTop = TOP - 0.35, colH = colTop - F;
  // portal columns every 6 m on both long walls. The front row stands on the slab edge (y = -7), outside the
  // camera corridor; a header beam ties the rafter ends together over the open side.
  for (const x of colsX) for (const y of [-7.0, 6.9]) {
    putBox("structure", 0.20, 0.012, colH, x, y - 0.095, F + colH / 2);
    putBox("structure", 0.20, 0.012, colH, x, y + 0.095, F + colH / 2);
    putBox("structure", 0.012, 0.19, colH, x, y, F + colH / 2);
    putBox("structure", 0.36, 0.36, 0.025, x, y, F + 0.0125);
    putBox("structure", 0.22, 0.22, 0.045, x, y, F + 0.045);
  }
  putBox("structure", 24, 0.20, 0.20, 1, -7.0, TOP - 0.25);   // front header
  for (const x of colsX) {                                   // rafters, HEA 200, under the purlins
    putBox("structure", 0.20, 14, 0.012, x, 0, TOP - 0.156);
    putBox("structure", 0.20, 14, 0.012, x, 0, TOP - 0.344);
    putBox("structure", 0.012, 14, 0.176, x, 0, TOP - 0.25);
  }
  for (const y of [-6.0, -4.0, -0.8, 0.8, 4.0, 6.0]) putBox("steel", 24, 0.08, 0.15, 1, y, TOP - 0.075);  // purlins
  // roof deck (dark underside) and fascia
  putBox("roof", 24, 14, 0.08, 1, 0, TOP + 0.04);
  for (const y of [Y0, Y1]) putBox("steel", 24, 0.10, 0.32, 1, y, TOP + 0.16);
  for (const x of [X0, X1]) putBox("steel", 0.10, 14, 0.32, x, 0, TOP + 0.16);
  // two skylight strips
  for (const y of [-2.55, 2.55]) {
    const g = new THREE.PlaneGeometry(24, 1.40); g.rotateX(Math.PI); g.translate(1, y, TOP - 0.006); putGeom("sky", g);
    putBox("steel", 24, 0.06, 0.06, 1, y - 0.73, TOP - 0.05);
    putBox("steel", 24, 0.06, 0.06, 1, y + 0.73, TOP - 0.05);
    for (let x = -9.5; x <= 11.5; x += 3.5) putBox("steel", 0.05, 1.52, 0.05, x, y, TOP - 0.03);
  }

  // ---------------------------------------------------------------- LED high-bay fixtures (instanced) at 6.5 m
  const lampX = [-9, -4, 1, 6, 11], lampY = [-4.5, 0, 4.5], lampM = [];
  for (const x of lampX) for (const y of lampY) {
    lampM.push(xf(x, y, F + 6.5, 0, 0, 0, 1, 1, 1));
    putRod("steel", V(x, y, F + 6.56), V(x, y, TOP - 0.03), 0.011, 6);
    putCyl("steel", 0.035, 0.02, x, y, TOP - 0.04, Math.PI / 2, 0, 0, 12);
  }
  const lampGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.10, 28); lampGeo.rotateX(Math.PI / 2);
  const lampIM = new THREE.InstancedMesh(lampGeo, M.ral7035, lampM.length);
  const lampLedM = [];
  lampM.forEach((m, i) => {
    lampIM.setMatrixAt(i, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m); p.z -= 0.052;
    lampLedM.push(xf(p.x, p.y, p.z, 0, 0, 0, 1, 1, 1));
  });
  lampIM.name = "hall_lamps"; lampIM.castShadow = true; lampIM.receiveShadow = true; lampIM.frustumCulled = false; root.add(lampIM);
  const ledGeo = new THREE.CylinderGeometry(0.205, 0.205, 0.014, 28); ledGeo.rotateX(Math.PI / 2);
  const ledIM = new THREE.InstancedMesh(ledGeo, ledMat, lampLedM.length);
  lampLedM.forEach((m, i) => ledIM.setMatrixAt(i, m));
  ledIM.name = "hall_lamp_leds"; ledIM.castShadow = false; ledIM.receiveShadow = false; ledIM.frustumCulled = false; root.add(ledIM);

  // ---------------------------------------------------------------- sectional door in the x = 13 wall
  const doorY = -3.30, doorW = 3.60, doorH = 3.60;
  for (let p = 0; p < 4; p++) {
    const z = F + 0.05 + p * 0.885;
    putBox("door", 0.055, doorW - 0.06, 0.855, 12.90, doorY, z + 0.4275);
    putBox("steel", 0.065, doorW - 0.06, 0.012, 12.895, doorY, z + 0.86);           // seam
    if (p === 3) {                                                                  // glazed panel
      for (let i = -1; i <= 1; i++) putFacade("glass", 0.78, 0.33, 12.86, doorY + i * 1.05, z + 0.43, -1, 0);
      for (let i = -1; i <= 1; i++) {
        putBox("steel", 0.03, 0.86, 0.03, 12.86, doorY + i * 1.05, z + 0.26);
        putBox("steel", 0.03, 0.86, 0.03, 12.86, doorY + i * 1.05, z + 0.60);
      }
    }
  }
  // door frame, tracks and counterweight shaft
  for (const y of [doorY - doorW / 2, doorY + doorW / 2]) putBox("steel", 0.10, 0.10, doorH + 0.12, 12.90, y, F + doorH / 2);
  putBox("steel", 0.10, doorW + 0.2, 0.10, 12.90, doorY, F + doorH + 0.02);
  for (const y of [doorY - doorW / 2 - 0.12, doorY + doorW / 2 + 0.12]) putBox("steel", 0.09, 0.09, 4.10, 12.83, y, F + 2.05);
  putBox("steel", 0.10, 0.10, 0.10, 12.83, doorY, F + 4.05);
  putCyl("steel", 0.032, doorW + 0.2, 12.82, doorY, F + 3.98, 0, Math.PI / 2, 0, 12);
  putBox("darkParts", 0.22, 0.30, 0.24, 12.80, doorY + doorW / 2 - 0.3, F + 4.12);
  putBox("redPaint", 0.09, 0.09, 0.02, 12.80, doorY + doorW / 2 - 0.3, F + 4.26);
  // handle and control box
  putBox("steel", 0.04, 0.26, 0.04, 12.84, doorY + 0.9, F + 0.95);
  putBox("darkParts", 0.10, 0.26, 0.36, 12.88, doorY + doorW / 2 + 0.42, F + 1.30);
  putCyl("plasticDark", 0.028, 0.02, 12.82, doorY + doorW / 2 + 0.42, F + 1.42, 0, 0, Math.PI / 2, 12);
  putCyl("redPaint", 0.020, 0.02, 12.82, doorY + doorW / 2 + 0.42, F + 1.25, 0, 0, Math.PI / 2, 12);

  // ---------------------------------------------------------------- personnel door in the back wall
  const pdX = 3.175, pdW = 0.95, pdH = 2.10;
  putBox("door", pdW - 0.06, 0.055, pdH - 0.05, pdX, 6.90, F + pdH / 2);
  putBox("steel", 0.07, 0.07, pdH + 0.08, pdX - pdW / 2, 6.90, F + pdH / 2);
  putBox("steel", 0.07, 0.07, pdH + 0.08, pdX + pdW / 2, 6.90, F + pdH / 2);
  putBox("steel", pdW + 0.12, 0.07, 0.07, pdX, 6.90, F + pdH + 0.04);
  putBox("steel", pdW - 0.10, 0.10, 0.012, pdX, 6.90, F + 0.006);
  putFacade("glass", 0.24, 0.52, pdX, 6.86, F + 1.54, 0, -1);
  putBox("steel", 0.28, 0.02, 0.02, pdX, 6.85, F + 1.81);
  putBox("steel", 0.28, 0.02, 0.02, pdX, 6.85, F + 1.27);
  putBox("steel", 0.02, 0.024, 0.56, pdX - 0.13, 6.85, F + 1.54);
  putBox("steel", 0.02, 0.024, 0.56, pdX + 0.13, 6.85, F + 1.54);
  putBox("steel", 0.30, 0.05, 0.04, pdX + 0.18, 6.84, F + 1.05);                 // push bar
  putBox("steel", 0.04, 0.04, 0.30, pdX + 0.32, 6.84, F + 1.20);
  putRod("steel", V(pdX - 0.32, 6.83, F + 1.95), V(pdX + 0.10, 6.83, F + 2.18), 0.014, 8); // door closer

  // ---------------------------------------------------------------- office block, back-right corner
  const ox0 = 8.55, ox1 = 12.90, oy0 = 3.55, oy1 = 6.90, oh = 2.90;
  const oz = F + oh;
  wallOffice(ox0, ox1, oy0, oh);                            // front face segments
  function wallOffice(x0, x1, y, h) {
    // left pier, under/over window, middle pier, over door, right pier
    putBox("officeWall", 0.60, 0.10, h, x0 + 0.30, y, F + h / 2);
    putBox("officeWall", 2.30, 0.10, 1.15, 10.30, y, F + 0.575);
    putBox("officeWall", 2.30, 0.10, h - 2.35, 10.30, y, F + 2.35 + (h - 2.35) / 2);
    putBox("officeWall", 0.30, 0.10, h, 11.60, y, F + h / 2);
    putBox("officeWall", 0.85, 0.10, h - 2.10, 12.175, y, F + 2.10 + (h - 2.10) / 2);
    putBox("officeWall", 0.30, 0.10, h, 12.75, y, F + h / 2);
  }
  putBox("officeWall", 0.10, oy1 - oy0, oh, ox0, (oy0 + oy1) / 2, F + oh / 2);    // side wall
  putBox("officeWall", ox1 - ox0 + 0.10, oy1 - oy0 + 0.10, 0.12, (ox0 + ox1) / 2, (oy0 + oy1) / 2, oz + 0.06); // roof
  putBox("steel", ox1 - ox0 + 0.24, oy1 - oy0 + 0.24, 0.10, (ox0 + ox1) / 2, (oy0 + oy1) / 2, oz + 0.17);       // fascia
  // window: 9.15..11.45, 1.15..2.35 high, aluminium frame, two panes, blinds behind
  const wx0 = 9.15, wx1 = 11.45, wz0 = F + 1.15, wz1 = F + 2.35;
  putBox("alu", wx1 - wx0 + 0.10, 0.07, 0.06, (wx0 + wx1) / 2, oy0 - 0.035, wz0 - 0.015);
  putBox("alu", wx1 - wx0 + 0.10, 0.07, 0.06, (wx0 + wx1) / 2, oy0 - 0.035, wz1 + 0.015);
  putBox("alu", 0.06, 0.07, wz1 - wz0 + 0.10, wx0 - 0.015, oy0 - 0.035, (wz0 + wz1) / 2);
  putBox("alu", 0.06, 0.07, wz1 - wz0 + 0.10, wx1 + 0.015, oy0 - 0.035, (wz0 + wz1) / 2);
  putBox("alu", 0.05, 0.07, wz1 - wz0, (wx0 + wx1) / 2, oy0 - 0.035, (wz0 + wz1) / 2);
  putBox("alu", wx1 - wx0 + 0.18, 0.16, 0.04, (wx0 + wx1) / 2, oy0 - 0.08, wz0 - 0.07); // sill
  putFacade("glass", 1.11, wz1 - wz0 - 0.04, wx0 + 0.575, oy0 - 0.005, (wz0 + wz1) / 2, 0, -1);
  putFacade("glass", 1.11, wz1 - wz0 - 0.04, wx1 - 0.575, oy0 - 0.005, (wz0 + wz1) / 2, 0, -1);
  putBox("officeDark", 2.30, 0.06, 0.10, (wx0 + wx1) / 2, oy0 + 0.08, wz1 + 0.01);   // blind headrail
  const blindM = [];
  for (const cx of [wx0 + 0.575, wx1 - 0.575]) {
    for (let i = 0; i < 34; i++) {
      const z = wz1 - 0.06 - i * 0.024, down = i / 34;
      blindM.push(xf(cx, oy0 + 0.075, z, 0.52, 0, 0, 1 - down * 0.06, 1, 1));
    }
  }
  putBox("officeDark", 0.012, 0.012, 0.62, wx0 + 0.08, oy0 + 0.06, wz1 - 0.35);
  putBox("officeDark", 0.012, 0.012, 0.62, wx0 + 1.06, oy0 + 0.06, wz1 - 0.35);
  putBox("officeDark", 0.012, 0.012, 0.62, wx1 - 1.06, oy0 + 0.06, wz1 - 0.35);
  putBox("officeDark", 0.012, 0.012, 0.62, wx1 - 0.08, oy0 + 0.06, wz1 - 0.35);
  // office door, frame and plaque
  const odX = 12.175, odW = 0.85, odH = 2.10;
  putBox("door", odW - 0.04, 0.055, odH - 0.04, odX, oy0 - 0.03, F + odH / 2);
  putBox("alu", 0.06, 0.08, odH + 0.08, odX - odW / 2, oy0 - 0.03, F + odH / 2);
  putBox("alu", 0.06, 0.08, odH + 0.08, odX + odW / 2, oy0 - 0.03, F + odH / 2);
  putBox("alu", odW + 0.12, 0.08, 0.06, odX, oy0 - 0.03, F + odH + 0.04);
  putFacade("glass", 0.22, 0.52, odX, oy0 - 0.06, F + 1.55, 0, -1);
  putBox("steel", 0.26, 0.02, 0.02, odX, oy0 - 0.07, F + 1.82);
  putBox("steel", 0.26, 0.02, 0.02, odX, oy0 - 0.07, F + 1.28);
  putBox("steel", 0.02, 0.024, 0.56, odX - 0.12, oy0 - 0.07, F + 1.55);
  putBox("steel", 0.02, 0.024, 0.56, odX + 0.12, oy0 - 0.07, F + 1.55);
  putCyl("steel", 0.015, 0.14, odX + 0.30, oy0 - 0.09, F + 1.05, 0, Math.PI / 2, 0, 8);
  putBox("darkParts", 0.86, 0.02, 0.22, odX, oy0 - 0.07, F + 0.16);
  putBox("plinth", 3.20, 0.05, 0.09, 10.15, oy0 - 0.06, F + 0.045);          // front skirting, left of the door
  putBox("plinth", 0.30, 0.05, 0.09, 12.75, oy0 - 0.06, F + 0.045);
  putBox("plinth", 0.05, 3.30, 0.09, ox0 - 0.06, 5.22, F + 0.045);           // side skirting
  putBox("steelParts", 0.88, 0.08, 0.012, odX, oy0 - 0.06, F + 0.008);       // door threshold
  // interior silhouette and ceiling glow seen through the glass
  putBox("officeDark", 1.7, 0.55, 0.05, 10.6, 5.35, F + 0.74);
  putBox("officeDark", 0.06, 0.06, 0.72, 9.85, 5.35, F + 0.36);
  putBox("officeDark", 0.06, 0.06, 0.72, 11.35, 5.35, F + 0.36);
  putBox("officeDark", 0.55, 0.05, 0.34, 10.2, 5.35, F + 1.05);
  putBox("officeGlow", 2.6, 0.06, 0.05, 10.7, 4.7, F + 2.72);
  // AC unit on the office roof
  putBox("officeWall", 0.80, 0.42, 0.38, 9.4, 5.6, oz + 0.31);
  putCyl("darkParts", 0.14, 0.02, 9.4, 5.375, oz + 0.31, 0, 0, 0, 16);

  // ---------------------------------------------------------------- pallet racks, back wall (blue uprights, orange beams, 3 levels)
  const rackX = [-9.6, -7.0, -4.4, -1.8, 0.8], rackYF = 5.55, rackYB = 6.55, rackH = 4.30;
  const rackBeamZ = [F + 0.15, F + 1.62, F + 3.05];
  const blueM = [], orangeM = [];
  const addInst = (list, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => list.push(xf(x, y, z, rx, ry, rz, sx, sy, sz));
  for (const x of rackX) {
    for (const y of [rackYF, rackYB]) {
      addInst(blueM, x, y, F + rackH / 2, 0.09, 0.07, rackH);
      addInst(blueM, x, y, F + 0.02, 0.20, 0.18, 0.04);
    }
    for (const z of [F + 0.35, F + 2.15, F + 3.95]) addInst(blueM, x, (rackYF + rackYB) / 2, z, 0.05, rackYB - rackYF, 0.05);
    const dy = rackYB - rackYF, dz = F + 3.95 - (F + 0.35), L = Math.hypot(dy, dz);
    addInst(blueM, x, (rackYF + rackYB) / 2, (F + 0.35 + F + 3.95) / 2, 0.045, L, 0.045, Math.atan2(dz, dy), 0, 0);
  }
  for (let i = 0; i < rackX.length - 1; i++) {
    const xc = (rackX[i] + rackX[i + 1]) / 2, span = rackX[i + 1] - rackX[i];
    for (const z of rackBeamZ) for (const y of [rackYF, rackYB]) {
      addInst(orangeM, xc, y, z - 0.07, span - 0.09, 0.05, 0.14);
      addInst(orangeM, xc - (span - 0.09) / 2, y, z - 0.07, 0.03, 0.10, 0.18);
      addInst(orangeM, xc + (span - 0.09) / 2, y, z - 0.07, 0.03, 0.10, 0.18);
    }
  }
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  function instanceList(geo, mat, mats, name, cast = true) {
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.name = name; im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false; root.add(im); return im;
  }
  instanceList(unitBox, M.ral5015, blueM, "hall_rack_uprights");
  instanceList(unitBox, M.ral2004, orangeM, "hall_rack_beams");

  // ---------------------------------------------------------------- EUR pallets, cartons, KLT bins
  const palletGeo = (() => {
    const list = [];
    const w = (x, y, z, sx, sy, sz) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(x, y, z); list.push(g); };
    for (const y of [-0.32, 0, 0.32]) w(0, y, 0.011, 1.2, 0.10, 0.022);           // bottom runners
    for (const x of [-0.45, 0, 0.45]) for (const y of [-0.30, 0, 0.30]) w(x, y, 0.061, 0.145, 0.10, 0.078); // blocks
    for (const y of [-0.32, 0, 0.32]) w(0, y, 0.111, 1.2, 0.10, 0.022);           // stringers
    for (const y of [-0.36, -0.18, 0, 0.18, 0.36]) w(0, y, 0.133, 1.2, 0.145, 0.022); // deck boards
    const merged = BufferGeometryUtils.mergeGeometries(list.map((g) => g.toNonIndexed()), false);
    list.forEach((g) => g.dispose());
    return merged;
  })();
  const palletM = [], cartonM = [], kltM = [];
  const cartonS = [0.36, 0.36, 0.26];
  const rackBays = rackX.slice(0, -1).map((x, i) => (x + rackX[i + 1]) / 2);
  const load = [
    ["carton", "carton", "carton", "carton"],
    ["carton", "klt", null, "carton"],
    [null, "carton", null, null],
  ];
  const rnd = mulberry32(4711);
  const palletAt = (x, y, z, yaw = 0) => palletM.push(xf(x, y, z, 0, 0, yaw, 1, 1, 1));
  const cartonsOnPallet = (x, y, z, layers = 2) => {
    for (let l = 0; l < layers; l++) for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const yaw = (rnd() - 0.5) * 0.04;
      cartonM.push(xf(x + (i - 1) * 0.39 + (rnd() - 0.5) * 0.012, y + (j - 0.5) * 0.40 + (rnd() - 0.5) * 0.012,
        z + 0.144 + cartonS[2] / 2 + l * (cartonS[2] + 0.004), 0, 0, yaw, cartonS[0], cartonS[1], cartonS[2]));
    }
  };
  const kltsOnPallet = (x, y, z, layers = 2) => {
    for (let l = 0; l < layers; l++) for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      klts(x + (i - 1) * 0.40, y + (j - 0.5) * 0.30, z + 0.144 + l * 0.150, (rnd() - 0.5) * 0.03);
    }
  };
  const klts = (x, y, z, yaw = 0) => kltM.push(xf(x, y, z, 0, 0, yaw, 1, 1, 1));
  load.forEach((row, level) => row.forEach((kind, bay) => {
    if (!kind) return;
    const x = rackBays[bay], z = rackBeamZ[level];
    palletAt(x, 6.05, z);
    if (kind === "carton") cartonsOnPallet(x, 6.05, z, level === 2 ? 1 : 2);
    else kltsOnPallet(x, 6.05, z, 2);
  }));
  // free pallets: octabin bases, packing area and a stack of empties
  palletAt(-3.8, 2.00, F); palletAt(-3.8, 3.15, F); palletAt(3.6, 2.00, F);
  palletAt(3.8, 4.40, F); cartonsOnPallet(3.8, 4.40, F, 2);
  palletAt(11.65, -0.65, F); cartonsOnPallet(11.65, -0.65, F, 2);
  for (let i = 0; i < 5; i++) palletAt(-8.9, 4.55, F + i * 0.148, i * 0.012);
  // loose cartons by the work areas
  for (let i = 0; i < 3; i++) cartonM.push(xf(2.85, 5.10, F + 0.15 + i * 0.27, 0, 0, 0.04 * i, 0.42, 0.32, 0.26));
  // WIP cart with KLT bins (two shelves, four castors)
  const cartX = -3.48, cartY = 0.20;
  putBox("tableTop", 1.35, 0.62, 0.03, cartX, cartY, F + 0.265);
  putBox("tableTop", 1.35, 0.62, 0.03, cartX, cartY, F + 0.705);
  for (const dx of [-0.66, 0.66]) for (const dy of [-0.29, 0.29]) putBox("tableLegs", 0.03, 0.03, 0.71, cartX + dx, cartY + dy, F + 0.355);
  for (const dx of [-0.55, 0.55]) for (const dy of [-0.22, 0.22]) putCyl("rubber", 0.05, 0.04, cartX + dx, cartY + dy, F + 0.05, 0, 0, Math.PI / 2, 12);
  for (let i = 0; i < 3; i++) klts(cartX - 0.56 + i * 0.42, cartY - 0.02, F + 0.72);
  for (let i = 0; i < 2; i++) klts(cartX - 0.35 + i * 0.42, cartY - 0.02, F + 0.28);
  instanceList(palletGeo, woodMat, palletM, "hall_pallets");
  const cartonGeo = new THREE.BoxGeometry(1, 1, 1);
  instanceList(cartonGeo, M.cardboard, cartonM, "hall_cartons");
  // tapered KLT 4310: 400 x 300 x 147, open top
  const kltGeo = (() => {
    const list = [];
    const body = new THREE.CylinderGeometry(0.283, 0.254, 0.147, 4, 1, true);
    body.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, Math.PI / 4, 0)));
    body.scale(1, 0.75, 1); body.translate(0, 0, 0.0735); list.push(body.toNonIndexed());
    const bot = new THREE.BoxGeometry(0.362, 0.272, 0.012); bot.translate(0, 0, 0.006); list.push(bot.toNonIndexed());
    for (const s of [-1, 1]) {
      const rim = new THREE.BoxGeometry(0.40, 0.02, 0.018); rim.translate(0, s * 0.15, 0.140); list.push(rim.toNonIndexed());
      const rim2 = new THREE.BoxGeometry(0.018, 0.30, 0.018); rim2.translate(s * 0.20, 0, 0.140); list.push(rim2.toNonIndexed());
    }
    const merged = BufferGeometryUtils.mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    return merged;
  })();
  instanceList(kltGeo, kltMat, kltM, "hall_klt");
  // blind slats
  instanceList(new THREE.BoxGeometry(1.10, 0.045, 0.005), blindMat, blindM, "hall_office_blinds", false);

  // ---------------------------------------------------------------- octabins of bulk parts near the hoppers
  const octabin = (x, y, yaw = 0) => {
    putBox("cardboardProps", 1.0, 1.0, 0.95, x, y, F + 0.144 + 0.475, 0, 0, yaw);
    putBox("cardboardProps", 1.02, 1.02, 0.03, x, y, F + 0.144 + 0.96, 0, 0, yaw);
    putBox("cardboardProps", 1.01, 0.08, 0.012, x, y, F + 0.144 + 0.978, 0, 0, yaw);
    putBox("cardboardProps", 0.08, 1.01, 0.012, x, y, F + 0.144 + 0.978, 0, 0, yaw);
  };
  octabin(-3.8, 2.00); octabin(-3.8, 3.15); octabin(3.6, 2.00);

  // ---------------------------------------------------------------- QC table along the left wall
  const qcX = -10.25, qcY = 3.05, qcW = 0.80, qcL = 1.80, qcH = 0.92;
  putBox("tableTop", qcW, qcL, 0.05, qcX, qcY, F + qcH);
  putBox("tableLegs", qcW - 0.08, qcL - 0.08, 0.03, qcX, qcY, F + 0.20);
  for (const x of [qcX - 0.33, qcX + 0.33]) for (const y of [qcY - 0.82, qcY + 0.82]) putBox("tableLegs", 0.05, 0.05, qcH - 0.05, x, y, F + (qcH - 0.05) / 2);
  for (const x of [qcX - 0.33, qcX + 0.33]) putBox("tableLegs", 0.04, qcL - 0.08, 0.05, x, qcY, F + 0.82);
  putBox("tableLegs", qcW - 0.08, 0.04, 0.05, qcX, qcY - 0.82, F + 0.82);
  putBox("tableLegs", qcW - 0.08, 0.04, 0.05, qcX, qcY + 0.82, F + 0.82);
  // granite plate
  const gx = -10.30, gy = 3.42;
  putBox("granite", 0.55, 0.42, 0.075, gx, gy, F + qcH + 0.0375);
  // height gauge
  putBox("steelParts", 0.24, 0.16, 0.035, gx + 0.03, gy + 0.05, F + qcH + 0.075 + 0.0175);
  putBox("steelParts", 0.03, 0.03, 0.52, gx + 0.08, gy + 0.10, F + qcH + 0.075 + 0.26);
  putBox("darkParts", 0.10, 0.09, 0.09, gx + 0.02, gy + 0.10, F + qcH + 0.075 + 0.34);
  putBox("steelParts", 0.18, 0.02, 0.025, gx - 0.03, gy + 0.10, F + qcH + 0.075 + 0.28);
  putCyl("steelParts", 0.028, 0.025, gx + 0.02, gy + 0.055, F + qcH + 0.075 + 0.34, Math.PI / 2, 0, 0, 16);
  // stereo microscope
  const mx = -10.28, my = 2.55;
  putBox("darkParts", 0.26, 0.20, 0.045, mx, my, F + qcH + 0.0225);
  putBox("steelParts", 0.035, 0.035, 0.46, mx + 0.06, my, F + qcH + 0.26);
  putBox("steelParts", 0.26, 0.035, 0.035, mx + 0.06, my - 0.08, F + qcH + 0.47);
  putBox("darkParts", 0.14, 0.11, 0.16, mx + 0.17, my - 0.08, F + qcH + 0.42);
  putCyl("darkParts", 0.026, 0.09, mx + 0.17, my - 0.13, F + qcH + 0.50, 0.5, 0, 0, 12);
  putCyl("darkParts", 0.026, 0.09, mx + 0.17, my - 0.03, F + qcH + 0.50, 0.5, 0, 0, 12);
  putCyl("steelParts", 0.022, 0.07, mx + 0.17, my - 0.08, F + qcH + 0.33, Math.PI / 2, 0, 0, 12);
  // monitor on the table, screen facing +x
  const monY = 2.20;
  putBox("darkParts", 0.05, 0.28, 0.18, -10.58, monY, F + qcH + 0.10);
  putCyl("steelParts", 0.026, 0.18, -10.56, monY, F + qcH + 0.10, Math.PI / 2, 0, 0, 12);
  putBox("darkParts", 0.035, 0.50, 0.33, -10.53, monY, F + qcH + 0.28);
  const qcScreen = screenMat(512, 288, (g, w, h) => {
    g.fillStyle = "#0c141b"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1e6f8f"; g.fillRect(0, 0, w, 34);
    g.fillStyle = "#dfeef5"; g.font = "600 20px 'IBM Plex Sans', Arial, sans-serif"; g.fillText("QC-STATION 01", 14, 23);
    g.fillStyle = "#7bd6a8"; g.font = "600 17px 'IBM Plex Mono', monospace"; g.fillText("PUSH-BUTTON · S4 FORCE / TRAVEL", 14, 62);
    g.strokeStyle = "#2a4e63"; g.lineWidth = 2;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(20, 92 + i * 34); g.lineTo(w - 20, 92 + i * 34); g.stroke(); }
    g.fillStyle = "#d7e8f0"; g.font = "500 16px 'IBM Plex Mono', monospace";
    [["FORCE", "12.84 N"], ["TRAVEL", "4.51 mm"], ["SPRING RATE", "0.821 N/mm"], ["RESULT", "PASS"]].forEach((r, i) => {
      g.fillStyle = i === 3 ? "#7bd6a8" : "#d7e8f0"; g.fillText(r[0], 26, 118 + i * 34); g.fillText(r[1], 250, 118 + i * 34);
    });
  }, 0.5);
  const qcScr = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.26), qcScreen);
  qcScr.matrix.makeBasis(new THREE.Vector3(0, 1, 0), UPC.clone(), new THREE.Vector3(1, 0, 0));
  qcScr.matrix.setPosition(-10.51, monY, F + qcH + 0.28); qcScr.matrixAutoUpdate = false; qcScr.name = "hall_qc_screen"; qcScr.castShadow = false; qcScr.receiveShadow = true; root.add(qcScr);
  // stool
  putCyl("plasticDark", 0.17, 0.05, -9.30, 2.95, F + 0.62, Math.PI / 2, 0, 0, 24);
  putCyl("steelParts", 0.032, 0.40, -9.30, 2.95, F + 0.38, Math.PI / 2, 0, 0, 12);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    putRod("steelParts", V(-9.30, 2.95, F + 0.20), V(-9.30 + Math.cos(a) * 0.26, 2.95 + Math.sin(a) * 0.26, F + 0.05), 0.014, 8);
  }
  putCyl("plasticDark", 0.05, 0.02, -9.30, 2.95, F + 0.03, Math.PI / 2, 0, 0, 12);

  // ---------------------------------------------------------------- workbench with perforated tool board (left wall)
  const wbX = -10.25, wbY = 0.80, wbW = 0.68, wbL = 2.00, wbH = 0.92;
  putBox("tableTop", wbW, wbL, 0.05, wbX, wbY, F + wbH);
  putBox("woodProps", wbW - 0.04, wbL - 0.06, 0.03, wbX, wbY, F + 0.22);
  for (const x of [wbX - 0.27, wbX + 0.27]) for (const y of [wbY - 0.92, wbY + 0.92]) putBox("tableLegs", 0.05, 0.05, wbH - 0.05, x, y, F + (wbH - 0.05) / 2);
  for (const x of [wbX - 0.27, wbX + 0.27]) putBox("tableLegs", 0.04, wbL - 0.08, 0.05, x, wbY, F + 0.82);
  // pegboard on the wall, 1.7 x 0.8 at 1.25..2.05
  const pbW = 1.70, pbH = 0.80, pbY = wbY + 0.10, pbZ = F + 1.65;
  const pbg = putFacade("pegboard", pbW, pbH, -10.887, pbY, pbZ, 1, 0);
  scaleUV(pbg, pbW / 0.16, pbH / 0.16);
  putBox("alu", 0.02, pbW + 0.06, 0.03, -10.895, pbY, F + 1.65 - pbH / 2 - 0.02);
  putBox("alu", 0.02, pbW + 0.06, 0.03, -10.895, pbY, F + 1.65 + pbH / 2 + 0.02);
  for (const dy of [-pbW / 2 - 0.02, pbW / 2 + 0.02]) putBox("alu", 0.02, 0.03, pbH, -10.895, pbY + dy, F + 1.65);
  // tools: screwdrivers with coloured handles, a wrench and pliers
  for (let i = 0; i < 6; i++) {
    const ty = pbY - 0.65 + i * 0.24, hz = F + 1.78;
    putBox("plasticDark", 0.045, 0.05, 0.11, -10.87, ty, hz);
    putBox("steelParts", 0.012, 0.012, 0.16, -10.87, ty, hz - 0.13);
  }
  putBox("steelParts", 0.014, 0.05, 0.30, -10.87, pbY + 0.62, F + 1.56);
  putBox("steelParts", 0.045, 0.05, 0.10, -10.87, pbY + 0.62, F + 1.74);
  putRod("steelParts", V(-10.87, pbY - 0.10, F + 1.50), V(-10.87, pbY + 0.02, F + 1.28), 0.012, 8);
  putRod("steelParts", V(-10.87, pbY + 0.10, F + 1.50), V(-10.87, pbY - 0.02, F + 1.28), 0.012, 8);
  // shelf above the board with small bins
  putBox("tableTop", 0.26, pbW + 0.10, 0.03, -10.82, pbY, F + 2.18);
  for (let i = 0; i < 4; i++) putBox("bluePaint", 0.20, 0.30, 0.14, -10.82, pbY - 0.60 + i * 0.40, F + 2.27);
  // vice at the right end of the bench
  putBox("bluePaint", 0.20, 0.16, 0.10, -10.18, wbY + 0.78, F + wbH + 0.05);
  putBox("steelParts", 0.17, 0.07, 0.07, -10.18, wbY + 0.72, F + wbH + 0.12);
  putCyl("steelParts", 0.012, 0.30, -10.18, wbY + 0.72, F + wbH + 0.06, 0, Math.PI / 2, 0, 8);
  // drawer unit under the bench
  putBox("tableLegs", 0.52, 0.55, 0.72, -10.32, wbY - 0.30, F + 0.38);
  for (let i = 0; i < 3; i++) {
    putBox("door", 0.02, 0.48, 0.17, -10.05, wbY - 0.30, F + 0.20 + i * 0.22);
    putBox("steelParts", 0.02, 0.20, 0.015, -10.04, wbY - 0.30, F + 0.20 + i * 0.22);
  }

  // ---------------------------------------------------------------- packing table near the sectional door
  const pkX = 12.42, pkY = 1.05, pkW = 0.80, pkL = 2.00, pkH = 0.92;
  putBox("tableTop", pkW, pkL, 0.05, pkX, pkY, F + pkH);
  for (const x of [pkX - 0.32, pkX + 0.32]) for (const y of [pkY - 0.92, pkY + 0.92]) putBox("tableLegs", 0.05, 0.05, pkH - 0.05, x, y, F + (pkH - 0.05) / 2);
  for (const x of [pkX - 0.32, pkX + 0.32]) putBox("tableLegs", 0.04, pkL - 0.08, 0.05, x, pkY, F + 0.82);
  putBox("tableLegs", pkW - 0.08, pkL - 0.08, 0.03, pkX, pkY, F + 0.25);
  // scale with an LCD display
  putBox("steelParts", 0.38, 0.38, 0.06, pkX - 0.02, pkY + 0.35, F + pkH + 0.055);
  putBox("steelParts", 0.05, 0.05, 0.16, pkX - 0.24, pkY + 0.35, F + pkH + 0.10);
  putBox("darkParts", 0.10, 0.20, 0.10, pkX - 0.24, pkY + 0.35, F + pkH + 0.22);
  const scaleMat = screenMat(128, 64, (g, w, h) => {
    g.fillStyle = "#0a1a10"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#8cf0a8"; g.font = "700 30px 'IBM Plex Mono', monospace"; g.fillText("0.842", 8, 30);
    g.font = "600 16px 'IBM Plex Mono', monospace"; g.fillText("kg", 96, 48);
  }, 0.55);
  const scaleScr = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.042), scaleMat);
  scaleScr.matrix.makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));
  scaleScr.matrix.setPosition(pkX - 0.295, pkY + 0.29, F + pkH + 0.22);
  scaleScr.matrixAutoUpdate = false; scaleScr.name = "hall_scale_screen"; scaleScr.castShadow = false; root.add(scaleScr);
  // tape dispenser and a flat-carton stack
  putBox("darkParts", 0.20, 0.13, 0.10, pkX - 0.05, pkY - 0.55, F + pkH + 0.10);
  putCyl("cardboardProps", 0.055, 0.14, pkX - 0.05, pkY - 0.55, F + pkH + 0.19, Math.PI / 2, 0, 0, 16);
  putBox("cardboardProps", 0.70, 0.50, 0.02, pkX, pkY + 0.70, F + pkH + 0.035);
  putBox("cardboardProps", 0.70, 0.50, 0.02, pkX, pkY + 0.70, F + pkH + 0.06);

  // ---------------------------------------------------------------- hand pallet truck near the right aisle
  const ptX = 9.55, ptY = -3.00;
  for (const dy of [-0.18, 0.18]) {
    putBox("truckBody", 1.15, 0.16, 0.055, ptX - 0.10, ptY + dy, F + 0.075);
    putBox("truckBody", 0.05, 0.16, 0.10, ptX - 0.66, ptY + dy, F + 0.10);
  }
  putBox("truckBody", 0.10, 0.52, 0.10, ptX - 0.64, ptY, F + 0.10);
  putBox("truckBody", 0.34, 0.38, 0.34, ptX + 0.47, ptY, F + 0.20);
  putBox("steelParts", 0.16, 0.30, 0.16, ptX + 0.47, ptY, F + 0.43);
  for (const dy of [-0.15, 0.15]) putRod("steelParts", V(ptX + 0.46, ptY + dy, F + 0.44), V(ptX + 0.25, ptY + dy, F + 1.20), 0.016, 8);
  putRod("steelParts", V(ptX + 0.25, ptY - 0.15, F + 1.20), V(ptX + 0.25, ptY + 0.15, F + 1.20), 0.018, 8);
  putBox("plasticDark", 0.07, 0.10, 0.045, ptX + 0.24, ptY, F + 1.20);
  for (const [wx, wy] of [[-0.52, -0.18], [-0.52, 0.18], [0.47, -0.15], [0.47, 0.15]]) {
    putCyl("rubber", 0.085, 0.07, ptX + wx, ptY + wy, F + 0.085, 0, 0, 0, 16);
  }

  // ---------------------------------------------------------------- parked electric forklift (beacon animated)
  const fkX = 10.40, fkY = 1.55;                                 // local +y is the rear; forks face -y
  putRound("bluePaint", 1.05, 1.55, 0.50, 0.055, fkX, fkY + 0.10, F + 0.55);       // chassis
  putRound("darkParts", 1.00, 0.46, 0.60, 0.05, fkX, fkY + 0.98, F + 0.50);         // counterweight
  putRound("bluePaint", 1.02, 0.36, 0.34, 0.04, fkX, fkY - 0.42, F + 0.42);         // front cover
  for (const dx of [-0.44, 0.44]) putRound("darkParts", 0.26, 0.30, 0.10, 0.03, fkX + dx, fkY - 0.30, F + 0.36); // fenders
  putBox("plasticDark", 0.50, 0.42, 0.10, fkX, fkY + 0.16, F + 0.88);  // seat
  putBox("plasticDark", 0.42, 0.06, 0.48, fkX, fkY + 0.43, F + 1.18);  // seat back
  putRod("darkParts", V(fkX, fkY - 0.26, F + 0.88), V(fkX, fkY - 0.42, F + 1.28), 0.03, 10);
  putCyl("plasticDark", 0.10, 0.035, fkX, fkY - 0.37, F + 1.32, 0.7, 0, 0, 16);
  // overhead guard
  for (const dx of [-0.43, 0.43]) for (const dy of [-0.25, 0.55]) putBox("darkParts", 0.045, 0.045, 1.15, fkX + dx, fkY + dy, F + 1.45);
  for (const dx of [-0.45, 0.45]) putBox("darkParts", 0.045, 0.92, 0.045, fkX + dx, fkY + 0.15, F + 2.03);
  for (const dy of [-0.27, 0.57]) putBox("darkParts", 0.94, 0.045, 0.045, fkX, fkY + dy, F + 2.03);
  // mast and forks
  for (const dx of [-0.34, 0.34]) {
    putBox("steelParts", 0.07, 0.08, 2.20, fkX + dx, fkY - 0.82, F + 1.12);
    putBox("steelParts", 0.05, 0.05, 1.70, fkX + dx, fkY - 0.76, F + 1.05);
  }
  putBox("steelParts", 0.72, 0.06, 0.06, fkX, fkY - 0.82, F + 2.22);
  putBox("steelParts", 0.72, 0.06, 0.06, fkX, fkY - 0.82, F + 1.62);
  putBox("steelParts", 0.80, 0.05, 0.36, fkX, fkY - 0.78, F + 0.34);  // carriage
  for (const dx of [-0.22, 0.22]) {
    putBox("steelParts", 0.11, 1.10, 0.045, fkX + dx, fkY - 1.28, F + 0.10);
    putBox("steelParts", 0.11, 0.045, 0.55, fkX + dx, fkY - 0.82, F + 0.31);
  }
  // wheels
  for (const dx of [-0.44, 0.44]) putCyl("rubber", 0.18, 0.14, fkX + dx, fkY - 0.30, F + 0.18, 0, 0, Math.PI / 2, 18);
  putCyl("rubber", 0.15, 0.16, fkX, fkY + 0.86, F + 0.15, 0, 0, Math.PI / 2, 18);
  // beacon base; dome and rotor live in their own group so the rotor can turn
  putCyl("plasticDark", 0.048, 0.04, fkX, fkY + 0.57, F + 2.10, Math.PI / 2, 0, 0, 16);
  const beacon = new THREE.Group(); beacon.name = "hall_forklift_beacon"; beacon.position.set(fkX, fkY + 0.57, F + 2.16); root.add(beacon);
  const domeMat = phys(0xffa41c, 0.25, 0.0, { transparent: true, opacity: 0.55, emissive: 0xff8a00, emissiveIntensity: 0.7, clearcoat: 1, clearcoatRoughness: 0.15 });
  const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.095, 20), domeMat); dome.position.set(0, 0, 0.045); dome.name = "hall_beacon_dome"; beacon.add(dome);
  const rotor = new THREE.Group(); rotor.name = "hall_forklift_beacon_rotor"; beacon.add(rotor);
  const rotorMat = new THREE.MeshStandardMaterial({ color: 0xff9a00, emissive: 0xff6f00, emissiveIntensity: 3.0, roughness: 0.4 });
  const rotorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.012, 0.045), rotorMat); rotorMesh.position.set(0.015, 0, 0.045); rotor.add(rotorMesh);

  // ---------------------------------------------------------------- compressed-air ring main along the walls at 4 m
  const airZ = F + 4.0;
  putCyl("airPipe", 0.033, 13.6, -10.82, 0, airZ, 0, Math.PI / 2, 0, 14);
  putCyl("airPipe", 0.033, 23.6, 1.0, 6.82, airZ, 0, 0, Math.PI / 2, 14);
  putCyl("airPipe", 0.033, 13.4, 12.82, 0.05, airZ, 0, Math.PI / 2, 0, 14);
  for (const [x, y] of [[-10.82, 6.80], [12.82, 6.80], [12.82, -6.75], [-10.82, -6.75]]) putSphere("airPipe", 0.058, x, y, airZ, 14);
  for (let y = -6.0; y <= 6.0; y += 2.0) {
    putBox("steelParts", 0.10, 0.04, 0.10, -10.90, y, airZ);
    putBox("steelParts", 0.10, 0.04, 0.10, 12.90, y, airZ);
  }
  for (let x = -9.0; x <= 11.0; x += 2.0) putBox("steelParts", 0.04, 0.10, 0.10, x, 6.90, airZ);
  const airDrop = (x, y, nx, ny) => {
    putCyl("airPipe", 0.025, 2.05, x, y, airZ - 1.02, Math.PI / 2, 0, 0, 12);
    putSphere("airPipe", 0.042, x, y, airZ - 2.03, 12);
    putCyl("airPipe", 0.025, 0.28, x + nx * 0.14, y + ny * 0.14, airZ - 2.03, 0, 0, Math.PI / 2, 12);
    putBox("steelParts", 0.09, 0.09, 0.14, x + nx * 0.30, y + ny * 0.30, airZ - 2.03);
    putBox("redPaint", 0.15, 0.03, 0.03, x + nx * 0.30, y + ny * 0.30, airZ - 1.95);
    putCyl("steelParts", 0.02, 0.06, x + nx * 0.32, y + ny * 0.32, airZ - 2.10, 0, 0, Math.PI / 2, 10);
  };
  airDrop(-10.82, 4.30, 1, 0); airDrop(-10.82, 0.45, 1, 0); airDrop(12.82, 1.10, -1, 0);

  // ---------------------------------------------------------------- signage: hearing protection, fire points, exits, office plaque
  const signMat = (w, h, draw, glow = 0) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0 });
    if (glow) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = tex; m.emissiveIntensity = glow; }
    return m;
  };
  function screenMat(w, h, draw, glow) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: glow });
    return m;
  }
  function addSign(m, w, h, x, y, z, nx, ny, name) {
    const o = new THREE.Mesh(facadeGeo(w, h, x, y, z, nx, ny), m);
    o.name = name; o.castShadow = false; o.receiveShadow = true; root.add(o); return o;
  }
  // blue mandatory hearing-protection sign on a post outside the reserved cell zone
  const hearMat = signMat(256, 340, (g, w, h) => {
    g.fillStyle = "#f4f4f1"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1d55a0"; g.beginPath(); g.arc(128, 126, 104, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffffff"; g.beginPath(); g.arc(128, 108, 29, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(76, 196); g.quadraticCurveTo(128, 130, 180, 196); g.fill();
    g.fillStyle = "#1d55a0"; g.beginPath(); g.arc(128, 108, 16, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath(); g.ellipse(92, 110, 16, 23, -0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(164, 110, 16, 23, 0.2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#ffffff"; g.lineWidth = 9; g.beginPath(); g.arc(128, 104, 34, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.fillStyle = "#12233b"; g.font = "700 28px 'IBM Plex Sans', Arial, sans-serif"; g.textAlign = "center";
    g.fillText("HEARING", 128, 280); g.fillText("PROTECTION", 128, 312);
    g.font = "600 18px 'IBM Plex Sans', Arial, sans-serif"; g.fillStyle = "#4a5561"; g.fillText("90–100 dB(A)", 128, 334);
  });
  addSign(hearMat, 0.36, 0.48, -2.88, 1.95, F + 2.02, 0.83, -0.56, "hall_sign_hearing");
  putCyl("steelParts", 0.026, 2.20, -2.88, 1.95, F + 1.10, Math.PI / 2, 0, 0, 12);
  putBox("plinth", 0.22, 0.22, 0.03, -2.88, 1.95, F + 0.015);
  putBox("steelParts", 0.42, 0.02, 0.54, -2.89, 1.96, F + 2.02, 0, 0, 0.98);
  // exit signs
  const exitMat = signMat(512, 220, (g, w, h) => {
    g.fillStyle = "#0a7a3a"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#ffffff"; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = "#ffffff"; g.fillRect(330, 34, 96, 152);
    g.fillStyle = "#0a7a3a"; g.fillRect(348, 54, 60, 132);
    g.fillStyle = "#ffffff";
    g.beginPath(); g.arc(150, 52, 16, 0, Math.PI * 2); g.fill();
    g.lineWidth = 12; g.strokeStyle = "#ffffff"; g.lineCap = "round";
    g.beginPath(); g.moveTo(146, 70); g.lineTo(130, 112); g.lineTo(160, 142); g.lineTo(145, 178); g.stroke();
    g.beginPath(); g.moveTo(136, 96); g.lineTo(105, 120); g.stroke();
    g.beginPath(); g.moveTo(136, 96); g.lineTo(176, 105); g.stroke();
    g.beginPath(); g.moveTo(160, 142); g.lineTo(200, 154); g.stroke();
    g.beginPath(); g.moveTo(245, 110); g.lineTo(300, 110); g.stroke();
    g.beginPath(); g.moveTo(278, 90); g.lineTo(300, 110); g.lineTo(278, 130); g.stroke();
  }, 0.9);
  addSign(exitMat, 0.42, 0.18, 3.175, 6.855, F + 2.42, 0, -1, "hall_sign_exit_back");
  addSign(exitMat, 0.42, 0.18, 12.855, doorY, F + 3.92, -1, 0, "hall_sign_exit_door");
  putBox("darkParts", 0.44, 0.05, 0.22, 3.175, 6.885, F + 2.42);
  putBox("darkParts", 0.05, 0.44, 0.22, 12.885, doorY, F + 3.92);
  // fire point signs and extinguishers
  const fireMat = signMat(256, 320, (g, w, h) => {
    g.fillStyle = "#c1121c"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#ffffff"; g.lineWidth = 7; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = "#ffffff";
    g.fillRect(92, 96, 72, 128); g.beginPath(); g.arc(128, 94, 15, 0, Math.PI * 2); g.fill();
    g.fillRect(112, 56, 32, 38); g.fillRect(120, 42, 16, 18);
    g.fillRect(70, 220, 116, 12);
    g.strokeStyle = "#ffffff"; g.lineWidth = 7; g.beginPath(); g.moveTo(164, 116); g.quadraticCurveTo(196, 130, 188, 190); g.stroke();
    g.font = "700 34px 'IBM Plex Sans', Arial, sans-serif"; g.textAlign = "center"; g.fillText("FIRE", 128, 278);
  });
  const ext = (x, y, z, nx, ny) => {
    const bx = x + nx * 0.11, by = y + ny * 0.11;
    putCyl("redPaint", 0.072, 0.48, bx, by, z, Math.PI / 2, 0, 0, 18, 0.062);
    putSphere("redPaint", 0.065, bx, by, z + 0.24, 14);
    putCyl("plasticDark", 0.035, 0.05, bx, by, z + 0.29, Math.PI / 2, 0, 0, 10);
    putBox("plasticDark", 0.10, 0.07, 0.03, bx, by, z + 0.33);
    putRod("rubber", V(bx + nx * 0.02, by + ny * 0.02, z + 0.24), V(bx + nx * 0.12, by + ny * 0.12, z - 0.05), 0.012, 8);
    putBox("steelParts", 0.05, 0.05, 0.30, bx + nx * 0.05, by + ny * 0.05, z);
    addSign(fireMat, 0.26, 0.33, x, y, z + 0.62, nx, ny, "hall_sign_fire");
  };
  ext(4.10, 6.89, F + 0.68, 0, -1);
  ext(12.89, -0.55, F + 0.68, -1, 0);
  // office plaque
  const officeSignMat = signMat(512, 160, (g, w, h) => {
    g.fillStyle = "#eceee9"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#9aa0a3"; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = "#2b3034"; g.font = "700 74px 'IBM Plex Sans', Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("OFFICE 01", w / 2, h / 2);
  });
  addSign(officeSignMat, 0.52, 0.16, 12.175, oy0 - 0.07, F + 2.31, 0, -1, "hall_sign_office");
  // QC label on the left wall
  const qcSignMat = signMat(512, 160, (g, w, h) => {
    g.fillStyle = "#e9ebe7"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#8d9497"; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = "#26323a"; g.font = "700 76px 'IBM Plex Sans', Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("QUALITY CONTROL", w / 2, h / 2);
  });
  addSign(qcSignMat, 1.00, 0.31, -10.887, qcY, F + 2.28, 1, 0, "hall_sign_qc");

  // ---------------------------------------------------------------- finish: merge every bucket into one mesh per material
  const mergedPool = [];
  for (const [name, b] of Object.entries(B)) {
    if (!b.list.length) continue;
    const geos = b.list.map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) { console.warn(`hall: could not merge ${name}`); continue; }
    merged.computeBoundingSphere();
    const o = new THREE.Mesh(merged, b.mat);
    o.name = `hall_${name}`; o.castShadow = b.cast !== false; o.receiveShadow = true; root.add(o);
    mergedPool.push(o);
  }

  return { root, floor, floorMat, beacon, rotor, mergedPool };
})();
const floorMat = HALL.floorMat;
function updateHall(t) { HALL.rotor.rotation.z = t * 2.4; }
