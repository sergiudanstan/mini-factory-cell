// ---------------------------------------------------------------- dial: indexer, dial plate + nests, centre column, star plate, S4-S6, S8
// M0 STUB (owner: dial task). Contract, fixed: DIALM.root (module "dial"); updateDial(t) drives
//   - the dial plate + 8 nests from dialAngle(t) (group DIALM.plate rotates about the dial centre),
//   - the S4 press ram from pressState(t).z (tool face z), the S5 flash from visionState(t).flash,
//   - the S6 reject unit from rejectState(t) / rejectTCP(), the S8 sensor LED.
// Geometry must match TOOL / PZ / TOOL.rej in the logic (the clearance capsules are built from the same numbers).
const DIALM = (() => {
  const root = moduleRoot("dial"), I = LAYOUT.indexer;
  rbox(I.w, I.d, I.z1 - I.z0, 0.006, M.ral7035, DIAL.cx, DIAL.cy, (I.z0 + I.z1) / 2, root);
  const mot = vcyl(I.motor.r, I.motor.len, M.ral7035, DIAL.cx - I.w / 2 - I.motor.len / 2, DIAL.cy, I.motor.z, 32, root); mot.rotation.set(0, 0, Math.PI / 2);
  const plate = new THREE.Group(); plate.name = "dial_plate"; plate.position.set(DIAL.cx, DIAL.cy, 0); root.add(plate);
  const disc = lathe([[0.075, DIAL.top - DIAL.t], [DIAL.r, DIAL.top - DIAL.t], [DIAL.r, DIAL.top], [0.075, DIAL.top]], M.alAnodGrey, plate, 96);
  const nests = [];
  for (let n = 0; n < DIAL.n; n++) {
    const a = STATIONS[n].a, g = new THREE.Group(); g.name = `dial_nest_${n}`;
    g.position.set(DIAL.nestR * Math.cos(a), DIAL.nestR * Math.sin(a), 0); g.rotation.z = a; plate.add(g);
    rbox(0.060, 0.080, DIAL.nestTop - DIAL.top, 0.003, M.nestPOM, 0, 0, (DIAL.nestTop + DIAL.top) / 2, g);
    nests.push(g);
  }
  // centre column, star hub and arms (TOOL in the logic)
  vcyl(TOOL.column.r, TOOL.column.z1 - TOOL.column.z0, M.steel, 0, 0, (TOOL.column.z0 + TOOL.column.z1) / 2, 32, root);
  vcyl(TOOL.star.hubR, TOOL.star.z1 - TOOL.star.z0, M.alAnodGrey, 0, 0, (TOOL.star.z0 + TOOL.star.z1) / 2, 48, root);
  for (const s of TOOL.star.stations) {
    const a = st(s).a, len = TOOL.star.armEnd - TOOL.star.hubR + 0.03, r0 = (TOOL.star.hubR + TOOL.star.armEnd) / 2;
    const arm = rbox(len, TOOL.star.armW, TOOL.star.z1 - TOOL.star.z0, 0.003, M.alAnodGrey, r0 * Math.cos(a), r0 * Math.sin(a), (TOOL.star.z0 + TOOL.star.z1) / 2, root);
    arm.rotation.z = a;
  }
  // S4 servo press: body + ram (moves), anvil under the dial
  const S4 = st(4);
  vcyl(TOOL.press.r, TOOL.press.z1 - 0.36, M.ral7035, S4.x, S4.y, (TOOL.press.z1 + 0.36) / 2, 32, root);
  const ram = new THREE.Group(); ram.name = "dial_press_ram"; ram.position.set(S4.x, S4.y, 0); root.add(ram);
  vcyl(0.008, 0.10, M.chrome, 0, 0, 0.05, 16, ram); vcyl(0.010, 0.010, M.steel, 0, 0, 0.005, 16, ram);
  vcyl(LAYOUT.anvil.r, LAYOUT.anvil.z1 - LAYOUT.anvil.z0, M.steel, S4.x, S4.y, (LAYOUT.anvil.z0 + LAYOUT.anvil.z1) / 2, 24, root);
  // S5 camera + ring light
  const S5 = st(5);
  rbox(0.05, 0.05, TOOL.camera.z1 - TOOL.camera.z0, 0.004, M.t3Dark, S5.x, S5.y, (TOOL.camera.z0 + TOOL.camera.z1) / 2, root);
  const ringMat = M.lampGreen.clone(); ringMat.emissive.set(0xffffff); ringMat.emissiveIntensity = 0;
  const ring = mesh(new THREE.TorusGeometry(TOOL.camera.ringR - 0.008, 0.008, 12, 40), ringMat, root); ring.position.set(S5.x, S5.y, TOOL.camera.ringZ);
  // S6 reject unit: rail + carriage + gripper (moves)
  const S6 = st(6);
  const rail = rbox(TOOL.rej.out + 0.08, 0.03, 0.03, 0.003, M.aluClear, S6.x + Math.cos(S6.a) * TOOL.rej.out / 2, S6.y + Math.sin(S6.a) * TOOL.rej.out / 2, TOOL.rej.railZ, root);
  rail.rotation.z = S6.a;
  const rej = new THREE.Group(); rej.name = "dial_reject"; root.add(rej);
  rbox(0.03, 0.03, 0.12, 0.003, M.aluDark, 0, 0, 0.06, rej);
  // S8 sensor bracket
  const S8 = st(8), tx = -Math.sin(S8.a) * TOOL.s8.offset, ty = Math.cos(S8.a) * TOOL.s8.offset;
  vcyl(0.008, TOOL.s8.z1 - TOOL.s8.z0, M.aluClear, S8.x + tx, S8.y + ty, (TOOL.s8.z0 + TOOL.s8.z1) / 2, 12, root);
  // reject chute + bin
  const B = BIN;
  rbox(B.w, B.d, B.h, 0.004, M.ral3020, B.x, B.y, B.floor - 0.01 + B.h / 2 - 0.02, root);
  return { root, plate, nests, ram, ring, ringMat, rej };
})();
function updateDial(t) {
  DIALM.plate.rotation.z = dialAngle(t);
  const p = pressState(t); DIALM.ram.position.z = p.z;
  const v = visionState(t); DIALM.ringMat.emissiveIntensity = 2.5 * v.flash;
  const r = rejectState(t), tcp = rejectTCP(r); DIALM.rej.position.set(tcp[0], tcp[1], tcp[2]);
}
