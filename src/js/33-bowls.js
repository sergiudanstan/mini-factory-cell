// RNA-style feeders. All dimensions are metres in the cell's Z-up frame.
// Static hardware is baked by material; only the queues, stream and stop pins move.
function bowlHelix(b, u) {
  const sgn = b.dir === "cw" ? 1 : -1, a = b.exitAng + sgn * (1 - u) * b.turns * 2 * Math.PI;
  const r = b.rTrack - (1 - u) * 0.01;
  return [b.cx + r * Math.cos(a), b.cy + r * Math.sin(a), b.bottomZ + (b.outletZ - b.bottomZ) * Math.pow(u, 0.92)];
}
// Closed sheet sections joined into a solid, including end faces. Used for track and acoustic shell.
function bowlSweep(sections) {
  const pos = [], idx = [], n = sections[0].length;
  for (const section of sections) for (const p of section) pos.push(...p);
  for (let i = 1; i < sections.length; i++) for (let j = 0; j < n; j++) {
    const a = (i - 1) * n + j, b = (i - 1) * n + (j + 1) % n, c = i * n + j, d = i * n + (j + 1) % n;
    idx.push(a, b, c, b, d, c);
  }
  for (let j = 1; j < n - 1; j++) {
    idx.push(0, j + 1, j);
    const end = (sections.length - 1) * n; idx.push(end, end + j, end + j + 1);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals(); return geo;
}
function bowlArc(parent, material, x, y, r, thick, z0, z1, start = 0, sweep = Math.PI * 2) {
  const sections = [], n = Math.ceil(Math.abs(sweep) * 20);
  for (let i = 0; i <= n; i++) {
    const a = start + sweep * i / n, c = Math.cos(a), s = Math.sin(a);
    sections.push([[x + r * c, y + r * s, z0], [x + (r + thick) * c, y + (r + thick) * s, z0],
      [x + (r + thick) * c, y + (r + thick) * s, z1], [x + r * c, y + r * s, z1]]);
  }
  return mesh(bowlSweep(sections), material, parent);
}
// Two bevel subdivisions suffice for millimetre edge breaks, including in the close-up.
function bowlBox(w, d, h, r, material, x, y, z, parent) {
  const radius = Math.max(0.00001, Math.min(r, Math.min(w, d, h) / 2 - 0.00001));
  const o = mesh(new RoundedBoxGeometry(w, d, h, 2, radius), material, parent);
  o.position.set(x, y, z); return o;
}
function bowlBar(parent, material, a, b, w, h) {
  const va = V(...a), vb = V(...b), delta = vb.clone().sub(va);
  const o = box(w, h, delta.length(), material, 0, 0, 0, parent);
  o.position.copy(va).add(vb).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(V(0, 0, 1), delta.normalize()); return o;
}
function bowlBake(group) {
  group.updateMatrixWorld(true);
  const bins = new Map(), objects = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.bowlMoving) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld.clone().premultiply(group.matrixWorld.clone().invert()));
    // UVs must remain for brushed steel and labels; missing UVs get zeroes.
    for (const key of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(key)) geo.deleteAttribute(key);
    if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!bins.has(o.material)) bins.set(o.material, []);
    bins.get(o.material).push(geo); objects.push(o);
  });
  for (const o of objects) { o.removeFromParent(); o.geometry.dispose(); }
  let i = 0;
  for (const [material, geos] of bins) {
    const o = mesh(BufferGeometryUtils.mergeGeometries(geos, false), material, group);
    o.name = `bowl_static_${i++}`;
    for (const geo of geos) geo.dispose();
  }
}
const BOWLS = (() => {
  const root = moduleRoot("bowls"), flow = [], flowGeo = {};
  const clear = M.pcClear.clone(); clear.opacity = 0.19;
  const steel = M.ss304Blasted.clone(); steel.side = THREE.DoubleSide;
  const black = M.puBlack.clone(); black.side = THREE.DoubleSide;
  const merged = (type) => {
    if (flowGeo[type]) return flowGeo[type];
    const list = prodGeometry(type, 2).map((p) => p.geo.index ? p.geo.toNonIndexed() : p.geo.clone());
    for (const geo of list) for (const k of Object.keys(geo.attributes)) if (!["position", "normal"].includes(k)) geo.deleteAttribute(k);
    const geo = BufferGeometryUtils.mergeGeometries(list, false); for (const g of list) g.dispose();
    return (flowGeo[type] = geo);
  };
  const matrix = new THREE.Matrix4(), dummy = new THREE.Object3D();
  for (const b of LAYOUT.bowls) {
    const g = new THREE.Group(); g.name = `bowl_${b.id}`; root.add(g);
    const f = FEED[b.f], F = LAYOUT.floor, lining = b.type === "stepped" ? black : steel;
    const at = (s, cross = 0, z = PICK.z) => [f.x + f.ux * s - f.uy * cross, f.y + f.uy * s + f.ux * cross, z];
    const railBox = (len, w, h, mat, s, cross, z) => {
      const o = bowlBox(len, w, h, Math.min(0.002, h / 4), mat, ...at(s, cross, z), g); o.rotation.z = f.a; return o;
    };
    // Cast UG pedestal, tapered ribs, levelling feet and machined mounting plate.
    vcyl(0.19, 0.035, M.ral6011, b.cx, b.cy, F + 0.04, 64, g);
    const column = lathe([[0.09, F + 0.055], [0.075, F + 0.12], [0.065, b.stand.z1 - 0.04], [0.09, b.stand.z1]], M.ral6011, g);
    column.position.set(b.cx, b.cy, 0);
    for (let j = 0; j < 6; j++) {
      const a = j * Math.PI / 3;
      const rib = extrudeXZ([[0.07, F + 0.055], [0.175, F + 0.055], [0.075, F + 0.24]], -0.007, 0.007, M.ral6011, g, 0.002);
      rib.position.set(b.cx, b.cy, 0); rib.rotation.z = a;
      if (j % 2 === 0) {
        const x = b.cx + Math.cos(a) * 0.16, y = b.cy + Math.sin(a) * 0.16;
        vcyl(0.023, 0.015, M.blackRubber, x, y, F + 0.008, 20, g);
        vcyl(0.006, 0.06, M.zinc9006, x, y, F + 0.046, 12, g);
        vcyl(0.012, 0.008, M.zinc9006, x, y, F + 0.069, 6, g);
      }
    }
    vcyl(b.topPlate.d / 2, b.topPlate.z1 - b.topPlate.z0, M.ral6011, b.cx, b.cy, (b.topPlate.z0 + b.topPlate.z1) / 2, 64, g);
    vcyl(b.plate.d / 2, b.plate.h, M.ral9005, b.cx, b.cy, b.mount + b.plate.h / 2, 80, g);
    for (let j = 0; j < 4; j++) {
      const a = Math.PI / 4 + j * Math.PI / 2, r = b.plate.d * 0.43;
      vcyl(0.007, 0.005, M.zinc9006, b.cx + r * Math.cos(a), b.cy + r * Math.sin(a), b.mount + b.plate.h + 0.0025, 6, g);
    }
    const driveBase = b.mount + b.plate.h;
    // Isolators are inset in the drive flange, preserving the specified mounting envelope.
    for (let j = 0; j < 3; j++) {
      const a = j * Math.PI * 2 / 3, r = b.drive.d * 0.36;
      vcyl(0.018, 0.018, M.blackRubber, b.cx + r * Math.cos(a), b.cy + r * Math.sin(a), driveBase + 0.009, 20, g);
    }
    // The bowl closes the drive housing; no grey cap may protrude through its floor.
    const driveWall = mesh(new THREE.CylinderGeometry(b.drive.d / 2, b.drive.d / 2, b.drive.h - 0.018, 80, 1, true), M.ral7035, g);
    driveWall.rotation.x = Math.PI / 2; driveWall.position.set(b.cx, b.cy, driveBase + 0.018 + (b.drive.h - 0.018) / 2);
    const driveTop = Math.min(driveBase + b.drive.h, b.bottomZ - 0.007);
    vcyl(b.drive.d / 2, 0.003, M.ral7035, b.cx, b.cy, driveTop - 0.0015, 80, g);
    bowlArc(g, M.alAnodGrey, b.cx, b.cy, b.drive.d / 2, 0.003, driveBase + 0.021, driveBase + 0.026);
    const plate = labelPlane(`RNA ${b.drive.model}`, 0.105, 0.025, { bg: "#243448", fg: "#ffffff", font: "600 90px sans-serif" });
    plate.rotation.x = Math.PI / 2; plate.position.set(b.cx, b.cy - b.drive.d / 2 - 0.003, driveBase + b.drive.h * 0.5); g.add(plate);
    bowlBox(0.085, 0.045, 0.10, 0.005, M.ral7035, b.cx - 0.13, b.cy - 0.14, b.mount - 0.09, g);
    bowlBox(0.062, 0.003, 0.045, 0.001, M.ral7016, b.cx - 0.13, b.cy - 0.164, b.mount - 0.075, g);
    vcyl(0.008, 0.018, M.blackPlastic, b.cx - 0.13, b.cy - 0.14, b.mount - 0.149, 12, g);
    tubeAlong([[b.cx - 0.13, b.cy - 0.14, b.mount - 0.15], [b.cx - 0.15, b.cy - 0.2, b.mount - 0.21], [b.cx, b.cy - b.drive.d / 2 - 0.012, driveBase + 0.05]], 0.004, M.blackRubber, g, 32, 6);
    // Bowl wall with a rolled rim and shallow central distribution cone.
    const wallR = b.rim / 2;
    const wallExitS = Math.sqrt(wallR * wallR - b.rTrack * b.rTrack);
    const wallExitAng = Math.atan2(b.outlet[1] - f.uy * wallExitS - b.cy, b.outlet[0] - f.ux * wallExitS - b.cx);
    const wallOpening = (b.exitTrack || b.track) / wallR;
    bowlArc(g, lining, b.cx, b.cy, wallR - 0.003, 0.003, b.bottomZ - 0.005, b.outletZ - 0.004);
    bowlArc(g, lining, b.cx, b.cy, wallR - 0.003, 0.003, b.outletZ - 0.004, b.rimZ, wallExitAng + wallOpening, Math.PI * 2 - 2 * wallOpening);
    if (b.type === "stepped") bowlArc(g, black, b.cx, b.cy, wallR - 0.019, 0.018, b.bottomZ - 0.005, b.bottomZ + 0.025);
    bowlArc(g, lining, b.cx, b.cy, wallR - 0.005, 0.008, b.rimZ - 0.004, b.rimZ + 0.001, wallExitAng + wallOpening, Math.PI * 2 - 2 * wallOpening);
    vcyl(wallR - 0.003, 0.006, lining, b.cx, b.cy, b.bottomZ - 0.003, 80, g);
    // The cast C bowl seats over the drive on a 13 mm coated central boss.
    const boss = b.type === "stepped" ? 0.013 : 0;
    if (boss) vcyl(b.drive.d / 2 + 0.002, boss, black, b.cx, b.cy, b.bottomZ + boss / 2, 64, g);
    const cone = lathe([[0, b.bottomZ + boss + 0.014], [0.025, b.bottomZ + boss + 0.014], [b.rTrack - b.track, b.bottomZ + boss], [0, b.bottomZ + boss]], lining, g, 64);
    cone.position.set(b.cx, b.cy, 0);
    // 2 mm formed ribbon, 3% crossfall toward the outer wall; selector removes the inner shoulder.
    const ribbon = [], lip = [];
    for (let j = 0; j <= 768; j++) {
      const u = j / 768, p = bowlHelix(b, u), a = Math.atan2(p[1] - b.cy, p[0] - b.cx);
      const w = b.exitTrack ? lerp(b.track, b.exitTrack, clamp((u - 0.86) / 0.08, 0, 1)) : b.track;
      const notch = u > 0.938 && u < 0.947;
      const inner = notch ? w * 0.12 : -w / 2;
      const point = (r, z) => [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r, p[2] + z - r * 0.03];
      ribbon.push([point(inner, -0.002), point(w / 2, -0.002), point(w / 2, 0), point(inner, 0)]);
      lip.push([point(w / 2 - 0.001, 0), point(w / 2, 0), point(w / 2, 0.006), point(w / 2 - 0.001, 0.006)]);
    }
    mesh(bowlSweep(ribbon), lining, g); mesh(bowlSweep(lip), lining, g);
    // Outer-turn orientation tooling, slotted wiper carrier and blue air jet.
    const tool = bowlHelix(b, 0.91), select = bowlHelix(b, 0.942);
    const bracket = bowlBox(0.06, 0.014, 0.004, 0.001, M.alAnodGrey, tool[0], tool[1], tool[2] + 0.041, g);
    bracket.rotation.z = Math.atan2(tool[1] - b.cy, tool[0] - b.cx);
    const toolA = bracket.rotation.z;
    const toolX = b.cx + (wallR - 0.001) * Math.cos(toolA), toolY = b.cy + (wallR - 0.001) * Math.sin(toolA);
    bowlBar(g, M.alAnodGrey, [toolX, toolY, b.rimZ - 0.012], [toolX, toolY, tool[2] + 0.043], 0.008, 0.014);
    vcyl(0.003, 0.003, M.zinc9006, toolX, toolY, tool[2] + 0.045, 6, g);
    const slot = box(0.027, 0.004, 0.0005, M.ral9005, tool[0], tool[1], tool[2] + 0.0432, g); slot.rotation.z = bracket.rotation.z;
    bowlBar(g, M.alAnodGrey, [tool[0], tool[1], tool[2] + 0.04], [tool[0], tool[1], tool[2] + 0.018], 0.004, 0.028);
    vcyl(0.003, 0.025, M.chrome, select[0], select[1], select[2] + 0.027, 12, g);
    tubeAlong([[select[0], select[1], select[2] + 0.04], [select[0] + 0.04, select[1] + 0.03, b.rimZ + 0.07], [b.cx + wallR + 0.025, b.cy, driveBase + 0.04]], 0.002, M.puBlue, g, 40, 8);
    // Exit nose finishes 0.5 mm before the track; short overhead pressure-break finger.
    railBox(0.025, b.exitTrack || b.track, 0.004, steel, f.track + 0.013, 0, b.outletZ - 0.002);
    railBox(0.022, 0.004, 0.004, M.alAnodGrey, f.track + 0.012, (b.exitTrack || b.track) / 2, b.outletZ + 0.022);
    // Pendulum level switch, guide tube and paddle suspended into bulk.
    const sx = b.cx - wallR * 0.62, sy = b.cy + wallR * 0.4, supportY = b.cy + Math.sqrt(wallR * wallR - (sx - b.cx) ** 2);
    bowlBar(g, M.alAnodGrey, [sx, supportY, b.rimZ - 0.014], [sx, supportY, b.rimZ + 0.035], 0.012, 0.008);
    bowlBar(g, M.alAnodGrey, [sx, supportY, b.rimZ + 0.035], [sx, sy, b.rimZ + 0.035], 0.012, 0.008);
    vcyl(0.006, 0.05, M.alAnodGrey, sx, sy, b.rimZ + 0.01, 16, g);
    vcyl(0.0015, b.h * 0.7, M.chrome, sx, sy, b.rimZ - b.h * 0.35, 10, g);
    bowlBox(0.025, 0.002, 0.028, 0.0008, steel, sx, sy, b.bottomZ + 0.035, g);
    // Acoustic enclosure: open service top, outlet window and hinged clear lid raised 60 degrees.
    const cover = b.cover, opening = 0.14;
    // The linear rail is tangent to the bowl, so its shell penetration is NOT at exitAng.
    const shellExitS = Math.sqrt(cover.r * cover.r - b.rTrack * b.rTrack);
    const shellExitAng = Math.atan2(b.outlet[1] - f.uy * shellExitS - b.cy, b.outlet[0] - f.ux * shellExitS - b.cx);
    bowlArc(g, M.ral7035, b.cx, b.cy, cover.r - 0.006, 0.006, cover.z0, cover.z1, shellExitAng + opening, Math.PI * 2 - 2 * opening);
    bowlArc(g, M.ral7035, b.cx, b.cy, cover.r - 0.006, 0.006, cover.z0, PICK.z - 0.025, shellExitAng - opening, 2 * opening);
    bowlArc(g, M.sealBlack, b.cx, b.cy, cover.r - 0.009, 0.01, cover.z1 - 0.004, cover.z1, shellExitAng + opening, Math.PI * 2 - 2 * opening);
    const badge = labelPlane(`RNA   ${b.id} / ${f.part === "B" ? "SPRINGS" : f.part === "A" ? "HOUSINGS" : "CAPS"}`, 0.13, 0.033, { bg: "#23435c", fg: "#ffffff", font: "600 90px sans-serif" });
    badge.rotation.x = Math.PI / 2; badge.position.set(b.cx, b.cy - cover.r - 0.001, cover.z0 + 0.09); g.add(badge);
    for (const side of [-1, 1]) {
      const a = -Math.PI / 2 + side * 0.7;
      const latch = bowlBox(0.018, 0.01, 0.043, 0.002, M.alAnodGrey, b.cx + (cover.r + 0.004) * Math.cos(a), b.cy + (cover.r + 0.004) * Math.sin(a), cover.z1 - 0.034, g);
      latch.rotation.z = a - Math.PI / 2;
    }
    // Hinge axis follows the incoming chute: the raised lid stays clear of the fill corridor.
    const lidMount = new THREE.Group(); lidMount.position.set(b.cx, b.cy, cover.z1);
    lidMount.rotation.z = Math.atan2(b.hopper.p[1] - b.cy, b.hopper.p[0] - b.cx) - Math.PI; g.add(lidMount);
    const lid = new THREE.Group(); lid.position.set(0, cover.r, 0); lid.rotation.x = -Math.PI / 3; lidMount.add(lid);
    vcyl(cover.r - 0.003, 0.003, clear, 0, -cover.r, 0.002, 96, lid);
    bowlArc(lid, M.alAnodGrey, 0, -cover.r, cover.r - 0.005, 0.005, 0, 0.005);
    bowlBox(0.075, 0.016, 0.014, 0.003, M.blackPlastic, 0, -2 * cover.r + 0.03, 0.012, lid);
    for (const dx of [-0.065, 0.065]) bowlBox(0.032, 0.026, 0.012, 0.003, M.alAnodGrey, dx, cover.r - 0.005, 0, lidMount);
    // BVL hopper: folded taper, lid, drive, square column and bolted base outside guard.
    const hp = b.hopper.p, hx = hp[0], hy = hp[1], hz = hp[2];
    bowlBox(0.32, 0.28, 0.025, 0.004, M.ral7035, hx, hy, F + 0.027, g);
    bowlBox(0.065, 0.065, hz - 0.16 - F, 0.004, M.ral7035, hx, hy, (hz - 0.16 + F) / 2, g);
    bowlBox(0.24, 0.19, 0.075, 0.006, M.ral7035, hx, hy, hz - 0.115, g);
    const hpSections = [];
    for (const [w, d, z] of [[0.12, 0.11, hz - 0.075], [0.36, 0.30, hz + 0.18]]) hpSections.push([[hx - w / 2, hy - d / 2, z], [hx + w / 2, hy - d / 2, z], [hx + w / 2, hy + d / 2, z], [hx - w / 2, hy + d / 2, z]]);
    mesh(bowlSweep(hpSections), steel, g);
    bowlBox(0.37, 0.31, 0.006, 0.002, steel, hx, hy, hz + 0.183, g);
    bowlBox(0.075, 0.018, 0.02, 0.004, M.blackPlastic, hx, hy, hz + 0.197, g);
    const hpLabel = labelPlane(`RNA BVL 15 · ${b.id}`, 0.15, 0.035, { font: "600 90px sans-serif" }); hpLabel.rotation.x = Math.PI / 2; hpLabel.position.set(hx, hy - 0.112, hz + 0.09); g.add(hpLabel);
    const ca = b.hopper.chute[0], cb = b.hopper.chute[1];
    const nx = -(cb[1] - ca[1]) / Math.hypot(cb[0] - ca[0], cb[1] - ca[1]), ny = (cb[0] - ca[0]) / Math.hypot(cb[0] - ca[0], cb[1] - ca[1]);
    const chuteSection = (p, lo, hi, z0, z1) => [[p[0] + nx * lo, p[1] + ny * lo, p[2] + z0], [p[0] + nx * hi, p[1] + ny * hi, p[2] + z0], [p[0] + nx * hi, p[1] + ny * hi, p[2] + z1], [p[0] + nx * lo, p[1] + ny * lo, p[2] + z1]];
    mesh(bowlSweep([chuteSection(ca, -0.038, 0.038, -0.002, 0), chuteSection(cb, -0.038, 0.038, -0.002, 0)]), steel, g);
    for (const side of [-1, 1]) {
      const lo = side * 0.037 - 0.001, hi = side * 0.037 + 0.001;
      mesh(bowlSweep([chuteSection(ca, lo, hi, 0, 0.028), chuteSection(cb, lo, hi, 0, 0.028)]), steel, g);
    }
    // SLL drive and support. Open centre groove locates the spring/cap/housing without hiding it.
    const L = b.linear, mid = (L.s0 + L.s1) / 2, partH = PART[f.part].h || PART[f.part].free;
    const groove = f.part === "A" ? 0.021 : f.part === "B" ? 0.0075 : 0.013;
    railBox(L.len, L.w, L.h, M.ral7035, mid, 0, PICK.z - L.trackH - L.h / 2);
    railBox(L.len - 0.02, L.w + 0.008, 0.008, M.ral9005, mid, 0, L.column.z1 + 0.004);
    vcyl(0.033, L.column.z1 - F, M.ral7035, ...at(mid, 0, (L.column.z1 + F) / 2), 32, g);
    railBox(0.19, 0.16, 0.025, M.ral7035, mid, 0, F + 0.025);
    railBox(f.track, groove + 0.012, L.trackH, steel, f.track / 2, 0, PICK.z - L.trackH / 2);
    for (const side of [-1, 1]) {
      railBox(f.track - 0.035, 0.004, 0.004, steel, (f.track + 0.035) / 2, side * (groove / 2 + 0.002), PICK.z + 0.002);
      for (const s of [0.08, 0.26, 0.45]) railBox(0.01, 0.006, partH + 0.004, M.alAnodGrey, s, side * (groove / 2 + 0.008), PICK.z + partH / 2);
    }
    railBox(f.track - 0.04, groove + 0.025, 0.002, clear, (f.track + 0.04) / 2, 0, PICK.z + partH + 0.002);
    railBox(0.005, 0.042, 0.012, M.alAnodGrey, -0.026, 0, PICK.z + 0.002);
    railBox(...b.pickNest.block, M.alAnodGrey, 0, 0, PICK.z - b.pickNest.block[2] / 2);
    for (const side of [-1, 1]) railBox(0.026, 0.005, 0.004, M.nestPOM, 0, side * (groove / 2 + 0.003), PICK.z + 0.002);
    const pins = [];
    for (let j = 0; j < 2; j++) {
      const s = f.pitch * (0.35 + j * 0.48), pos = at(s, 0, PICK.z - 0.026);
      vcyl(0.005, 0.026, M.alAnodGrey, ...pos, 16, g);
      const pin = vcyl(0.0012, 0.012, M.chrome, ...at(s, 0, PICK.z), 10, g);
      pin.name = `bowl_${b.id}_escapement_${j}`; pin.userData.bowlMoving = true; pins.push(pin);
    }
    for (const s of [0, 0.12]) {
      const p = at(s, groove / 2 + 0.006, PICK.z + 0.007);
      bowlBar(g, M.chrome, p, at(s, groove / 2 + 0.017, PICK.z + 0.007), 0.003, 0.003);
      tubeAlong([at(s, groove / 2 + 0.017, PICK.z + 0.007), at(s + 0.025, 0.035, PICK.z - 0.02), at(mid, 0.047, L.column.z1)], 0.0008, M.blackPlastic, g, 24, 6);
    }
    const geo = merged(f.part), n = f.q + 2 + 32;
    const im = new THREE.InstancedMesh(geo, PROD_MAT[f.part], n);
    im.castShadow = im.receiveShadow = true; im.frustumCulled = false; im.name = `bowl_${b.id}_flow`;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(im);
    const bulk = new THREE.InstancedMesh(geo, PROD_MAT[f.part], 100); bulk.name = `bowl_${b.id}_bulk`;
    bulk.castShadow = bulk.receiveShadow = true; g.add(bulk);
    const random = mulberry32(400 + b.f), radius = b.rTrack - b.track - 0.022;
    for (let j = 0; j < 100; j++) {
      const r = Math.sqrt(random()) * radius, a = random() * Math.PI * 2, side = j % 4 === 0;
      dummy.position.set(b.cx + r * Math.cos(a), b.cy + r * Math.sin(a), b.bottomZ + boss + 0.014 * (1 - r / (b.rTrack - b.track)) + (side ? groove / 2 : 0) + random() * 0.009);
      dummy.rotation.set(side ? Math.PI / 2 : random() * 0.2, random() * 0.12, random() * Math.PI * 2);
      dummy.updateMatrix(); matrix.copy(dummy.matrix); bulk.setMatrixAt(j, matrix);
    }
    bulk.instanceMatrix.needsUpdate = true;
    flow.push({ b, f, im, pins, length: b.turns * Math.PI * 2 * b.rTrack });
  }
  bowlBake(root);
  return { root, flow };
})();
const bowlMatrix = new THREE.Matrix4(), bowlQuaternion = new THREE.Quaternion(), bowlPosition = new THREE.Vector3();
const bowlScale = new THREE.Vector3(1, 1, 1), bowlEuler = new THREE.Euler();
function updateBowls(t) {
  for (const data of BOWLS.flow) {
    const { b, f, im, pins, length } = data, state = feederState(f.i, t);
    let k = 0;
    for (const entry of state.queue) {
      bowlPosition.set(f.x + f.ux * entry.s, f.y + f.uy * entry.s, PICK.z);
      bowlEuler.set(0, 0, f.a); bowlQuaternion.setFromEuler(bowlEuler);
      bowlMatrix.compose(bowlPosition, bowlQuaternion, bowlScale); im.setMatrixAt(k++, bowlMatrix);
    }
    const retract = state.esc > 0 && state.esc < 1;
    for (const pin of pins) pin.position.z = PICK.z + (retract ? -0.007 : 0.003);
    for (let j = 0; j < 32; j++) {
      const reject = j % 5 === 0, limit = reject ? 0.942 : 0.998, travel = length * limit / 0.065;
      const duration = travel + 0.48, phase = ((t + j * duration / 32) % duration + duration) % duration;
      const u = Math.min(limit, phase * 0.065 / length), sgn = b.dir === "cw" ? 1 : -1;
      const a = b.exitAng + sgn * (1 - u) * b.turns * Math.PI * 2;
      let r = b.rTrack - (1 - u) * 0.01, z = b.bottomZ + (b.outletZ - b.bottomZ) * Math.pow(u, 0.92);
      let tip = 0;
      if (phase > travel) {
        const dt = phase - travel;
        r -= Math.min(0.065, dt * 0.19); z = Math.max(b.bottomZ + 0.008, z - 0.5 * 2.6 * dt * dt); tip = dt * 8;
      } else z += 0.0007 * Math.abs(Math.sin(t * 113 + j * 2.4));
      bowlPosition.set(b.cx + r * Math.cos(a), b.cy + r * Math.sin(a), z);
      bowlEuler.set(tip, 0, a - sgn * Math.PI / 2 + 0.035 * Math.sin(t * 17 + j)); bowlQuaternion.setFromEuler(bowlEuler);
      bowlMatrix.compose(bowlPosition, bowlQuaternion, bowlScale); im.setMatrixAt(k++, bowlMatrix);
    }
    im.count = k; im.instanceMatrix.needsUpdate = true;
  }
}
