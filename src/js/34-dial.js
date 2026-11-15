// ---------------------------------------------------------------- dial: indexer, dial plate + nests, centre column, star plate, S4-S6, S8
// Contract, fixed: DIALM.root (module "dial"); updateDial(t) drives
//   - the dial plate + 8 nests from dialAngle(t) (group DIALM.plate rotates about the dial centre),
//   - the S4 press ram from pressState(t).z (tool face z), the S5 ring flash from visionState(t).flash,
//   - the S6 reject unit from rejectState(t) / rejectTCP(), the S8 sensor LED.
// Geometry follows TOOL / PZ / TOOL.rej in the logic (the clearance capsules are built from the same numbers).
const DIALM = (() => {
  const root = moduleRoot("dial");
  const I = LAYOUT.indexer, S4 = st(4), S5 = st(5), S6 = st(6), S8 = st(8);
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- merged geometry helpers
  function dialPrep(g) {
    const c = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(c.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") c.deleteAttribute(k);
    if (!c.attributes.normal) c.computeVertexNormals();
    if (!c.attributes.uv) c.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
    return c;
  }
  function dialMerge(list) {
    const prepped = list.map(dialPrep);
    return prepped.length === 1 ? prepped[0] : BufferGeometryUtils.mergeGeometries(prepped, false);
  }
  function dialStore(parent) { return { parent, maps: new Map() }; }
  function dialAdd(st, mat, g, x = 0, y = 0, z = 0, rz = 0, ry = 0, rx = 0) {
    if (rx || ry || rz) {
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, "XYZ"));
      m.setPosition(x, y, z); g.applyMatrix4(m);
    } else g.translate(x, y, z);
    let list = st.maps.get(mat);
    if (!list) st.maps.set(mat, (list = []));
    list.push(g);
  }
  function dialFlush(st) {
    for (const [mat, list] of st.maps) mesh(dialMerge(list), mat, st.parent);
  }
  // Lathe geometry about z, profile points bottom -> top (or a closed loop, counter-clockwise in r/z).
  function dialLatheGeo(prof, seg = 48) {
    const g = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), seg);
    g.rotateX(Math.PI / 2); return g;
  }
  function dialCylZ(r, h, seg = 32) { const g = new THREE.CylinderGeometry(r, r, h, seg); g.rotateX(Math.PI / 2); return g; }
  function dialCylX(r, h, seg = 32) { const g = new THREE.CylinderGeometry(r, r, h, seg); g.rotateZ(Math.PI / 2); return g; }
  function dialCylY(r, h, seg = 32) { return new THREE.CylinderGeometry(r, r, h, seg); }
  // Rounded rectangular solid. RoundedBoxGeometry is (w, y, z) before our cell-frame convention w/x, d/y, h/z.
  function dialBoxGeo(w, d, h, r = 0.003) {
    const rr = Math.max(1e-5, Math.min(r, Math.min(w, d, h) / 2 - 1e-5));
    return new RoundedBoxGeometry(w, d, h, 3, rr);
  }
  function dialRingGeo(ro, ri, z0, z1, seg = 48) {
    return dialLatheGeo([[ri, z0], [ro, z0], [ro, z1], [ri, z1], [ri, z0]], seg);
  }
  function dialDiscGeo(r, z0, z1, seg = 48) {
    return dialLatheGeo([[0, z0], [r, z0], [r, z1], [0, z1]], seg);
  }
  // Rounded rectangle as a THREE.Shape, centred on the origin.
  function dialRoundRect(w, d, r) {
    const s = new THREE.Shape(), x = w / 2, y = d / 2, rr = Math.min(r, x - 1e-4, y - 1e-4);
    s.moveTo(-x + rr, -y);
    s.lineTo(x - rr, -y); s.quadraticCurveTo(x, -y, x, -y + rr);
    s.lineTo(x, y - rr); s.quadraticCurveTo(x, y, x - rr, y);
    s.lineTo(-x + rr, y); s.quadraticCurveTo(-x, y, -x, y - rr);
    s.lineTo(-x, -y + rr); s.quadraticCurveTo(-x, -y, -x + rr, -y);
    return s;
  }
  // Extrude a Shape (holes kept) from z0 to z1; b = bevel size, compensated so the span stays exact.
  function dialExtrudeGeo(shape, z0, z1, b = 0, curve = 24) {
    const bb = Math.max(0, Math.min(b, (z1 - z0) / 2 - 1e-5));
    const g = new THREE.ExtrudeGeometry(shape, { depth: (z1 - z0) - 2 * bb, bevelEnabled: bb > 0, bevelThickness: bb, bevelSize: bb, bevelOffset: 0, bevelSegments: 2, curveSegments: curve });
    g.translate(0, 0, z0 + bb); return g;
  }
  // A circle with a rectangular key notch on +x (radial outward in the nest frame). Path traced ccw.
  function dialPocketPath(r, notchW, notchD) {
    const p = new THREE.Path(), th = Math.asin(Math.min(0.9, notchW / 2 / r));
    const n = 44;
    p.moveTo(r * Math.cos(th), r * Math.sin(th));
    for (let i = 1; i <= n; i++) {
      const a = th + (TAU - 2 * th) * (i / n);
      p.lineTo(r * Math.cos(a), r * Math.sin(a));
    }
    p.lineTo(notchD, -notchW / 2);
    p.lineTo(notchD, notchW / 2);
    p.closePath(); return p;
  }
  // 6-segment hex head / nut, flat to flat size across (m).
  function dialHexGeo(across, h) { const g = new THREE.CylinderGeometry(across / Math.sqrt(3), across / Math.sqrt(3), h, 6); g.rotateX(Math.PI / 2); return g; }
  // M5 socket head cap screw, z0 = seating face.
  function dialScrewGeo(z0, d = 0.0085, h = 0.0048) {
    const r = d / 2;
    return dialLatheGeo([[0, z0], [r * 0.86, z0], [r * 0.96, z0 + h * 0.18], [r, z0 + h * 0.55], [r * 0.92, z0 + h], [0, z0 + h]], 20);
  }

  const stat = dialStore(root), plateStore = dialStore(null);

  // ================================================================ indexer (Weiss TC220T class)
  // base plate + cast housing 260 x 260 x 133, output flange 20 mm below the dial
  dialAdd(stat, M.ral7016, dialBoxGeo(0.300, 0.300, 0.012, 0.004), 0, 0, 0.006);
  dialAdd(stat, M.ral7035, dialBoxGeo(0.260, 0.260, 0.133, 0.010), 0, 0, 0.0785);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    dialAdd(stat, M.ral7035, dialBoxGeo(0.014, 0.044, 0.105, 0.003), sx * 0.136, sy * 0.062, 0.078);
    dialAdd(stat, M.ral7035, dialBoxGeo(0.044, 0.014, 0.105, 0.003), sx * 0.062, sy * 0.136, 0.078);
  }
  // front inspection cover, gasket and nameplate
  dialAdd(stat, M.ral7035, dialBoxGeo(0.120, 0.006, 0.098, 0.003), 0.012, -0.133, 0.078);
  dialAdd(stat, M.blackPlastic, dialBoxGeo(0.128, 0.002, 0.106, 0.002), 0.012, -0.1295, 0.078);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) dialAdd(stat, M.steel, dialScrewGeo(0, 0.0060, 0.0035), 0.012 + sx * 0.048, -0.1365, 0.078 + sz * 0.041, 0, 0, Math.PI / 2);
  // base hold-down bolts
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    dialAdd(stat, M.steel, dialHexGeo(0.016, 0.006), sx * 0.120, sy * 0.120, 0.015);
    dialAdd(stat, M.steel, dialCylZ(0.0085, 0.0025, 16), sx * 0.120, sy * 0.120, 0.0185);
  }
  // rotating output flange under the dial
  const flangeProf = [[0.045, 0.144], [0.106, 0.144], [0.110, 0.147], [0.110, 0.160], [0.107, 0.165], [0.075, 0.165], [0.075, 0.144], [0.045, 0.144]];
  dialAdd(plateStore, M.aluBlasted, dialLatheGeo(flangeProf, 64));
  // black gasket ring around the flange (stationary, on the indexer top)
  dialAdd(stat, M.blackPlastic, dialRingGeo(0.124, 0.111, 0.145, 0.148, 64));
  // side geared brake motor, axis -x, z = 0.080
  const MZ = I.motor.z;
  dialAdd(stat, M.aluBlasted, dialCylX(0.080, 0.020, 40), -0.140, 0, MZ);
  dialAdd(stat, M.aluBlasted, dialCylX(0.075, 0.055, 40), -0.1775, 0, MZ);
  dialAdd(stat, M.ral7035, dialCylX(I.motor.r, 0.150, 40), -0.280, 0, MZ);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, g = dialBoxGeo(0.142, 0.009, 0.012, 0.002); g.translate(0, 0.062, 0);
    dialAdd(stat, M.ral7035, g, -0.280, 0, MZ, 0, 0, a);
  }
  // fan cover: light-grey shroud and domed end cap with dark ventilator slots
  dialAdd(stat, M.ral7035, dialCylX(0.070, 0.045, 40), -0.3775, 0, MZ);
  dialAdd(stat, M.ral7035, dialLatheGeo([[0, 0], [0.070, 0], [0.064, 0.004], [0.045, 0.010], [0.020, 0.0155], [0, 0.016]], 40), -0.400, 0, MZ, 0, -Math.PI / 2, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, g = dialBoxGeo(0.026, 0.006, 0.0015, 0.0005); g.translate(0, 0.0705, 0);
    dialAdd(stat, M.blackPlastic, g, -0.383, 0, MZ, 0, 0, a);
  }
  // terminal box on the side of the motor (the dial overhangs the top), cable gland and cable
  dialAdd(stat, M.ral7035, dialBoxGeo(0.090, 0.050, 0.060, 0.006), -0.255, 0.070, 0.080);
  dialAdd(stat, M.blackPlastic, dialBoxGeo(0.090, 0.002, 0.060, 0.001), -0.255, 0.0445, 0.080);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) dialAdd(stat, M.steel, dialScrewGeo(0, 0.0055, 0.003), -0.255 + sx * 0.036, 0.095, 0.080 + sz * 0.020, 0, 0, -Math.PI / 2);
  dialAdd(stat, M.blackPlastic, dialCylY(0.010, 0.022, 16), -0.282, 0.102, 0.060);
  // (motor cable is built with the other static cable runs below)
  // small motor nameplate
  dialAdd(stat, M.steel, dialBoxGeo(0.070, 0.003, 0.040, 0.001), -0.255, -0.061, MZ);
  // brake release lever on the fan cover
  dialAdd(stat, M.steel, dialCylX(0.004, 0.048, 12), -0.428, 0.028, 0.110);
  dialAdd(stat, M.blackPlastic, dialCylX(0.007, 0.012, 12), -0.458, 0.028, 0.110);
  // indexer nameplate (faces the operator, -y)
  const nameplate = labelPlane("WEISS TC220T", 0.098, 0.032, { bg: "#d5d7d3", fg: "#20242a", px: 160, font: "600 72px 'IBM Plex Sans', sans-serif" });
  nameplate.position.set(0.012, -0.1372, 0.080); nameplate.rotation.x = Math.PI / 2; root.add(nameplate);

  // ================================================================ dial plate, 8 nests, rotating flange
  const plate = new THREE.Group(); plate.name = "dial_plate"; plate.position.set(DIAL.cx, DIAL.cy, 0); root.add(plate);
  plateStore.parent = plate;
  // plate: closed ring, centre bore 150, top 0.185
  const plateProf = [[0.075, DIAL.top - DIAL.t], [DIAL.r - 0.0015, DIAL.top - DIAL.t], [DIAL.r, DIAL.top - DIAL.t + 0.0015], [DIAL.r, DIAL.top - 0.0015], [DIAL.r - 0.0015, DIAL.top], [0.075, DIAL.top], [0.0755, DIAL.top - 0.0015], [0.0755, DIAL.top - DIAL.t + 0.0015]];
  dialAdd(plateStore, M.alAnodGrey, dialLatheGeo(plateProf, 128));
  // seal in the bore, running on the stationary centre flange
  dialAdd(plateStore, M.blackPlastic, dialRingGeo(0.0754, 0.0732, DIAL.top - DIAL.t + 0.001, DIAL.top - 0.001, 64));
  // 8 stainless plate screws between the nests
  for (let n = 0; n < 8; n++) {
    const a = STATIONS[n].a + DIAL.step / 2, x = 0.323 * Math.cos(a), y = 0.323 * Math.sin(a);
    dialAdd(plateStore, M.steel, dialScrewGeo(DIAL.top, 0.010, 0.005), x, y, 0);
    dialAdd(plateStore, M.blackPlastic, dialCylZ(0.0022, 0.0012, 6), x, y, DIAL.top + 0.0046);
  }
  // nests: POM block 60 radial x 80 tangential x 35 tall, pocket 20.4 x 8, key notch, dowels + screws
  const nestR = DIAL.nestR, blockW = 0.060, blockD = 0.080, top = DIAL.nestTop, bot = DIAL.top, pocketR = 0.0102;
  for (let n = 0; n < 8; n++) {
    const a = STATIONS[n].a, cx = nestR * Math.cos(a), cy = nestR * Math.sin(a);
    const xf = new THREE.Matrix4().makeRotationZ(a); xf.setPosition(cx, cy, 0);
    const addNest = (mat, g, x = 0, y = 0, z = 0) => { g.translate(x, y, z); g.applyMatrix4(xf); dialAdd(plateStore, mat, g); };
    // block with a Ø29 mm liner bore
    const block = dialRoundRect(blockW, blockD, 0.006);
    const bh = new THREE.Path(); bh.absarc(0, 0, 0.0146, 0, TAU, true); block.holes.push(bh);
    addNest(M.nestPOM, dialExtrudeGeo(block, bot, top, 0));
    // pocket liner: Ø20.4 bore with key notch, 8 mm deep, conical lead-in ring
    const liner = new THREE.Shape(); liner.absarc(0, 0, 0.0146, 0, TAU, false);
    liner.holes.push(dialPocketPath(pocketR, 0.0040, 0.0134));
    addNest(M.nestPOM, dialExtrudeGeo(liner, 0.206, top - 0.002, 0));
    addNest(M.nestPOM, dialLatheGeo([[pocketR, top - 0.002], [0.0119, top], [0.0146, top], [0.0146, top - 0.002], [pocketR, top - 0.002]], 64));
    addNest(M.nestPOM, dialDiscGeo(0.0146, 0.205, 0.212, 48));
    // dowels (steel, 1.5 mm proud) and M5 screws with black washers
    for (const sy of [-1, 1]) {
      addNest(M.steel, dialLatheGeo([[0, top], [0.0017, top], [0.0020, top + 0.0012], [0.0020, top + 0.0030], [0.0016, top + 0.0035], [0, top + 0.0035]], 20), -0.0225, sy * 0.022, 0);
      addNest(M.blackPlastic, dialCylZ(0.0052, 0.0012, 16), 0.0225, sy * 0.026, top + 0.0006);
      addNest(M.steel, dialScrewGeo(top + 0.0012, 0.0085, 0.0046), 0.0225, sy * 0.026, 0);
      addNest(M.blackPlastic, dialCylZ(0.0021, 0.0010, 6), 0.0225, sy * 0.026, top + 0.0058);
    }
    // small blow-off hole in the pocket floor
    addNest(M.blackPlastic, dialCylZ(0.0016, 0.0008, 10), 0, 0, 0.2116);
  }
  // ================================================================ centre column + star plate
  // stationary centre flange on the indexer; the rotating dial runs around it
  dialAdd(stat, M.aluBlasted, dialRingGeo(0.073, 0.0448, 0.165, 0.177, 64));
  dialAdd(stat, M.steel, dialRingGeo(0.065, 0.0448, 0.165, 0.181, 64));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    dialAdd(stat, M.steel, dialScrewGeo(0.181, 0.0060, 0.0032), 0.058 * Math.cos(a), 0.058 * Math.sin(a), 0);
  }
  // column, foot and top flanges
  dialAdd(stat, M.steel, dialCylZ(TOOL.column.r, TOOL.column.z1 - TOOL.column.z0, 40), 0, 0, (TOOL.column.z0 + TOOL.column.z1) / 2);
  dialAdd(stat, M.steel, dialRingGeo(0.064, 0.0448, 0.500, 0.516, 64));
  dialAdd(stat, M.steel, dialRingGeo(0.064, 0.0448, 0.516, TOOL.star.z0, 64));
  // machined grooves and a vertical cable duct on the column
  for (const z of [0.245, 0.355, 0.455]) dialAdd(stat, M.blackPlastic, dialRingGeo(0.0455, 0.0450, z, z + 0.004, 40));
  dialAdd(stat, M.blackPlastic, dialBoxGeo(0.026, 0.022, 0.300, 0.004), 0.052, 0, 0.335);
  for (const z of [0.260, 0.340, 0.420]) dialAdd(stat, M.steel, dialBoxGeo(0.032, 0.028, 0.006, 0.001), 0.052, 0, z);
  // star hub and four arms (S4, S5, S6, S8); S1-S3 and S7 stay open
  dialAdd(stat, M.alAnodGrey, dialLatheGeo([[0, 0.520], [0.078, 0.520], [0.080, 0.522], [0.080, 0.538], [0.078, 0.540], [0, 0.540]], 64));
  const armShape = new THREE.Shape();
  armShape.moveTo(0.045, -0.030);
  armShape.lineTo(0.310, -0.030);
  armShape.absarc(0.310, 0, 0.030, -Math.PI / 2, Math.PI / 2, false);
  armShape.lineTo(0.045, 0.030); armShape.closePath();
  const armGeo = dialExtrudeGeo(armShape, TOOL.star.z0, TOOL.star.z1, 0.0012);
  for (const s of TOOL.star.stations) {
    const a = st(s).a;
    const g = armGeo.clone(); dialAdd(stat, M.alAnodGrey, g, 0, 0, 0, a);
    // arm-root and arm-end bolts
    for (const r of [0.112, 0.292]) for (const sy of [-1, 1]) {
      const x = r * Math.cos(a) - sy * 0.018 * Math.sin(a), y = r * Math.sin(a) + sy * 0.018 * Math.cos(a);
      dialAdd(stat, M.steel, dialScrewGeo(TOOL.star.z1, 0.010, 0.005), x, y, 0);
      dialAdd(stat, M.blackPlastic, dialCylZ(0.0024, 0.0012, 6), x, y, TOOL.star.z1 + 0.005);
    }
  }
  // hub bolts and a black cable-clamp strip along each arm
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    dialAdd(stat, M.steel, dialScrewGeo(TOOL.star.z1, 0.010, 0.005), 0.056 * Math.cos(a), 0.056 * Math.sin(a), 0);
  }
  for (const s of TOOL.star.stations) {
    const a = st(s).a;
    for (const r of [0.135, 0.225, 0.305]) {
      const cx = r * Math.cos(a) - 0.020 * Math.sin(a), cy = r * Math.sin(a) + 0.020 * Math.cos(a);
      dialAdd(stat, M.blackPlastic, dialBoxGeo(0.016, 0.024, 0.006, 0.002), cx, cy, TOOL.star.z1 + 0.003, a);
    }
  }

  // ================================================================ S4 servo press (electromechanical cylinder)
  const pressX = S4.x, pressY = S4.y;
  // mounting plate under the S4 arm, body 70 x 70 x 194 (envelope r 40, z 0.30..0.78)
  dialAdd(stat, M.aluBlasted, dialBoxGeo(0.112, 0.112, 0.014, 0.005), pressX, pressY, 0.513);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) dialAdd(stat, M.steel, dialScrewGeo(0.506, 0.0090, 0.0040), pressX + sx * 0.042, pressY + sy * 0.042, 0);
  dialAdd(stat, M.aluBlasted, dialBoxGeo(0.070, 0.070, 0.194, 0.012), pressX, pressY, 0.409);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const g = dialBoxGeo(0.0022, 0.010, 0.178, 0.001);
    dialAdd(stat, M.blackPlastic, g, pressX + sx * 0.0351, pressY + sy * 0.0180, 0.409);
    const h = dialBoxGeo(0.010, 0.0022, 0.178, 0.001);
    dialAdd(stat, M.blackPlastic, h, pressX + sx * 0.018, pressY + sy * 0.0340, 0.409);
  }
  // load cell disc and wiper at the bottom of the cylinder
  dialAdd(stat, M.steel, dialRingGeo(0.028, 0.0090, 0.300, 0.312, 40));
  dialAdd(stat, M.blackPlastic, dialRingGeo(0.0200, 0.0090, 0.300, 0.305, 32));
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    dialAdd(stat, M.steel, dialScrewGeo(0.312, 0.0055, 0.0028), pressX + 0.020 * Math.cos(a), pressY + 0.020 * Math.sin(a), 0);
  }
  // servo motor stack above the arm
  dialAdd(stat, M.aluBlasted, dialBoxGeo(0.092, 0.092, 0.012, 0.004), pressX, pressY, 0.546);
  dialAdd(stat, M.aluBlasted, dialCylZ(0.048, 0.050, 40), pressX, pressY, 0.577);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    dialAdd(stat, M.steel, dialScrewGeo(0.602, 0.0060, 0.0030), pressX + 0.036 * Math.cos(a), pressY + 0.036 * Math.sin(a), 0);
  }
  dialAdd(stat, M.blackPlastic, dialCylZ(0.038, 0.140, 40), pressX, pressY, 0.672);
  dialAdd(stat, M.aluBlasted, dialCylZ(0.042, 0.010, 40), pressX, pressY, 0.747);
  dialAdd(stat, M.blackPlastic, dialLatheGeo([[0, 0.752], [0.035, 0.752], [0.035, 0.762], [0.030, 0.774], [0, 0.774]], 32), pressX, pressY, 0);
  dialAdd(stat, M.blackPlastic, dialBoxGeo(0.055, 0.035, 0.040, 0.005), pressX, pressY + 0.049, 0.660);
  dialAdd(stat, M.blackPlastic, dialCylY(0.008, 0.016, 12), pressX, pressY + 0.069, 0.660);
  dialAdd(stat, M.steel, dialBoxGeo(0.050, 0.003, 0.028, 0.001), pressX, pressY - 0.0385, 0.670);
  // press label and a small pressure gauge/port on the front of the body
  const pressLabel = labelPlane("S4 · PRESS 8 kN", 0.044, 0.014, { bg: "#c9cdc8", fg: "#22262a", px: 160, font: "600 60px 'IBM Plex Sans', sans-serif" });
  pressLabel.position.set(pressX, pressY - 0.036, 0.455); pressLabel.rotation.x = Math.PI / 2; root.add(pressLabel);
  dialAdd(stat, M.steel, dialCylY(0.012, 0.016, 16), pressX + 0.020, pressY - 0.040, 0.340);
  dialAdd(stat, M.blackPlastic, dialCylY(0.007, 0.020, 12), pressX + 0.020, pressY - 0.048, 0.340);
  // moving ram: tool face at pressState(t).z, chrome rod Ø16, tool cup Ø14
  const ram = new THREE.Group(); ram.name = "dial_press_ram"; ram.position.set(pressX, pressY, PZ.up); root.add(ram);
  mesh(dialMerge([
    dialCylZ(0.008, 0.250, 24).translate(0, 0, 0.137),
    dialLatheGeo([[0.0062, 0], [0.0070, 0], [0.0070, 0.010], [0.0066, 0.012], [0.0062, 0.012], [0.0062, 0]], 32),
    dialDiscGeo(0.0070, 0.010, 0.012, 32),
  ]), M.chrome, ram);
  const cupFace = mesh(dialRingGeo(0.0070, 0.0062, -0.0002, 0.0018, 32), M.blackPlastic, ram);
  cupFace.renderOrder = 1;
  // hardened anvil under the dial at S4
  dialAdd(stat, M.ral7016, dialBoxGeo(0.120, 0.120, 0.020, 0.005), pressX, pressY, 0.010);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) dialAdd(stat, M.steel, dialScrewGeo(0.020, 0.010, 0.005), pressX + sx * 0.043, pressY + sy * 0.043, 0);
  dialAdd(stat, M.steel, dialCylZ(LAYOUT.anvil.r, 0.130, 32), pressX, pressY, 0.085);
  dialAdd(stat, M.steel, dialHexGeo(0.080, 0.020), pressX, pressY, 0.125);
  dialAdd(stat, M.steel, dialCylZ(LAYOUT.anvil.r + 0.002, 0.015, 32), pressX, pressY, 0.1575);
  dialAdd(stat, M.chrome, dialCylZ(LAYOUT.anvil.r - 0.001, 0.004, 32), pressX, pressY, 0.1620);

  // ================================================================ S5 vision (camera + ring light)
  const cam = new THREE.Group(); cam.name = "dial_s5_camera"; cam.position.set(S5.x, S5.y, 0); cam.rotation.z = S5.a; root.add(cam);
  const camStore = dialStore(cam);
  dialAdd(camStore, M.blackPlastic, dialBoxGeo(0.060, 0.045, 0.100, 0.006), 0, 0, 0.450);
  dialAdd(camStore, M.aluBlasted, dialBoxGeo(0.056, 0.042, 0.008, 0.003), 0, 0, 0.400);
  dialAdd(camStore, M.aluBlasted, dialCylZ(0.015, 0.012, 32), 0, 0, 0.396);
  dialAdd(camStore, M.blackPlastic, dialCylZ(0.012, 0.050, 32), 0, 0, 0.365);
  dialAdd(camStore, M.aluBlasted, dialCylZ(0.014, 0.010, 32), 0, 0, 0.365);
  dialAdd(camStore, M.lens, dialDiscGeo(0.0105, 0.334, 0.339, 32));
  // ring light: torus outer radius = ringR, white diffuser, emissive flash
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xf5f2e8, roughness: 0.35, metalness: 0.0, emissive: 0xfff0d0, emissiveIntensity: 0 });
  const ring = mesh(new THREE.TorusGeometry(TOOL.camera.ringR - 0.008, 0.008, 12, 48), ringMat, cam);
  ring.name = "dial_ring"; ring.position.z = TOOL.camera.ringZ;
  dialAdd(camStore, M.aluBlasted, dialRingGeo(TOOL.camera.ringR, TOOL.camera.ringR - 0.003, TOOL.camera.ringZ + 0.004, TOOL.camera.ringZ + 0.009, 48));
  for (let i = 0; i < 3; i++) {
    const a = i * TAU / 3 + 0.5;
    dialAdd(camStore, M.aluClear, dialCylZ(0.0028, 0.090, 12), (TOOL.camera.ringR - 0.010) * Math.cos(a), (TOOL.camera.ringR - 0.010) * Math.sin(a), TOOL.camera.ringZ + 0.047);
  }
  // bracket from the S5 arm
  dialAdd(camStore, M.aluClear, dialBoxGeo(0.078, 0.078, 0.008, 0.003), 0.008, 0, 0.516);
  dialAdd(camStore, M.aluClear, dialBoxGeo(0.010, 0.072, 0.062, 0.003), 0.043, 0, 0.481);
  dialAdd(camStore, M.aluClear, dialBoxGeo(0.044, 0.082, 0.008, 0.003), 0.020, 0, 0.504);
  for (const sy of [-1, 1]) dialAdd(camStore, M.steel, dialScrewGeo(0.512, 0.0060, 0.0032), 0.043, sy * 0.028, 0);
  const camLabel = labelPlane("S5 · VISION", 0.040, 0.012, { bg: "#2e3236", fg: "#d9e2e8", px: 128, font: "600 64px 'IBM Plex Sans', sans-serif" });
  camLabel.position.set(0, -0.0235, 0.468); camLabel.rotation.x = Math.PI / 2; cam.add(camLabel);

  // ================================================================ S6 reject unit, chute and bin
  const railY = S6.y - TOOL.rej.out / 2;
  dialAdd(stat, M.aluBlasted, dialBoxGeo(0.045, TOOL.rej.out + 0.020, 0.032, 0.006), S6.x, railY, TOOL.rej.railZ);
  dialAdd(stat, M.steel, dialBoxGeo(0.020, TOOL.rej.out + 0.014, 0.006, 0.001), S6.x, railY, TOOL.rej.railZ + 0.019);
  for (const sy of [-1, 1]) dialAdd(stat, M.ral7016, dialBoxGeo(0.060, 0.012, 0.050, 0.004), S6.x, railY + sy * (TOOL.rej.out / 2 + 0.004), TOOL.rej.railZ);
  // support from the S6 arm and a small diagonal strut to the outer end
  dialAdd(stat, M.aluClear, dialBoxGeo(0.080, 0.080, 0.008, 0.003), S6.x, -0.340, 0.516);
  dialAdd(stat, M.aluClear, dialBoxGeo(0.020, 0.110, 0.015, 0.002), S6.x, -0.385, 0.530, 0, 0, 0.10);
  dialAdd(stat, M.aluBlasted, dialBoxGeo(0.030, TOOL.rej.out + 0.020, 0.030, 0.004), S6.x + 0.045, railY, TOOL.rej.railZ);
  for (const sy of [-1, 1]) dialAdd(stat, M.puBlue, dialCylY(0.004, 0.014, 10), S6.x + 0.045, railY + sy * 0.052, TOOL.rej.railZ + 0.018);
  // moving carriage, guided lift and 2-finger gripper; local origin = rail centre line at the TCP x/y
  const rej = new THREE.Group(); rej.name = "dial_reject"; rej.position.set(S6.x, S6.y, TOOL.rej.railZ); root.add(rej);
  const rejStore = dialStore(rej);
  dialAdd(rejStore, M.blackPlastic, dialBoxGeo(0.075, 0.060, 0.055, 0.006), 0, 0, 0.005);
  dialAdd(rejStore, M.aluBlasted, dialBoxGeo(0.082, 0.066, 0.008, 0.003), 0, 0, 0.038);
  dialAdd(rejStore, M.aluBlasted, dialCylZ(0.017, 0.095, 32), 0, 0, -0.0525);
  dialAdd(rejStore, M.blackPlastic, dialCylZ(0.018, 0.008, 32), 0, 0, -0.104);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) dialAdd(rejStore, M.steel, dialCylZ(0.0025, 0.096, 10), sx * 0.012, sy * 0.012, -0.0525);
  dialAdd(rejStore, M.blackPlastic, dialBoxGeo(0.046, 0.030, 0.024, 0.004), 0.035, 0, 0.048);
  for (const sy of [-1, 1]) dialAdd(rejStore, M.puBlue, dialCylY(0.004, 0.014, 10), 0.045, sy * 0.008, 0.060);
  dialFlush(rejStore);
  // guide rods and the two blue air hoses are stretched by scaling z
  const rejRods = mesh(dialMerge([
    dialCylZ(0.004, 1, 12).translate(-0.012, 0, 0),
    dialCylZ(0.004, 1, 12).translate(0.012, 0, 0),
  ]), M.chrome, rej);
  const rejHoses = mesh(dialMerge([
    dialCylZ(0.0034, 1, 10).translate(0.026, 0.011, 0),
    dialCylZ(0.0034, 1, 10).translate(0.026, -0.011, 0),
  ]), M.puBlue, rej);
  rejHoses.name = "dial_reject_hoses";
  // gripper body moves with the lift; its origin is the fingertip centre (TCP)
  const rejTool = new THREE.Group(); rejTool.name = "dial_reject_tool"; rej.add(rejTool);
  const toolStore = dialStore(rejTool);
  dialAdd(toolStore, M.blackPlastic, dialBoxGeo(0.050, 0.038, 0.045, 0.004), 0, 0, 0.0525);
  dialAdd(toolStore, M.aluBlasted, dialBoxGeo(0.056, 0.044, 0.006, 0.002), 0, 0, 0.077);
  dialAdd(toolStore, M.steel, dialBoxGeo(0.018, 0.026, 0.020, 0.002), 0.030, 0, 0.060);
  dialAdd(toolStore, M.puBlue, dialCylY(0.0035, 0.010, 10), 0.030, -0.020, 0.060);
  for (const sy of [-1, 1]) dialAdd(toolStore, M.steel, dialScrewGeo(0.077, 0.0055, 0.0028), 0.018, sy * 0.014, 0);
  dialFlush(toolStore);
  // two fingers; each group origin is its contact face, fingertip centre on the TCP plane z = 0
  const rejFingers = [-1, 1].map((sg, i) => {
    const g = new THREE.Group(); g.name = `dial_reject_finger_${i}`; rejTool.add(g);
    const fs = dialStore(g);
    dialAdd(fs, M.steel, dialBoxGeo(0.006, 0.016, 0.090, 0.0015), sg * 0.003, 0, 0.030);
    dialAdd(fs, M.steel, dialBoxGeo(0.008, 0.018, 0.020, 0.002), sg * 0.004, 0, 0.070);
    dialAdd(fs, M.steel, dialBoxGeo(0.003, 0.014, 0.022, 0.001), sg * 0.0015, 0, 0.000);
    dialFlush(fs);
    return g;
  });
  // stainless chute from R = 0.43 down into the red reject bin
  const chuteTilt = Math.atan2(0.209 - 0.178, 0.125);
  const chuteGeo = (w, d, h) => { const g = dialBoxGeo(w, d, h, 0.0012); g.rotateX(chuteTilt); return g; };
  dialAdd(stat, M.stainlessBrushed, chuteGeo(0.100, 0.140, 0.004), S6.x, -0.500, 0.1920);
  for (const sx of [-1, 1]) dialAdd(stat, M.stainlessBrushed, chuteGeo(0.004, 0.140, 0.030), S6.x + sx * 0.048, -0.500, 0.2045);
  dialAdd(stat, M.stainlessBrushed, chuteGeo(0.112, 0.022, 0.004), S6.x, -0.568, 0.1760);
  // crossbar under the rail end carrying the two chute posts
  dialAdd(stat, M.aluClear, dialBoxGeo(0.124, 0.022, 0.016, 0.003), S6.x, -0.438, 0.476);
  for (const sx of [-1, 1]) dialAdd(stat, M.aluClear, dialCylZ(0.005, 0.258, 10), S6.x + sx * 0.048, -0.438, 0.339);
  // red bin (RAL 3020) with a white REJECT label
  const B = BIN;
  dialAdd(stat, M.ral3020, dialBoxGeo(B.w, B.d, B.floor, 0.004), B.x, B.y, B.floor / 2);
  dialAdd(stat, M.ral3020, dialBoxGeo(B.w, 0.008, B.h, 0.003), B.x, B.y - B.d / 2 + 0.004, B.floor + B.h / 2);
  dialAdd(stat, M.ral3020, dialBoxGeo(B.w, 0.008, B.h, 0.003), B.x, B.y + B.d / 2 - 0.004, B.floor + B.h / 2);
  dialAdd(stat, M.ral3020, dialBoxGeo(0.008, B.d - 0.016, B.h, 0.003), B.x - B.w / 2 + 0.004, B.y, B.floor + B.h / 2);
  dialAdd(stat, M.ral3020, dialBoxGeo(0.008, B.d - 0.016, B.h, 0.003), B.x + B.w / 2 - 0.004, B.y, B.floor + B.h / 2);
  dialAdd(stat, M.ral3020, dialBoxGeo(B.w + 0.012, 0.014, 0.014, 0.003), B.x, B.y - B.d / 2 + 0.002, B.floor + B.h - 0.007);
  dialAdd(stat, M.ral3020, dialBoxGeo(B.w + 0.012, 0.014, 0.014, 0.003), B.x, B.y + B.d / 2 - 0.002, B.floor + B.h - 0.007);
  dialAdd(stat, M.ral3020, dialBoxGeo(0.014, B.d + 0.012, 0.014, 0.003), B.x - B.w / 2 + 0.002, B.y, B.floor + B.h - 0.007);
  dialAdd(stat, M.ral3020, dialBoxGeo(0.014, B.d + 0.012, 0.014, 0.003), B.x + B.w / 2 - 0.002, B.y, B.floor + B.h - 0.007);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) dialAdd(stat, M.ral3020, dialBoxGeo(0.014, 0.014, 0.130, 0.003), B.x + sx * (B.w / 2 - 0.004), B.y + sy * (B.d / 2 - 0.004), B.floor + 0.065);
  const binLabel = labelPlane("REJECT", 0.110, 0.032, { bg: "#f1efe9", fg: "#b3141c", px: 160, font: "700 120px 'IBM Plex Sans', sans-serif" });
  binLabel.position.set(B.x, B.y - B.d / 2 - 0.0015, 0.110); binLabel.rotation.x = Math.PI / 2; root.add(binLabel);

  // ================================================================ S8 through-beam fibre pair
  const s8Look = 0.030;
  const s8x = S8.x, s8Out = S8.y - s8Look, s8In = S8.y + s8Look;
  // bracket from the S8 arm down to the outer post
  dialAdd(stat, M.aluClear, dialBoxGeo(0.048, 0.020, 0.012, 0.003), S8.x - 0.020, s8Out, 0.514);
  dialAdd(stat, M.aluClear, dialCylZ(0.006, TOOL.s8.z1 - 0.252, 12), s8x, s8Out, (0.252 + TOOL.s8.z1) / 2);
  for (const hy of [s8Out, s8In]) {
    // head bodies, lenses face each other across the nest (beam at z = 0.226)
    const inward = Math.sign(S8.y - hy);
    dialAdd(stat, M.blackPlastic, dialBoxGeo(0.018, 0.022, 0.026, 0.003), s8x, hy, 0.235);
    dialAdd(stat, M.chrome, dialCylY(0.0045, 0.008, 12), s8x, hy + inward * 0.013, 0.226);
    dialAdd(stat, M.lens, dialCylY(0.0032, 0.0016, 12), s8x, hy + inward * 0.016, 0.226);
  }
  // crossbar over the part, joining both heads
  dialAdd(stat, M.aluClear, dialBoxGeo(0.018, 2 * s8Look + 0.020, 0.008, 0.002), s8x, S8.y, 0.252);
  // amplifier with the green "dial at rest" LED
  dialAdd(stat, M.blackPlastic, dialBoxGeo(0.026, 0.016, 0.040, 0.003), s8x, s8Out - 0.014, 0.460);
  const s8LedMat = M.lampGreen.clone(); s8LedMat.emissive.setHex(0x35ff68); s8LedMat.emissiveIntensity = 0;
  const s8Led = mesh(dialCylY(0.0032, 0.003, 10), s8LedMat, root);
  s8Led.name = "dial_s8_led"; s8Led.position.set(s8x, s8Out - 0.0235, 0.468);
  // fibre cables from the heads down the post
  dialAdd(stat, M.blackPlastic, tubeGeo([[s8x, s8Out - 0.011, 0.235], [s8x, s8Out - 0.011, 0.300], [s8x, s8Out - 0.014, 0.460]], 0.0016, 18, 6));
  dialAdd(stat, M.blackPlastic, tubeGeo([[s8x, s8In + 0.011, 0.235], [s8x, s8In + 0.011, 0.258], [s8x, s8Out, 0.300], [s8x, s8Out - 0.014, 0.460]], 0.0016, 18, 6));

  // ================================================================ optional part-present fibre heads at S1-S3
  for (const s of [1, 2, 3]) {
    const S = st(s), a = S.a, px = 0.400 * Math.cos(a), py = 0.400 * Math.sin(a);
    dialAdd(stat, M.ral7016, dialCylZ(0.018, 0.012, 20), px, py, 0.006);
    dialAdd(stat, M.aluClear, dialCylZ(0.008, 0.230, 14), px, py, 0.121);
    const hx = 0.366 * Math.cos(a), hy = 0.366 * Math.sin(a);
    dialAdd(stat, M.aluClear, dialBoxGeo(0.036, 0.016, 0.014, 0.003), 0.383 * Math.cos(a), 0.383 * Math.sin(a), 0.238, a);
    dialAdd(stat, M.blackPlastic, dialBoxGeo(0.028, 0.026, 0.022, 0.003), hx, hy, 0.232, a);
    const lx = 0.351 * Math.cos(a), ly = 0.351 * Math.sin(a);
    dialAdd(stat, M.chrome, dialCylX(0.005, 0.008, 12), lx, ly, 0.232, a);
    dialAdd(stat, M.lens, dialCylX(0.0032, 0.0018, 12), 0.3469 * Math.cos(a), 0.3469 * Math.sin(a), 0.232, a);
    dialAdd(stat, M.steel, dialScrewGeo(0, 0.0055, 0.0028), hx, hy, 0.243);
    dialAdd(stat, M.blackPlastic, tubeGeo([[hx, hy, 0.220], [px, py, 0.180], [px, py, 0.012]], 0.0014, 18, 6));
    for (const sy of [-1, 1]) {
      const bx = px + sy * 0.010 * Math.sin(a), by = py - sy * 0.010 * Math.cos(a);
      dialAdd(stat, M.steel, dialScrewGeo(0.012, 0.0050, 0.0026), bx, by, 0);
    }
  }

  // ================================================================ static cable runs and a column duct
  const cable = (pts, r = 0.0030) => dialAdd(stat, M.blackPlastic, tubeGeo(pts, r, 32, 8));
  // indexer motor cable down to the base (gland on the side terminal box)
  cable([[-0.282, 0.113, 0.060], [-0.300, 0.128, 0.030], [-0.285, 0.140, 0.012], [-0.220, 0.147, 0.008], [-0.170, 0.150, 0.008]], 0.0040);
  // load-cell cable and motor cable on the press
  cable([[pressX + 0.028, pressY, 0.306], [pressX + 0.040, pressY + 0.020, 0.350], [pressX + 0.036, pressY + 0.035, 0.460], [pressX + 0.028, pressY + 0.030, 0.505]], 0.0024);
  cable([[pressX, pressY + 0.075, 0.660], [pressX + 0.018, pressY + 0.072, 0.610], [pressX + 0.030, pressY + 0.055, 0.560], [pressX + 0.020, pressY + 0.030, 0.522]], 0.0036);
  // camera cable back to the S5 arm
  const ca = S5.a, cp = (x, y, z) => [S5.x + x * Math.cos(ca) - y * Math.sin(ca), S5.y + x * Math.sin(ca) + y * Math.cos(ca), z];
  cable([cp(-0.026, 0.010, 0.488), cp(-0.040, 0.020, 0.510), cp(-0.030, 0.030, 0.536), cp(0.000, 0.040, 0.542)], 0.0026);
  // star-arm cable runs from the column duct to each tool
  for (const s of TOOL.star.stations) {
    const a = st(s).a, c = Math.cos(a), si = Math.sin(a), tx = -si * 0.018, ty = c * 0.018;
    const armPts = [[0.052, 0, 0.490], [0.064 * c, 0.064 * si, 0.536], [0.130 * c + tx, 0.130 * si + ty, 0.544], [0.240 * c + tx, 0.240 * si + ty, 0.544], [0.315 * c + tx, 0.315 * si + ty, 0.544]];
    cable(armPts, 0.0030);
  }
  // reject unit air supply drops from the S6 arm to the moving carriage (fixed side only)
  cable([[0.0, -0.330, 0.535], [0.030, -0.340, 0.530], [0.048, -0.350, 0.510], [0.050, -0.360, 0.500]], 0.0030);
  // small cable ties on the column duct
  for (const z of [0.225, 0.305, 0.385, 0.465]) dialAdd(stat, M.blackPlastic, dialBoxGeo(0.030, 0.026, 0.004, 0.001), 0.052, 0, z);

  // ================================================================ merge static geometry
  // the camera body/bracket are fixed to the root: fold camStore into stat, keep ring + label on the cam group
  const camXf = new THREE.Matrix4().makeRotationZ(S5.a); camXf.setPosition(S5.x, S5.y, 0);
  for (const [mat, list] of camStore.maps) for (const g of list) {
    g.applyMatrix4(camXf);
    let dst = stat.maps.get(mat);
    if (!dst) stat.maps.set(mat, (dst = []));
    dst.push(g);
  }
  dialFlush(stat);
  dialFlush(plateStore);

  return { root, plate, nests: STATIONS.map((s) => ({ n: s.s - 1, a: s.a })), ram, ring, ringMat, rej, rejTool, rejFingers, rejRods, rejHoses, s8LedMat };
})();
const dialRailZ = TOOL.rej.railZ;
function updateDial(t) {
  DIALM.plate.rotation.z = dialAngle(t);
  const p = pressState(t); DIALM.ram.position.z = p.z;
  const v = visionState(t); DIALM.ringMat.emissiveIntensity = 3.0 * v.flash;
  const r = rejectState(t), tcp = rejectTCP(r);
  DIALM.rej.position.x = tcp[0]; DIALM.rej.position.y = tcp[1];
  const zt = tcp[2] - dialRailZ;
  DIALM.rejTool.position.z = zt;
  const gap = lerp(0.042, PART.A.gripW, r.grip);
  DIALM.rejFingers[0].position.x = -gap / 2; DIALM.rejFingers[1].position.x = gap / 2;
  const rodTop = zt + 0.077, rodBot = -0.090;
  DIALM.rejRods.position.z = (rodTop + rodBot) / 2; DIALM.rejRods.scale.z = rodTop - rodBot;
  const hoseTop = zt + 0.078, hoseBot = -0.018;
  DIALM.rejHoses.position.z = (hoseTop + hoseBot) / 2; DIALM.rejHoses.scale.z = hoseTop - hoseBot;
  DIALM.s8LedMat.emissiveIntensity = dialState(t).moving ? 0 : 2.2;
}

