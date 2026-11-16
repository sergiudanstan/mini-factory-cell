// ---------------------------------------------------------------- frame: machine base, guard, delta portal, stack light, HMI, cabinet
// Cell frame, metres, z up. z = 0 is the top of the machine-base plate; FLOOR = -0.82.
// Static geometry is merged per material and parent (frame root / guard group); repeated profiles are instanced.
const FRAME = (() => {
  const root = moduleRoot("frame");
  const B = LAYOUT.base, G = LAYOUT.guard, P = LAYOUT.portal, C = LAYOUT.cabinet, HM = LAYOUT.hmi;
  const ST = LAYOUT.stack, FR = LAYOUT.frl, F = LAYOUT.floor;
  const zTop = G.top, postHalf = G.post / 2, zPanel0 = F + G.gap, zPanel1 = zTop - G.post;
  const doorF = LAYOUT.doors.find((d) => d.side === "front"), doorB = LAYOUT.doors.find((d) => d.side === "back");
  const cur = LAYOUT.curtain;
  const guards = new THREE.Group(); guards.name = "guards"; root.add(guards);

  // ---------------------------------------------------------------- local materials
  const pcMat = M.pcClear.clone();
  const sealMat = M.sealBlack.clone(); sealMat.color.set(0x111111);
  pcMat.color.set(0xb7c3cc); pcMat.opacity = 0.18; pcMat.transparent = true; pcMat.depthWrite = false; pcMat.side = THREE.DoubleSide;
  const blueMat = phys(0x1f5ea6, 0.45, 0.05);
  const ledRedMat = phys(0x4a0c0c, 0.4, 0, { emissive: 0xff2020, emissiveIntensity: 1.4 });
  const ledGreenMat = phys(0x0c3a16, 0.4, 0, { emissive: 0x30ff60, emissiveIntensity: 1.0 });
  const frameLampMats = {
    red: M.lampRed.clone(), amber: M.lampAmber.clone(), green: M.lampGreen.clone(), blue: M.lampBlue.clone(),
  };
  for (const m of Object.values(frameLampMats)) m.emissiveIntensity = 0;

  // ---------------------------------------------------------------- bins: merged one mesh per material and parent
  const rootBins = new Map(), guardBins = new Map();
  const bucketNames = new Map([
    [M.ral7016, "frame_structure_steel"], [M.ral7035, "frame_sheet_panels"], [M.ground, "frame_base_plate"],
    [M.zinc9006, "frame_zinc_hardware"], [M.steel, "frame_steel_details"], [M.blackPlastic, "frame_black_details"],
    [M.blackRubber, "frame_rubber"], [sealMat, "frame_guard_seals"], [M.galv, "frame_cable_tray"],
    [M.aluClear, "frame_aluminium"], [M.aluBlasted, "frame_alu_plate"], [M.ral9005, "frame_black_paint"],
    [M.puBlue, "frame_air_tube"], [M.pcClear, "frame_glass"], [pcMat, "frame_guard_panels"], [M.estopRed, "frame_estops"],
    [M.estopYellow, "frame_estop_bases"], [M.screen, "frame_screens"], [M.lens, "frame_lenses"],
  ]);
  let binSerial = 0;
  function addBin(map, mat, geo, name) {
    if (typeof map === "function") return map(mat, geo, name);
    let b = map.get(mat);
    if (!b) {
      b = { mat, list: [], name: name || (map === guardBins ? "frame_guard_detail_" : "frame_detail_") + (binSerial++) };
      map.set(mat, b);
    }
    b.list.push(geo); return geo;
  }
  const addR = (mat, geo, name) => addBin(rootBins, mat, geo, name || bucketNames.get(mat));
  const addG = (mat, geo, name) => addBin(guardBins, mat, geo, name || (bucketNames.get(mat) ? "guard_" + bucketNames.get(mat) : undefined));

  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  function transformed(g, x, y, z, rx = 0, ry = 0, rz = 0) {
    if (rx || ry || rz) { _e.set(rx, ry, rz); _q.setFromEuler(_e); g.applyQuaternion(_q); }
    g.translate(x, y, z); return g;
  }
  function boxAt(map, mat, w, d, h, x, y, z, rx = 0, ry = 0, rz = 0, name) {
    return addBin(map, mat, transformed(new THREE.BoxGeometry(w, d, h), x, y, z, rx, ry, rz), name);
  }
  function roundAt(map, mat, w, d, h, r, x, y, z, rx = 0, ry = 0, rz = 0, name) {
    const g = new RoundedBoxGeometry(w, d, h, 3, Math.max(1e-5, Math.min(r, Math.min(w, d, h) / 2 - 1e-5)));
    return addBin(map, mat, transformed(g, x, y, z, rx, ry, rz), name);
  }
  function cylAt(map, mat, r, h, x, y, z, axis = "z", seg = 18, rTop = null, name) {
    const g = new THREE.CylinderGeometry(rTop == null ? r : rTop, r, h, seg);
    if (axis === "z") g.rotateX(Math.PI / 2);
    else if (axis === "x") g.rotateZ(Math.PI / 2);
    g.translate(x, y, z); return addBin(map, mat, g, name);
  }
  function rodAt(map, mat, a, b, r, seg = 10, name) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    if (L < 1e-7) return null;
    const g = new THREE.CylinderGeometry(r, r, L, seg);
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.multiplyScalar(1 / L));
    _m4.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(_m4);
    return addBin(map, mat, g, name);
  }
  function tubeAt(map, mat, pts, r, tub = 32, rad = 8, name) {
    const g = tubeGeo(pts, r, tub, rad);
    return addBin(map, mat, g, name);
  }
  function discAt(map, mat, r, x, y, z, seg = 16, name) {
    const g = new THREE.CircleGeometry(r, seg); g.translate(x, y, z);
    return addBin(map, mat, g, name);
  }
  function latheAt(map, mat, prof, x, y, z, seg = 32, normal = null, name) {
    const g = new THREE.LatheGeometry(prof.map(([r, q]) => new THREE.Vector2(r, q)), seg);
    g.rotateX(Math.PI / 2);
    if (normal) { _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize()); g.applyQuaternion(_q); }
    g.translate(x, y, z);
    return addBin(map, mat, g, name);
  }
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---------------------------------------------------------------- guard-profile helpers
  const profRoot = (a, b) => profileBeam(a, b, root);
  const profGuard = (a, b) => profileBeam(a, b, guards);
  const boltRoot = (p, n) => addBolt(p, n, root);
  const boltGuard = (p, n) => addBolt(p, n, guards);

  // ---------------------------------------------------------------- sign meshes (one material per label)
  function canvasTexture(w, h, draw) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  function signMesh(w, h, draw, parent, x, y, z, nx, ny, nz = 0, name = "frame_sign", glow = 0) {
    const tex = canvasTexture(512, Math.max(64, Math.round(512 * h / w)), draw);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.56, metalness: 0.02 });
    if (glow) { mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = tex; mat.emissiveIntensity = glow; }
    const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const n = V3(nx, ny, nz).normalize(), up = V3(0, 0, 1), right = new THREE.Vector3().crossVectors(up, n);
    o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
    o.position.set(x, y, z); o.name = name; o.castShadow = false; o.receiveShadow = true;
    parent.add(o); return o;
  }
  function textPlane(text, w, h, parent, x, y, z, nx, ny, nz = 0, opts = {}) {
    const { bg = "#e9e9e4", fg = "#16181a", font = "700 150px 'IBM Plex Sans', Arial, sans-serif" } = opts;
    return signMesh(w, h, (g, cw, ch) => {
      g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
      g.fillStyle = fg; g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(text, cw / 2, ch / 2);
    }, parent, x, y, z, nx, ny, nz);
  }

  // ---------------------------------------------------------------- machine base: feet, welded 80 x 80 frame, top plate, skins
  const bx0 = B.x0, bx1 = B.x1, by0 = B.y0, by1 = B.y1, bcx = (bx0 + bx1) / 2, bcy = (by0 + by1) / 2;
  const zLeg0 = F + B.foot, zLeg1 = -B.plate;
  const topRailZ0 = -0.105, topRailZ1 = -0.025, botRailZ0 = zLeg0, botRailZ1 = zLeg0 + 0.08;
  for (const lx of B.legsX) for (const ly of B.legsY) {
    cylAt(addR, M.blackRubber, 0.046, 0.012, lx, ly, F + 0.006, "z", 24);
    cylAt(addR, M.zinc9006, 0.036, 0.008, lx, ly, F + 0.017, "z", 20);
    rodAt(addR, M.steel, V3(lx, ly, F + 0.022), V3(lx, ly, zLeg0 - 0.004), 0.010, 10);
    cylAt(addR, M.zinc9006, 0.016, 0.012, lx, ly, F + 0.055, "z", 6);
    cylAt(addR, M.steel, 0.045, 0.006, lx, ly, zLeg0 - 0.003, "z", 16);
    boxAt(addR, M.ral7016, 0.08, 0.08, zLeg1 - zLeg0, lx, ly, (zLeg0 + zLeg1) / 2);
  }
  // welded top and bottom perimeter rails, plus the centre cross member
  for (const y of [by0 + 0.04, by1 - 0.04]) {
    boxAt(addR, M.ral7016, bx1 - bx0 - 0.08, 0.08, 0.08, bcx, y, (topRailZ0 + topRailZ1) / 2);
    boxAt(addR, M.ral7016, bx1 - bx0 - 0.08, 0.08, 0.08, bcx, y, (botRailZ0 + botRailZ1) / 2);
  }
  for (const x of [bx0 + 0.04, bx1 - 0.04]) {
    boxAt(addR, M.ral7016, 0.08, by1 - by0 - 0.08, 0.08, x, bcy, (topRailZ0 + topRailZ1) / 2);
    boxAt(addR, M.ral7016, 0.08, by1 - by0 - 0.08, 0.08, x, bcy, (botRailZ0 + botRailZ1) / 2);
  }
  boxAt(addR, M.ral7016, 0.08, by1 - by0 - 0.08, 0.08, -0.16, bcy, (topRailZ0 + topRailZ1) / 2);
  boxAt(addR, M.ral7016, 0.08, by1 - by0 - 0.08, 0.08, -0.16, bcy, (botRailZ0 + botRailZ1) / 2);
  // leg-head gussets
  for (const lx of B.legsX) for (const ly of B.legsY) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    boxAt(addR, M.ral7016, 0.05, 0.006, 0.05, lx + dx * 0.045, ly + dy * 0.045, zLeg1 - 0.04, 0, 0, 0);
  }
  // ground top plate and detail holes
  roundAt(addR, M.ground, bx1 - bx0, by1 - by0, B.plate, 0.0015, bcx, bcy, -B.plate / 2, 0, 0, 0, "frame_base_plate");
  const plateHole = (x, y, r = 0.0042) => discAt(addR, M.ral9005, r, x, y, 0.0008, 14, "frame_plate_holes");
  for (const x of [-0.72, -0.56, -0.40, -0.24, -0.08, 0.08, 0.24, 0.40]) { plateHole(x, -0.79); plateHole(x, 0.35); }
  for (const y of [-0.55, -0.20, 0.15]) { plateHole(-0.77, y); plateHole(0.45, y); }
  plateHole(-0.70, 0.28, 0.006); plateHole(0.36, 0.28, 0.006);
  // base skins: fixed sides/back and two front doors
  const skinZ0 = -0.64, skinZ1 = -0.11, skinH = skinZ1 - skinZ0;
  roundAt(addR, M.ral7035, 0.003, by1 - by0 - 0.10, skinH, 0.0008, bx0 - 0.0015, bcy, (skinZ0 + skinZ1) / 2);
  roundAt(addR, M.ral7035, 0.003, by1 - by0 - 0.10, skinH, 0.0008, bx1 + 0.0015, bcy, (skinZ0 + skinZ1) / 2);
  roundAt(addR, M.ral7035, bx1 - bx0 - 0.12, 0.003, skinH, 0.0008, bcx, by1 + 0.0015, (skinZ0 + skinZ1) / 2);
  // front door leaves, slightly proud of the frame
  const doorZ0 = -0.63, doorZ1 = -0.13, doorY = by0 - 0.0015;
  const doorL = [-0.738, -0.204], doorR = [-0.116, 0.418];
  for (const [x0, x1] of [doorL, doorR]) {
    roundAt(addR, M.ral7035, x1 - x0, 0.004, doorZ1 - doorZ0, 0.001, (x0 + x1) / 2, doorY, (doorZ0 + doorZ1) / 2);
    boxAt(addR, M.ral9005, x1 - x0 - 0.04, 0.001, 0.003, (x0 + x1) / 2, doorY - 0.0025, doorZ0 + 0.018);
    boxAt(addR, M.ral9005, x1 - x0 - 0.04, 0.001, 0.003, (x0 + x1) / 2, doorY - 0.0025, doorZ1 - 0.018);
  }
  // door hinges and D handles
  for (const [hx, hx2] of [[doorL[0], doorL[0] + 0.006], [doorR[1], doorR[1] - 0.006]]) {
    for (const z of [-0.55, -0.22]) {
      boxAt(addR, M.zinc9006, 0.018, 0.010, 0.055, hx2, doorY - 0.007, z);
      cylAt(addR, M.steel, 0.004, 0.074, hx, doorY - 0.010, z, "z", 10);
    }
  }
  const dHandle = (x, z, side) => {
    const y0 = doorY - 0.010;
    boxAt(addR, M.zinc9006, 0.020, 0.006, 0.026, x, y0, z + 0.045);
    boxAt(addR, M.zinc9006, 0.020, 0.006, 0.026, x, y0, z - 0.045);
    rodAt(addR, M.blackPlastic, V3(x, y0 - 0.004, z + 0.045), V3(x + side * 0.028, y0 - 0.026, z + 0.045), 0.008, 10);
    rodAt(addR, M.blackPlastic, V3(x, y0 - 0.004, z - 0.045), V3(x + side * 0.028, y0 - 0.026, z - 0.045), 0.008, 10);
    rodAt(addR, M.blackPlastic, V3(x + side * 0.028, y0 - 0.026, z + 0.045), V3(x + side * 0.028, y0 - 0.026, z - 0.045), 0.008, 10);
  };
  dHandle(-0.24, -0.35, -1); dHandle(-0.08, -0.35, 1);
  // vent grille on the left door
  const vx = -0.48, vz = -0.47;
  boxAt(addR, M.ral9005, 0.19, 0.002, 0.11, vx, doorY - 0.003, vz);
  boxAt(addR, M.zinc9006, 0.21, 0.005, 0.012, vx, doorY - 0.006, vz + 0.058);
  boxAt(addR, M.zinc9006, 0.21, 0.005, 0.012, vx, doorY - 0.006, vz - 0.058);
  for (let i = 0; i < 6; i++) boxAt(addR, M.zinc9006, 0.17, 0.005, 0.006, vx, doorY - 0.007, vz - 0.043 + i * 0.017);
  // base warning + nameplate
  textPlane("MOVING PARTS", 0.14, 0.05, root, 0.20, doorY - 0.004, -0.38, 0, -1, 0, { bg: "#e6b000", fg: "#16181a", font: "700 54px 'IBM Plex Sans', Arial, sans-serif" }).name = "frame_sign_base_warning";
  textPlane("PB-01", 0.16, 0.055, root, 0.03, doorY - 0.004, -0.23, 0, -1, 0, { bg: "#f0f0eb", fg: "#1a2024", font: "700 104px 'IBM Plex Sans', Arial, sans-serif" }).name = "frame_sign_nameplate";
  // tray shuttle skirt / pass-through lip on the left side
  boxAt(addR, M.ral7016, 0.016, 0.34, 0.10, bx0 - 0.004, TRAY.cy, 0.045);
  boxAt(addR, M.blackRubber, 0.006, 0.30, 0.016, bx0 - 0.016, TRAY.cy, 0.098);
  boxAt(addR, M.ral7016, 0.012, 0.34, 0.08, bx0 - 0.010, TRAY.cy, -0.06);
  boxAt(addR, M.blackRubber, 0.004, 0.30, 0.012, bx0 - 0.018, TRAY.cy, -0.024);
  // small cable gland on the base side
  cylAt(addR, M.zinc9006, 0.016, 0.022, bx1 + 0.006, 0.30, -0.45, "x", 12);
  tubeAt(addR, M.blackRubber, [V3(bx1 + 0.016, 0.30, -0.45), V3(bx1 + 0.05, 0.33, -0.50), V3(bx1 + 0.10, 0.40, -0.55)], 0.006, 20, 6);

  // ---------------------------------------------------------------- guard: 40 x 40 posts and rails, corner brackets, anchors
  const posts = [];
  for (const x of G.postsX) for (const y of [G.y0, G.y1]) posts.push([x, y]);
  for (const y of G.postsY.slice(1, -1)) for (const x of [G.x0, G.x1]) posts.push([x, y]);
  for (const [x, y] of posts) {
    profRoot(V3(x, y, F), V3(x, y, zTop));
    boxAt(addR, M.zinc9006, 0.12, 0.12, 0.008, x, y, F + 0.004);
    boltRoot(V3(x - 0.035, y, F + 0.009), V3(0, 0, 1));
    boltRoot(V3(x + 0.035, y, F + 0.009), V3(0, 0, 1));
    boxAt(addR, M.blackPlastic, 0.044, 0.044, 0.008, x, y, zTop + 0.004);
  }
  const bracketKeys = new Set();
  function guardBracket(x, y, z, nx, ny) {
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}|${nx}|${ny}`;
    if (bracketKeys.has(key)) return;
    bracketKeys.add(key);
    const px = x + nx * 0.024, py = y + ny * 0.024;
    // vertical plate on the post face and a short horizontal gusset under the rail
    if (nx) {
      boxAt(addR, M.zinc9006, 0.008, 0.052, 0.052, px, y, z);
      boxAt(addR, M.zinc9006, 0.008, 0.050, 0.008, px, y + 0.024, z - 0.024);
      boltRoot(V3(px + nx * 0.004, y - 0.014, z + 0.014), V3(nx, 0, 0));
      boltRoot(V3(px + nx * 0.004, y + 0.014, z - 0.014), V3(nx, 0, 0));
    } else {
      boxAt(addR, M.zinc9006, 0.052, 0.008, 0.052, x, py, z);
      boxAt(addR, M.zinc9006, 0.050, 0.008, 0.008, x + 0.024, py, z - 0.024);
      boltRoot(V3(x - 0.014, py + ny * 0.004, z + 0.014), V3(0, ny, 0));
      boltRoot(V3(x + 0.014, py + ny * 0.004, z - 0.014), V3(0, ny, 0));
    }
  }
  // top and bottom rails between the post faces, on every wall
  function wallRails(axis, fixed, posts, out) {
    const ps = posts.slice().sort((a, b) => a - b);
    for (let i = 0; i < ps.length - 1; i++) {
      const a = ps[i] + postHalf, b = ps[i + 1] - postHalf;
      if (b <= a) continue;
      for (const z of [G.top - postHalf, zPanel0 + postHalf]) {
        if (axis === "x") profRoot(V3(a, fixed, z), V3(b, fixed, z));
        else profRoot(V3(fixed, a, z), V3(fixed, b, z));
        const nx = axis === "x" ? 0 : out, ny = axis === "x" ? out : 0;
        guardBracket(ps[i], fixed, z, nx, ny);
        guardBracket(ps[i + 1], fixed, z, nx, ny);
      }
    }
  }
  wallRails("x", G.y0, G.postsX, -1);
  wallRails("x", G.y1, G.postsX, 1);
  wallRails("y", G.x0, G.postsY, -1);
  wallRails("y", G.x1, G.postsY, 1);

  // ---------------------------------------------------------------- guard PC panels and seals
  function pcPanelX(x0, x1, y, z0, z1) {
    boxAt(addG, pcMat, x1 - x0, 0.006, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2);
    sealX(x0, x1, y, z0, z1);
  }
  function pcPanelY(y0, y1, x, z0, z1) {
    boxAt(addG, pcMat, 0.006, y1 - y0, z1 - z0, x, (y0 + y1) / 2, (z0 + z1) / 2);
    sealY(y0, y1, x, z0, z1);
  }
  function sealX(x0, x1, y, z0, z1) {
    const sx = x1 - x0, zz = z0 + 0.005, yo = y + (y < 0 ? -0.004 : 0.004);
    boxAt(addG, sealMat, sx, 0.012, 0.010, (x0 + x1) / 2, yo, zz);
    boxAt(addG, sealMat, sx, 0.012, 0.010, (x0 + x1) / 2, yo, z1 - 0.005);
    boxAt(addG, sealMat, 0.010, 0.012, z1 - z0 - 0.012, x0 + 0.005, yo, (z0 + z1) / 2);
    boxAt(addG, sealMat, 0.010, 0.012, z1 - z0 - 0.012, x1 - 0.005, yo, (z0 + z1) / 2);
  }
  function sealY(y0, y1, x, z0, z1) {
    const sy = y1 - y0, xo = x + (x < 0 ? -0.004 : 0.004);
    boxAt(addG, sealMat, 0.012, sy, 0.010, xo, (y0 + y1) / 2, z0 + 0.005);
    boxAt(addG, sealMat, 0.012, sy, 0.010, xo, (y0 + y1) / 2, z1 - 0.005);
    boxAt(addG, sealMat, 0.012, 0.010, z1 - z0 - 0.012, xo, y0 + 0.005, (z0 + z1) / 2);
    boxAt(addG, sealMat, 0.012, 0.010, z1 - z0 - 0.012, xo, y1 - 0.005, (z0 + z1) / 2);
  }

  // Everything below is generated from the layout: bays are bounded by the post faces, and every
  // door / curtain / tunnel / chute void is subtracted from the PC panel rectangles in its bay.
  const wallDefs = [
    { side: "front", axis: "x", fixed: G.y0, posts: G.postsX },
    { side: "back", axis: "x", fixed: G.y1, posts: G.postsX },
    { side: "left", axis: "y", fixed: G.x0, posts: G.postsY },
    { side: "right", axis: "y", fixed: G.x1, posts: G.postsY },
  ];
  const wallOpenings = [];
  for (const d of LAYOUT.doors) wallOpenings.push({ side: d.side, u0: Math.min(d.x0, d.x1), u1: Math.max(d.x0, d.x1), z0: zPanel0, z1: zPanel1 });
  wallOpenings.push({ side: cur.side, u0: Math.min(cur.x0, cur.x1), u1: Math.max(cur.x0, cur.x1), z0: cur.z0, z1: cur.z1 });
  for (const o of LAYOUT.openings) {
    const u = o.along != null ? o.along : o.y;
    wallOpenings.push({ side: o.side, u0: u - o.w / 2, u1: u + o.w / 2, z0: o.z0, z1: o.z1 });
  }
  function buildWallPanels(wall) {
    const ps = wall.posts.slice().sort((a, b) => a - b);
    for (let i = 0; i < ps.length - 1; i++) {
      const bay0 = ps[i] + postHalf, bay1 = ps[i + 1] - postHalf;
      if (bay1 <= bay0 + 1e-6) continue;
      const cuts = new Set([bay0, bay1]);
      for (const o of wallOpenings) {
        if (o.side !== wall.side) continue;
        const a = Math.max(o.u0, bay0), b = Math.min(o.u1, bay1);
        if (b > a + 1e-6) { cuts.add(a); cuts.add(b); }
      }
      const cs = [...cuts].sort((a, b) => a - b);
      for (let j = 0; j < cs.length - 1; j++) {
        const a = cs[j], b = cs[j + 1];
        if (b - a < 1e-6) continue;
        const mid = (a + b) / 2;
        const voids = wallOpenings
          .filter((o) => o.side === wall.side && mid > o.u0 && mid < o.u1)
          .map((o) => [Math.max(o.z0, zPanel0), Math.min(o.z1, zPanel1)])
          .filter(([v0, v1]) => v1 > v0 + 1e-6)
          .sort((x, y) => x[0] - y[0]);
        let z = zPanel0;
        const ranges = [];
        for (const [v0, v1] of voids) {
          if (v0 > z + 1e-6) ranges.push([z, Math.min(v0, zPanel1)]);
          z = Math.max(z, v1);
        }
        if (z < zPanel1 - 1e-6) ranges.push([z, zPanel1]);
        for (const [r0, r1] of ranges) {
          if (r1 - r0 < 1e-4) continue;
          if (wall.axis === "x") pcPanelX(a, b, wall.fixed, r0, r1);
          else pcPanelY(a, b, wall.fixed, r0, r1);
        }
      }
    }
  }
  wallDefs.forEach(buildWallPanels);

  // ---------------------------------------------------------------- guard openings: tray tunnel and hopper chutes
  function collarX(x, yc, w, z0, z1, dir) {
    const zc = (z0 + z1) / 2, h = z1 - z0;
    boxAt(addG, M.ral7035, 0.06, w + 0.04, 0.02, x + dir * 0.03, yc, z0 - 0.01);
    boxAt(addG, M.ral7035, 0.06, w + 0.04, 0.02, x + dir * 0.03, yc, z1 + 0.01);
    boxAt(addG, M.ral7035, 0.06, 0.02, h, x + dir * 0.03, yc - w / 2 - 0.01, zc);
    boxAt(addG, M.ral7035, 0.06, 0.02, h, x + dir * 0.03, yc + w / 2 + 0.01, zc);
    boxAt(addG, M.ral7035, 0.008, w + 0.08, 0.02, x + dir * 0.006, yc, z0 - 0.005);
    boxAt(addG, M.ral7035, 0.008, w + 0.08, 0.02, x + dir * 0.006, yc, z1 + 0.005);
    boxAt(addG, M.ral7035, 0.008, 0.02, h + 0.04, x + dir * 0.006, yc - w / 2 - 0.005, zc);
    boxAt(addG, M.ral7035, 0.008, 0.02, h + 0.04, x + dir * 0.006, yc + w / 2 + 0.005, zc);
    boxAt(addG, sealMat, 0.004, w - 0.002, 0.008, x + dir * 0.008, yc, z0 + 0.004);
    boxAt(addG, sealMat, 0.004, w - 0.002, 0.008, x + dir * 0.008, yc, z1 - 0.004);
    boxAt(addG, sealMat, 0.004, 0.008, h - 0.004, x + dir * 0.008, yc - w / 2 + 0.004, zc);
    boxAt(addG, sealMat, 0.004, 0.008, h - 0.004, x + dir * 0.008, yc + w / 2 - 0.004, zc);
  }
  function collarY(y, xc, w, z0, z1, dir) {
    const zc = (z0 + z1) / 2, h = z1 - z0;
    boxAt(addG, M.ral7035, w + 0.04, 0.06, 0.02, xc, y + dir * 0.03, z0 - 0.01);
    boxAt(addG, M.ral7035, w + 0.04, 0.06, 0.02, xc, y + dir * 0.03, z1 + 0.01);
    boxAt(addG, M.ral7035, 0.02, 0.06, h, xc - w / 2 - 0.01, y + dir * 0.03, zc);
    boxAt(addG, M.ral7035, 0.02, 0.06, h, xc + w / 2 + 0.01, y + dir * 0.03, zc);
    boxAt(addG, M.ral7035, w + 0.08, 0.008, 0.02, xc, y + dir * 0.006, z0 - 0.005);
    boxAt(addG, M.ral7035, w + 0.08, 0.008, 0.02, xc, y + dir * 0.006, z1 + 0.005);
    boxAt(addG, M.ral7035, 0.02, 0.008, h + 0.04, xc - w / 2 - 0.005, y + dir * 0.006, zc);
    boxAt(addG, M.ral7035, 0.02, 0.008, h + 0.04, xc + w / 2 + 0.005, y + dir * 0.006, zc);
    boxAt(addG, sealMat, w - 0.002, 0.004, 0.008, xc, y + dir * 0.008, z0 + 0.004);
    boxAt(addG, sealMat, w - 0.002, 0.004, 0.008, xc, y + dir * 0.008, z1 - 0.004);
    boxAt(addG, sealMat, 0.008, 0.004, h - 0.004, xc - w / 2 + 0.004, y + dir * 0.008, zc);
    boxAt(addG, sealMat, 0.008, 0.004, h - 0.004, xc + w / 2 - 0.004, y + dir * 0.008, zc);
  }
  const openTray = LAYOUT.openings.find((o) => o.what === "tray shuttle tunnel");
  collarX(G.x0, openTray.y, openTray.w, openTray.z0, openTray.z1, -1);
  for (const o of LAYOUT.openings.filter((q) => q.what.startsWith("hopper chute"))) {
    if (o.side === "left") collarX(G.x0, o.along, o.w, o.z0, o.z1, -1);
    else if (o.side === "right") collarX(G.x1, o.along, o.w, o.z0, o.z1, 1);
    else collarY(G.y1, o.along, o.w, o.z0, o.z1, 1);
  }

  // ---------------------------------------------------------------- doors: front double door and back single door
  function doorLeafX(x0, x1, yLeaf, z0, z1, out, hingeAt) {
    const xL = x0 + postHalf, xR = x1 - postHalf, zB = z0 + postHalf, zT = z1 - postHalf;
    profGuard(V3(xL, yLeaf, z0), V3(xL, yLeaf, z1));
    profGuard(V3(xR, yLeaf, z0), V3(xR, yLeaf, z1));
    profGuard(V3(xL + postHalf, yLeaf, zB), V3(xR - postHalf, yLeaf, zB));
    profGuard(V3(xL + postHalf, yLeaf, zT), V3(xR - postHalf, yLeaf, zT));
    const pw = (xR - postHalf) - (xL + postHalf), ph = (zT - postHalf) - (zB + postHalf);
    const cx = (xL + xR) / 2, cz = (zB + zT) / 2;
    boxAt(addG, pcMat, pw, 0.006, ph, cx, yLeaf, cz);
    // leaf seals
    const ySeal = yLeaf + out * 0.004;
    boxAt(addG, sealMat, pw, 0.012, 0.010, cx, ySeal, cz + ph / 2 - 0.002);
    boxAt(addG, sealMat, pw, 0.012, 0.010, cx, ySeal, cz - ph / 2 + 0.002);
    boxAt(addG, sealMat, 0.010, 0.012, ph - 0.010, cx + pw / 2 - 0.002, ySeal, cz);
    boxAt(addG, sealMat, 0.010, 0.012, ph - 0.010, cx - pw / 2 + 0.002, ySeal, cz);
    const yFace = yLeaf + out * 0.032;
    // two hinges at the hinge edge
    for (const z of [z0 + 0.20, z1 - 0.20]) {
      boxAt(addG, M.zinc9006, 0.032, 0.024, 0.075, hingeAt, yFace, z);
      cylAt(addG, M.steel, 0.0045, 0.085, hingeAt, yFace + out * 0.012, z, "z", 10);
      boltGuard(V3(hingeAt, yFace + out * 0.002, z + 0.022), V3(0, out, 0));
    }
    // bow handle near the closing edge
    const hx = hingeAt < (x0 + x1) / 2 ? x1 - 0.10 : x0 + 0.10;
    const hz = 0.34, hy = yFace + out * 0.018;
    boxAt(addG, M.zinc9006, 0.016, 0.020, 0.020, hx, hy - out * 0.004, hz + 0.10);
    boxAt(addG, M.zinc9006, 0.016, 0.020, 0.020, hx, hy - out * 0.004, hz - 0.10);
    tubeAt(addG, M.blackPlastic, [V3(hx, hy - out * 0.002, hz - 0.09), V3(hx + out * 0.01, hy + out * 0.026, hz - 0.06),
      V3(hx + out * 0.01, hy + out * 0.026, hz + 0.06), V3(hx, hy - out * 0.002, hz + 0.09)], 0.010, 18, 8, "guard_door_handle");
    return { cx, cz };
  }
  // front double door: two equal leaves, hinges outboard, leaves mounted on the outside face
  const frontMid = (doorF.x0 + doorF.x1) / 2;
  doorLeafX(doorF.x0, frontMid, G.y0 - G.post, zPanel0, zPanel1, -1, doorF.x0 + G.post);
  doorLeafX(frontMid, doorF.x1, G.y0 - G.post, zPanel0, zPanel1, -1, doorF.x1 - G.post);
  // back door: one full-width leaf in the clear bay
  doorLeafX(doorB.x0, doorB.x1, G.y1 + G.post, zPanel0, zPanel1, 1, doorB.x0 + G.post);
  // guard-locking interlocks: yellow handle on the door, black locking module on the adjacent frame
  const frontLockX = doorF.x1 - G.post;
  const backLockX = doorB.x1 - G.post;
  boxAt(addG, M.estopYellow, 0.045, 0.035, 0.14, frontLockX, G.y0 - G.post - 0.032, 0.34);
  boxAt(addG, M.blackPlastic, 0.024, 0.045, 0.05, frontLockX, G.y0 - G.post - 0.052, 0.38);
  boxAt(addG, M.blackPlastic, 0.028, 0.050, 0.16, doorF.x1 + postHalf, G.y0 - G.post - 0.032, 0.34);
  boxAt(addG, ledRedMat, 0.006, 0.004, 0.008, doorF.x1 + postHalf, G.y0 - G.post - 0.058, 0.40);
  boxAt(addG, M.estopYellow, 0.045, 0.035, 0.14, backLockX, G.y1 + G.post + 0.032, 0.34);
  boxAt(addG, M.blackPlastic, 0.024, 0.045, 0.05, backLockX, G.y1 + G.post + 0.052, 0.38);
  boxAt(addG, M.blackPlastic, 0.028, 0.050, 0.16, doorB.x1 + postHalf, G.y1 + G.post + 0.032, 0.34);
  boxAt(addG, ledRedMat, 0.006, 0.004, 0.008, doorB.x1 + postHalf, G.y1 + G.post + 0.058, 0.40);
  boxAt(addG, M.zinc9006, 0.04, 0.05, 0.06, doorF.x1 + postHalf / 2, G.y0 - G.post - 0.005, 0.34);
  boxAt(addG, M.zinc9006, 0.04, 0.05, 0.06, doorB.x1 + postHalf, G.y1 + G.post - 0.015, 0.34);

  // ---------------------------------------------------------------- light curtain, reset, shelf and sign
  const curH = cur.z1 - cur.z0, curZc = (cur.z0 + cur.z1) / 2, curCx = (cur.x0 + cur.x1) / 2;
  for (const sx of [-1, 1]) {
    const x = sx < 0 ? cur.x0 - 0.025 : cur.x1 + 0.025;
    boxAt(addG, M.ral1023, 0.036, 0.045, curH + 0.05, x, G.y0 - 0.035, curZc);
    boxAt(addG, M.blackPlastic, 0.046, 0.050, 0.030, x, G.y0 - 0.035, cur.z0 - 0.015);
    boxAt(addG, M.blackPlastic, 0.046, 0.050, 0.030, x, G.y0 - 0.035, cur.z1 + 0.015);
    boxAt(addG, M.lens, 0.010, 0.008, curH - 0.05, x - sx * 0.018, G.y0 - 0.035, curZc);
    boxAt(addG, M.zinc9006, 0.050, 0.050, 0.016, x, G.y0 - 0.020, cur.z0 + 0.01);
    boxAt(addG, M.zinc9006, 0.050, 0.050, 0.016, x, G.y0 - 0.020, cur.z1 - 0.01);
    cylAt(addG, sx > 0 ? ledGreenMat : ledRedMat, 0.005, 0.010, x, G.y0 - 0.060, cur.z1 + 0.04, "y", 10);
  }
  // shelf in front of the reject bin
  boxAt(addG, M.stainlessBrushed, 0.48, 0.20, 0.012, curCx, G.y0 - 0.18, -0.12);
  boxAt(addG, M.blackRubber, 0.43, 0.15, 0.002, curCx, G.y0 - 0.18, -0.112);
  boxAt(addG, M.stainlessBrushed, 0.48, 0.012, 0.032, curCx, G.y0 - 0.285, -0.102);
  for (const sx of [-1, 1]) {
    boxAt(addG, M.zinc9006, 0.025, 0.18, 0.050, curCx + sx * 0.18, G.y0 - 0.19, -0.155);
    boxAt(addG, M.zinc9006, 0.025, 0.025, 0.13, curCx + sx * 0.18, G.y0 - 0.115, -0.215);
    boxAt(addG, M.zinc9006, 0.025, 0.025, 0.52, curCx + sx * 0.18, G.y0 - 0.155, -0.39);
    boxAt(addG, M.zinc9006, 0.06, 0.06, 0.010, curCx + sx * 0.18, G.y0 - 0.155, -0.655);
  }
  // blue reset button on a small bracket beside the curtain
  boxAt(addG, M.ral7035, 0.08, 0.05, 0.12, cur.x1 + 0.12, G.y0 - 0.035, cur.z1 + 0.05);
  cylAt(addG, M.blackPlastic, 0.018, 0.020, cur.x1 + 0.12, G.y0 - 0.072, cur.z1 + 0.05, "y", 18);
  cylAt(addG, blueMat, 0.013, 0.018, cur.x1 + 0.12, G.y0 - 0.087, cur.z1 + 0.05, "y", 18);
  textPlane("RESET", 0.060, 0.024, guards, cur.x1 + 0.12, G.y0 - 0.090, cur.z1 - 0.025, 0, -1, 0, { bg: "#f4f4ef", fg: "#1d55a0", font: "700 96px 'IBM Plex Sans', Arial, sans-serif" });
  signMesh(0.30, 0.11, (g, w, h) => {
    g.fillStyle = "#e6b000"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#16181a"; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    // light-curtain pictogram: two posts with three horizontal beams, clear of the text block
    g.fillStyle = "#16181a";
    g.fillRect(22, 28, 12, 88); g.fillRect(78, 28, 12, 88);
    for (let i = 0; i < 3; i++) g.fillRect(40, 46 + i * 22, 32, 6);
    g.font = "700 38px 'IBM Plex Sans', Arial, sans-serif"; g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.fillText("SAFETY LIGHT", 110, 62);
    g.fillText("CURTAIN", 110, 112);
  }, guards, curCx, G.y0 - 0.006, cur.z1 + 0.11, 0, -1, 0, "frame_sign_light_curtain");

  // ---------------------------------------------------------------- delta portal: four posts, beams, plate, knee braces
  const portalPlateY = P.plate.y, portalPlateZ0 = P.plate.z0, portalPlateZ1 = P.plate.z1;
  for (const [x, y] of P.posts) {
    roundAt(addR, M.ral7016, P.post, P.post, P.z1 - F, 0.003, x, y, (P.z1 + F) / 2);
    boxAt(addR, M.zinc9006, 0.22, 0.22, 0.015, x, y, F + 0.0075);
    for (const dx of [-0.075, 0.075]) for (const dy of [-0.075, 0.075]) boltRoot(V3(x + dx, y + dy, F + 0.016), V3(0, 0, 1));
    boxAt(addR, M.ral7016, 0.16, 0.16, 0.025, x, y, F + 0.028);
  }
  for (const y of P.beamY) {
    roundAt(addR, M.ral7016, 1.90 + P.post, P.beam[0], P.z1 - P.z0, 0.003, 0, y, (P.z0 + P.z1) / 2);
    for (const x of [-0.95, 0.95]) {
      for (const dz of [0.035, -0.035]) boltRoot(V3(x, y + 0.041, (P.z0 + P.z1) / 2 + dz), V3(0, 1, 0));
    }
  }
  for (const x of P.crossX) {
    roundAt(addR, M.ral7016, P.beam[0], P.beamY[1] - P.beamY[0], P.z1 - P.z0, 0.003, x, (P.beamY[0] + P.beamY[1]) / 2, (P.z0 + P.z1) / 2);
    for (const y of P.beamY) boltRoot(V3(x, y, (P.z0 + P.z1) / 2 + 0.04), V3(0, 0, 1));
  }
  roundAt(addR, M.aluBlasted, P.plate.w, P.plate.d, P.plate.z1 - P.plate.z0, 0.002, P.plate.x, P.plate.y, (P.plate.z0 + P.plate.z1) / 2, 0, 0, 0, "frame_delta_mount_plate");
  for (const dx of [-0.22, 0.22]) for (const dy of [-0.22, 0.22]) boltRoot(V3(P.plate.x + dx, P.plate.y + dy, P.plate.z1 + 0.001), V3(0, 0, 1));
  // knee braces at the four portal corners
  for (const [x, y] of P.posts) {
    const sx = Math.sign(x) || 1;
    rodAt(addR, M.ral7016, V3(x - sx * 0.04, y, P.z0 - 0.15), V3(x - sx * 0.18, y, P.z0 - 0.005), 0.025, 8);
    rboxPortalRib(x, y, sx);
  }
  function rboxPortalRib(x, y, sx) {
    boxAt(addR, M.ral7016, 0.12, 0.05, 0.012, x - sx * 0.12, y, P.z0 - 0.08, 0, 0, sx * 0.55);
  }
  signMesh(0.32, 0.10, (g, w, h) => {
    g.fillStyle = "#e6b000"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#16181a"; g.lineWidth = 9; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = "#16181a"; g.beginPath(); g.moveTo(42, 82); g.lineTo(62, 22); g.lineTo(82, 82); g.closePath(); g.fill();
    g.fillStyle = "#e6b000"; g.font = "700 42px 'IBM Plex Sans', Arial, sans-serif"; g.fillText("!", 55, 70);
    g.fillStyle = "#16181a"; g.font = "700 42px 'IBM Plex Sans', Arial, sans-serif"; g.fillText("OVERHEAD ROBOT", 102, 58);
    g.font = "600 30px 'IBM Plex Sans', Arial, sans-serif"; g.fillText("DELTA CELL · KEEP CLEAR", 102, 98);
  }, root, 0, P.beamY[0] - 0.043, 1.415, 0, -1, 0, "frame_sign_portal");

  // ---------------------------------------------------------------- tower light on the front-right post
  const stackBaseZ = zTop + 0.012;
  boxAt(addR, M.zinc9006, 0.11, 0.11, 0.010, ST.x, ST.y, zTop + 0.005);
  rodAt(addR, M.blackPlastic, V3(ST.x, ST.y, stackBaseZ), V3(ST.x, ST.y, stackBaseZ + 0.15), 0.012, 12);
  cylAt(addR, M.blackPlastic, 0.030, 0.020, ST.x, ST.y, stackBaseZ + 0.16, "z", 20);
  const stackZ0 = stackBaseZ + 0.175, tierH = 0.050;
  const tierOrder = ST.tiers.slice().reverse();
  for (let i = 0; i < 4; i++) {
    const z = stackZ0 + i * (tierH + 0.006);
    const m = frameLampMats[tierOrder[i]];
    latheAt(addR, m, [[0, 0], [0.029, 0], [0.031, 0.003], [0.031, tierH - 0.003], [0.029, tierH], [0, tierH]], ST.x, ST.y, z, 28, null, `frame_stack_${tierOrder[i]}`);
    if (i < 3) cylAt(addR, M.blackPlastic, 0.032, 0.006, ST.x, ST.y, z + tierH + 0.003, "z", 20);
  }
  cylAt(addR, M.blackPlastic, 0.032, 0.024, ST.x, ST.y, stackZ0 + 4 * (tierH + 0.006), "z", 20);
  cylAt(addR, M.blackPlastic, 0.018, 0.016, ST.x, ST.y, stackZ0 + 4 * (tierH + 0.006) + 0.018, "z", 16);

  // ---------------------------------------------------------------- HMI on the front-left post
  const hmiGroup = new THREE.Group(); hmiGroup.name = "frame_hmi"; hmiGroup.position.set(HM.x - 0.15, HM.y - 0.30, HM.z);
  hmiGroup.rotation.set(-0.12, 0, 0.22); root.add(hmiGroup);
  rbox(0.42, 0.060, 0.32, 0.012, M.t3Dark, 0, 0, 0, hmiGroup);
  // screen canvas 512 x 384
  const hc = document.createElement("canvas"); hc.width = 512; hc.height = 384;
  const hctx = hc.getContext("2d"); hctx.fillStyle = "#12161b"; hctx.fillRect(0, 0, 512, 384);
  const ht = new THREE.CanvasTexture(hc); ht.colorSpace = THREE.SRGBColorSpace; ht.anisotropy = 4;
  const hmiMat = new THREE.MeshStandardMaterial({ map: ht, emissive: 0xffffff, emissiveMap: ht, emissiveIntensity: 0.32, roughness: 0.4 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.24), hmiMat);
  screen.name = "frame_hmi_screen"; screen.rotation.x = Math.PI / 2; screen.position.set(0, -0.036, 0.0);
  screen.castShadow = false; screen.receiveShadow = true; hmiGroup.add(screen);
  // screen bezel / lower button strip
  box(0.36, 0.006, 0.28, M.t3Dark, 0, -0.031, 0, hmiGroup);
  box(0.34, 0.075, 0.10, M.t3Dark, 0, -0.030, -0.205, hmiGroup);
  // E-stop, green start and white reset under the screen
  const hmiMush = (x, z) => {
    const eg = new THREE.Group(); eg.position.set(x, -0.060, z);
    eg.quaternion.setFromUnitVectors(V3(0, 0, 1), V3(0, -1, 0)); hmiGroup.add(eg);
    lathe([[0, 0], [0.038, 0], [0.040, 0.003], [0.040, 0.010], [0, 0.010]], M.estopYellow, eg, 22).name = "frame_hmi_estop_base";
    lathe([[0, 0], [0.029, 0], [0.030, 0.004], [0.030, 0.012], [0, 0.012]], M.blackPlastic, eg, 22).name = "frame_hmi_estop_collar";
    lathe([[0, 0], [0.034, 0], [0.036, 0.005], [0.032, 0.014], [0.020, 0.021], [0, 0.023]], M.estopRed, eg, 22).name = "frame_hmi_estop";
  };
  hmiMush(-0.13, -0.205);
  const hmiButton = (x, mat, name) => {
    const o = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.018, 20), mat, hmiGroup);
    o.position.set(x, -0.070, -0.205); o.name = name;
  };
  hmiButton(0.02, M.lampGreen, "frame_hmi_start");
  hmiButton(0.09, M.whitePOM, "frame_hmi_reset");
  // swing arm from the post clamp
  const clampP = V3(HM.x - 0.01, HM.y - 0.02, 0.98), elbow = V3(HM.x - 0.15, HM.y - 0.20, 0.90), back = V3(HM.x - 0.21, HM.y - 0.32, 0.77);
  boxAt(addR, M.zinc9006, 0.072, 0.072, 0.045, HM.x - 0.01, HM.y, 0.98, 0, 0, 0, "frame_hmi_clamp");
  for (const p of [clampP, elbow, back]) {
    const s = new THREE.SphereGeometry(0.026, 16, 10); s.translate(p.x, p.y, p.z); addBin(rootBins, M.zinc9006, s, "frame_hmi_knuckles");
  }
  rodAt(addR, M.aluBlasted, clampP, elbow, 0.019, 12, "frame_hmi_arm");
  rodAt(addR, M.aluBlasted, elbow, back, 0.016, 12, "frame_hmi_arm");
  tubeAt(addR, M.blackRubber, [V3(HM.x - 0.01, HM.y - 0.02, 0.96), V3(HM.x - 0.11, HM.y - 0.14, 0.86), V3(HM.x - 0.18, HM.y - 0.25, 0.72)], 0.005, 20, 6, "frame_hmi_cable");

  // ---------------------------------------------------------------- E-stops on the guard and cabinet
  function eStop(x, y, z, nx, ny) {
    const n = V3(nx, ny, 0);
    latheAt(addR, M.estopYellow, [[0, 0], [0.042, 0], [0.045, 0.004], [0.045, 0.012], [0, 0.012]], x, y, z, 24, n, "frame_estop_plates");
    latheAt(addR, M.blackPlastic, [[0, 0], [0.030, 0], [0.031, 0.004], [0.031, 0.012], [0, 0.012]], x + nx * 0.012, y + ny * 0.012, z, 24, n, "frame_estop_collars");
    latheAt(addR, M.estopRed, [[0, 0], [0.035, 0], [0.037, 0.005], [0.033, 0.015], [0.021, 0.022], [0, 0.024]], x + nx * 0.018, y + ny * 0.018, z, 24, n, "frame_estops");
  }
  eStop(doorF.x1, G.y0 - postHalf - 0.004, 0.55, 0, -1);
  const backEStopX = G.postsX.reduce((best, x) => (Math.abs(x - doorB.x0) < Math.abs(best - doorB.x0) ? x : best), G.postsX[0]);
  eStop(backEStopX, G.y1 + postHalf + 0.004, 0.55, 0, 1);
  eStop(2.06, C.y - C.d / 2 - 0.007, 0.92, 0, -1);

  // ---------------------------------------------------------------- electrical cabinet (Rittal TS8 style)
  const cabX = C.x, cabY = C.y, cabZ0 = F + C.plinth, cabZ1 = cabZ0 + C.h;
  roundAt(addR, M.ral7035, C.w, C.d, C.h, 0.004, cabX, cabY, (cabZ0 + cabZ1) / 2, 0, 0, 0, "frame_cabinet_body");
  roundAt(addR, M.ral9005, C.w - 0.06, C.d - 0.06, C.plinth, 0.003, cabX, cabY, F + C.plinth / 2, 0, 0, 0, "frame_cabinet_plinth");
  // door, hinges, handle, warning pocket
  const cabFront = cabY - C.d / 2 - 0.001;
  boxAt(addR, M.ral9005, C.w - 0.035, 0.006, C.h - 0.035, cabX, cabFront + 0.004, (cabZ0 + cabZ1) / 2);
  roundAt(addR, M.ral7035, C.w - 0.05, 0.012, C.h - 0.05, 0.002, cabX, cabFront, (cabZ0 + cabZ1) / 2, 0, 0, 0, "frame_cabinet_door");
  for (const dz of [-0.55, 0.45]) {
    boxAt(addR, M.zinc9006, 0.018, 0.018, 0.075, cabX - C.w / 2 + 0.035, cabFront - 0.008, (cabZ0 + cabZ1) / 2 + dz);
    cylAt(addR, M.steel, 0.004, 0.080, cabX - C.w / 2 + 0.028, cabFront - 0.010, (cabZ0 + cabZ1) / 2 + dz, "z", 10);
  }
  roundAt(addR, M.blackPlastic, 0.030, 0.020, 0.16, 0.004, cabX + C.w / 2 - 0.09, cabFront - 0.012, 0.52);
  cylAt(addR, M.zinc9006, 0.013, 0.012, cabX + C.w / 2 - 0.09, cabFront - 0.026, 0.52, "y", 14);
  boxAt(addR, M.ral9005, 0.28, 0.004, 0.22, cabX + 0.08, cabFront - 0.014, 1.08);
  signMesh(0.14, 0.18, (g, w, h) => {
    g.fillStyle = "#e6b000"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#16181a"; g.lineWidth = 8; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = "#16181a"; g.beginPath(); g.moveTo(w / 2, h * 0.10); g.lineTo(w * 0.72, h * 0.40); g.lineTo(w * 0.28, h * 0.40); g.closePath(); g.fill();
    g.fillStyle = "#e6b000"; g.font = "700 64px 'IBM Plex Sans', Arial, sans-serif"; g.textAlign = "center"; g.fillText("!", w / 2, h * 0.37);
    g.fillStyle = "#16181a"; g.font = "700 48px 'IBM Plex Sans', Arial, sans-serif"; g.fillText("ELECTRICAL", w / 2, h * 0.56);
    g.font = "600 42px 'IBM Plex Sans', Arial, sans-serif"; g.fillText("HAZARD", w / 2, h * 0.68);
    g.font = "600 30px 'IBM Plex Sans', Arial, sans-serif"; g.fillText("400 V", w / 2, h * 0.82);
  }, root, cabX + 0.08, cabFront - 0.016, 1.08, 0, -1, 0, "frame_sign_cabinet");
  textPlane("CONTROL", 0.18, 0.045, root, cabX - 0.12, cabFront - 0.016, 1.19, 0, -1, 0, { bg: "#f0f0eb", fg: "#1a2024", font: "700 84px 'IBM Plex Sans', Arial, sans-serif" }).name = "frame_sign_control";
  // top gland plate and cable entry
  boxAt(addR, M.t3Dark, 0.42, 0.30, 0.015, cabX, cabY, cabZ1 + 0.0075, 0, 0, 0, "frame_cabinet_gland_plate");
  for (const dx of [-0.10, 0, 0.10]) {
    cylAt(addR, M.zinc9006, 0.016, 0.030, cabX + dx, cabY - 0.02, cabZ1 + 0.025, "z", 14);
    cylAt(addR, M.blackRubber, 0.012, 0.028, cabX + dx, cabY - 0.02, cabZ1 + 0.040, "z", 12);
  }
  // side cooling unit on +x with fan grille
  boxAt(addR, M.ral7035, 0.13, 0.38, 0.55, cabX + C.w / 2 + 0.065, cabY, 0.58, 0, 0, 0, "frame_cabinet_cooler");
  cylAt(addR, M.ral9005, 0.11, 0.016, cabX + C.w / 2 + 0.135, cabY, 0.58, "x", 24);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    boxAt(addR, M.zinc9006, 0.006, 0.020, 0.070, cabX + C.w / 2 + 0.144, cabY + Math.sin(a) * 0.07, 0.58 + Math.cos(a) * 0.07, 0, 0, 0);
  }
  // cabinet main switch and E-stop plate (E-stop added above)
  boxAt(addR, M.estopYellow, 0.10, 0.020, 0.12, cabX - 0.20, cabFront - 0.012, 0.95);
  boxAt(addR, M.blackPlastic, 0.025, 0.026, 0.080, cabX - 0.20, cabFront - 0.026, 0.95);
  // cabinet anchor feet
  for (const dx of [-0.30, 0.30]) for (const dy of [-0.17, 0.17]) {
    boxAt(addR, M.ral9005, 0.07, 0.05, 0.03, cabX + dx, cabY + dy, F + 0.015);
    boltRoot(V3(cabX + dx, cabY + dy, F + 0.031), V3(0, 0, 1));
  }
  // document pocket on the door
  boxAt(addR, M.pcClear, 0.20, 0.004, 0.26, cabX + 0.08, cabFront - 0.020, 0.62);
  boxAt(addR, M.whitePOM, 0.16, 0.002, 0.22, cabX + 0.08, cabFront - 0.018, 0.62);

  // ---------------------------------------------------------------- FRL on the right guard, with blue PU tubing
  const frlX = FR.x, frlY = FR.y, frlZ = FR.z;
  boxAt(addR, M.ral7035, 0.045, 0.045, 0.85, G.x1 + 0.025, frlY, -0.225);
  boxAt(addR, M.zinc9006, 0.095, 0.095, 0.012, G.x1 + 0.025, frlY, F + 0.16);
  boxAt(addR, M.zinc9006, 0.04, 0.10, 0.26, G.x1 + 0.02, frlY, frlZ, 0, 0, 0, "frame_frl_bracket");
  boxAt(addR, M.ral7035, 0.16, 0.07, 0.06, G.x1 + 0.02, frlY, frlZ + 0.16);
  rodAt(addR, M.steel, V3(G.x1 + 0.02, frlY, frlZ + 0.19), V3(frlX, frlY, frlZ + 0.19), 0.010, 10);
  // filter/regulator body
  cylAt(addR, M.ral7035, 0.036, 0.16, frlX, frlY, frlZ + 0.06, "z", 24);
  cylAt(addR, M.pcClear, 0.032, 0.09, frlX, frlY, frlZ - 0.045, "z", 24);
  cylAt(addR, M.zinc9006, 0.038, 0.010, frlX, frlY, frlZ - 0.093, "z", 24);
  cylAt(addR, M.ral9005, 0.026, 0.020, frlX, frlY, frlZ + 0.155, "z", 20);
  cylAt(addR, M.blackPlastic, 0.026, 0.024, frlX, frlY, frlZ + 0.176, "z", 20);
  // gauge facing the operator (-y)
  cylAt(addR, M.zinc9006, 0.039, 0.014, frlX, frlY - 0.046, frlZ + 0.12, "y", 24);
  const gaugeTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#f5f5ef"; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#2a2e32"; g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 116, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = "#2a2e32"; g.lineWidth = 5;
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI * 0.75 + i * Math.PI * 1.5 / 12;
      g.beginPath(); g.moveTo(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92);
      g.lineTo(128 + Math.cos(a) * 106, 128 + Math.sin(a) * 106); g.stroke();
    }
    g.strokeStyle = "#c1121c"; g.lineWidth = 8; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(1.0) * 78, 128 + Math.sin(1.0) * 78); g.stroke();
    g.fillStyle = "#2a2e32"; g.beginPath(); g.arc(128, 128, 10, 0, Math.PI * 2); g.fill();
    g.font = "700 22px 'IBM Plex Sans', Arial, sans-serif"; g.fillStyle = "#2a2e32"; g.fillText("bar", 128, 210);
  });
  const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.033, 24), new THREE.MeshStandardMaterial({ map: gaugeTex, roughness: 0.5 }));
  gauge.position.set(frlX, frlY - 0.054, frlZ + 0.12);
  gauge.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(1, 0, 0), V3(0, 0, 1), V3(0, -1, 0)));
  gauge.name = "frame_frl_gauge"; gauge.castShadow = false; root.add(gauge);
  // lockable shut-off lever and soft-start
  boxAt(addR, M.ral9005, 0.08, 0.055, 0.055, frlX, frlY - 0.055, frlZ + 0.205);
  boxAt(addR, M.estopRed, 0.16, 0.012, 0.020, frlX, frlY - 0.055, frlZ + 0.235, 0, 0, 0.55);
  boxAt(addR, M.estopYellow, 0.06, 0.012, 0.04, frlX, frlY - 0.055, frlZ + 0.235);
  // soft-start valve downstream of the FRL
  boxAt(addR, M.ral7035, 0.060, 0.055, 0.065, frlX, frlY + 0.015, frlZ - 0.115);
  cylAt(addR, M.blackPlastic, 0.017, 0.025, frlX + 0.042, frlY + 0.015, frlZ - 0.115, "x", 16);
  boxAt(addR, M.ral9005, 0.018, 0.022, 0.022, frlX + 0.058, frlY + 0.015, frlZ - 0.115);
  // blue PU supply/return under the guard bottom and into the base
  tubeAt(addR, M.puBlue, [V3(frlX, frlY, frlZ - 0.11), V3(frlX, frlY, F + 0.10),
    V3(frlX - 0.12, frlY - 0.05, F + 0.06), V3(1.20, -0.50, F + 0.045), V3(0.74, -0.54, F + 0.035),
    V3(bx1 + 0.10, -0.52, F + 0.05), V3(bx1 - 0.02, -0.52, F + 0.13)], 0.008, 64, 8, "frame_air_tubes");
  tubeAt(addR, M.blackRubber, [V3(frlX + 0.04, frlY, frlZ - 0.08), V3(frlX + 0.04, frlY, F + 0.08),
    V3(1.18, -0.43, F + 0.035), V3(0.74, -0.47, F + 0.028), V3(bx1 + 0.06, -0.45, F + 0.04)], 0.006, 48, 8, "frame_frl_hose");
  for (const y of [-0.56, -0.54]) cylAt(addR, M.zinc9006, 0.010, 0.010, bx1 + 0.002, y, F + 0.13, "x", 10);

  // ---------------------------------------------------------------- cable tray from the cabinet to the portal and the base
  const trayZ = 1.30;
  function trayX(x0, x1, y, z) {
    const L = x1 - x0, cx = (x0 + x1) / 2;
    boxAt(addR, M.galv, L, 0.006, 0.006, cx, y - 0.082, z);
    boxAt(addR, M.galv, L, 0.006, 0.006, cx, y + 0.082, z);
    for (let x = x0 + 0.04; x < x1; x += 0.10) boxAt(addR, M.galv, 0.008, 0.16, 0.005, x, y, z);
    boxAt(addR, M.galv, 0.006, 0.006, 0.030, x0, y - 0.082, z + 0.018);
    boxAt(addR, M.galv, 0.006, 0.006, 0.030, x1, y - 0.082, z + 0.018);
    boxAt(addR, M.galv, 0.006, 0.006, 0.030, x0, y + 0.082, z + 0.018);
    boxAt(addR, M.galv, 0.006, 0.006, 0.030, x1, y + 0.082, z + 0.018);
  }
  function trayY(y0, y1, x, z) {
    const L = y1 - y0, cy = (y0 + y1) / 2;
    boxAt(addR, M.galv, 0.006, L, 0.006, x - 0.082, cy, z);
    boxAt(addR, M.galv, 0.006, L, 0.006, x + 0.082, cy, z);
    for (let y = y0 + 0.04; y < y1; y += 0.10) boxAt(addR, M.galv, 0.16, 0.008, 0.005, x, y, z);
    boxAt(addR, M.galv, 0.006, 0.006, 0.030, x - 0.082, y0, z + 0.018);
    boxAt(addR, M.galv, 0.006, 0.006, 0.030, x - 0.082, y1, z + 0.018);
    boxAt(addR, M.galv, 0.006, 0.006, 0.030, x + 0.082, y0, z + 0.018);
    boxAt(addR, M.galv, 0.006, 0.006, 0.030, x + 0.082, y1, z + 0.018);
  }
  trayX(1.70, 1.35, 1.62, trayZ);
  trayY(1.62, 1.25, 1.35, trayZ);
  trayX(1.35, 1.09, 1.25, trayZ);
  // vertical tray beside the portal post
  boxAt(addR, M.galv, 0.006, 0.006, 1.30 - 0.55, 1.09 - 0.082, 1.25, (trayZ + 0.55) / 2);
  boxAt(addR, M.galv, 0.006, 0.006, 1.30 - 0.55, 1.09 + 0.082, 1.25, (trayZ + 0.55) / 2);
  for (let z = 0.60; z < 1.29; z += 0.10) boxAt(addR, M.galv, 0.16, 0.008, 0.005, 1.09, 1.25, z);
  // tray supports
  for (const [x, y, z] of [[1.70, 1.62, 1.28], [1.35, 1.62, 1.28], [1.35, 1.25, 1.28], [1.09, 1.25, 1.20], [1.09, 1.25, 0.90]]) {
    boxAt(addR, M.zinc9006, 0.03, 0.03, 0.06, x, y, z - 0.03);
  }
  // cable bundles: cabinet -> tray -> down -> base gland
  const cablePts = (dx, dy) => [V3(cabX - 0.08, cabY - 0.02, cabZ1 + 0.04), V3(1.65 + dx, 1.60 + dy, trayZ + 0.02),
    V3(1.35 + dx, 1.58 + dy, trayZ + 0.02), V3(1.35 + dx, 1.25 + dy, trayZ + 0.02), V3(1.09 + dx, 1.25 + dy, trayZ + 0.02),
    V3(1.09 + dx, 1.25 + dy, 0.56), V3(0.82 + dx, 0.90 + dy, 0.40), V3(0.54 + dx, 0.43 + dy, 0.06), V3(0.46, 0.38, 0.035)];
  for (let i = 0; i < 4; i++) {
    const dx = (i - 1.5) * 0.018, dy = (i % 2 ? 0.012 : -0.012);
    tubeAt(addR, i === 3 ? M.puBlue : M.blackRubber, cablePts(dx, dy), 0.0045, 90, 8, "frame_cable_bundle");
  }
  // cable ties on the tray
  for (let x = 1.38; x < 1.68; x += 0.12) boxAt(addR, M.blackPlastic, 0.012, 0.190, 0.012, x, 1.62, trayZ + 0.012);
  // base cable gland plate
  boxAt(addR, M.zinc9006, 0.12, 0.12, 0.008, 0.46, 0.38, 0.004);
  for (const [x, y] of [[0.43, 0.38], [0.49, 0.38], [0.46, 0.34]]) cylAt(addR, M.blackRubber, 0.010, 0.022, x, y, 0.018, "z", 10);

  // ---------------------------------------------------------------- merge all bins into one mesh per material and parent
  function finishBins(map, parent, prefix) {
    for (const b of map.values()) {
      if (!b.list.length) continue;
      const geos = b.list.map((g) => (g.index ? g.toNonIndexed() : g));
      const merged = BufferGeometryUtils.mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) { console.warn("frame: merge failed", prefix, b.name); continue; }
      merged.computeBoundingSphere();
      const o = new THREE.Mesh(merged, b.mat);
      o.name = prefix + b.name; o.castShadow = !b.mat.transparent; o.receiveShadow = !b.mat.transparent; parent.add(o);
    }
  }
  finishBins(rootBins, root, "");
  finishBins(guardBins, guards, "");
  // name the instanced profile/bolt pools
  const rp = extraProfiles.get(root); if (rp) rp.name = "frame_profiles";
  const gp = extraProfiles.get(guards); if (gp) gp.name = "frame_guard_door_profiles";
  const rb = extraBolts.get(root); if (rb) rb.name = "frame_bolts";
  const gb = extraBolts.get(guards); if (gb) gb.name = "frame_guard_bolts";

  return { root, guards, lamps: frameLampMats, hmiScreen: { canvas: hc, texture: ht } };
})();
const hmiScreen = FRAME.hmiScreen;
function setGuards(on) { FRAME.guards.visible = !!on; }
let frameStack = "";
function setStack(state) {
  if (state === frameStack) return;
  frameStack = state;
  const L = FRAME.lamps;
  L.red.emissiveIntensity = state === "alarm" ? 1.6 : 0;
  L.amber.emissiveIntensity = state === "hold" ? 1.6 : 0;
  L.green.emissiveIntensity = state === "run" ? 1.6 : 0;
  L.blue.emissiveIntensity = state === "call" ? 1.6 : 0;
}
