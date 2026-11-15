// ---------------------------------------------------------------- outfeed: tray shuttle, trays, empty-tray magazine, full-tray table
// One tray geometry is reused for every tray object to keep the draw-call budget low.
const OUTFEED = (() => {
  const root = moduleRoot("outfeed"), Ls = LAYOUT.tray.shuttle;

  const trayGeo = (() => {
    const list = [];
    const body = new THREE.BoxGeometry(TRAY.w, TRAY.d, TRAY.t);
    body.translate(0, 0, -TRAY.t / 2);
    list.push(body);

    for (let n = 0; n < 24; n++) {
      const [dx, dy] = traySlot(n);
      const pocket = new THREE.CylinderGeometry(0.0105, 0.0105, TRAY.pocket, 18, 1, true);
      pocket.rotateX(Math.PI / 2);
      pocket.translate(dx, dy, TRAY.t / 2 - TRAY.pocket / 2);
      list.push(pocket);

      const floor = new THREE.CylinderGeometry(0.0105, 0.0105, 0.0015, 18, 1, false);
      floor.rotateX(Math.PI / 2);
      floor.translate(dx, dy, TRAY.t / 2 - TRAY.pocket + 0.00075);
      list.push(floor);
    }

    const footGeo = new THREE.BoxGeometry(0.018, 0.018, 0.005);
    const feet = [
      [-TRAY.w / 2 + 0.018, -TRAY.d / 2 + 0.018, -TRAY.t * 0.8],
      [TRAY.w / 2 - 0.018, -TRAY.d / 2 + 0.018, -TRAY.t * 0.8],
      [-TRAY.w / 2 + 0.018, TRAY.d / 2 - 0.018, -TRAY.t * 0.8],
      [TRAY.w / 2 - 0.018, TRAY.d / 2 - 0.018, -TRAY.t * 0.8],
    ];
    for (const [x, y, z] of feet) {
      const f = footGeo.clone();
      f.translate(x, y, z);
      list.push(f);
    }

    const label = new THREE.PlaneGeometry(0.065, 0.022);
    label.translate(0, 0, -0.003);
    list.push(label);

    return BufferGeometryUtils.mergeGeometries(list, false);
  })();

  const trays = Array.from({ length: 6 }, (_, m) => {
    const g = new THREE.Mesh(trayGeo, M.kltBlue.clone());
    g.name = `out_tray_${m}`;
    g.castShadow = g.receiveShadow = true;
    g.visible = false;
    root.add(g);
    return g;
  });

  const shuttle = new THREE.Group();
  shuttle.name = "out_shuttle";
  root.add(shuttle);

  const rail = new THREE.Mesh(new THREE.BoxGeometry(Ls.x1 - Ls.x0, 0.042, 0.032), M.aluClear);
  rail.position.set((Ls.x0 + Ls.x1) / 2, Ls.y, Ls.z);
  shuttle.add(rail);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(Ls.x1 - Ls.x0 - 0.05, 0.016, 0.014), M.aluDark);
  belt.position.set((Ls.x0 + Ls.x1) / 2, Ls.y, Ls.z + 0.012);
  shuttle.add(belt);

  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.070, 20), M.motorBlack);
  motor.rotation.z = Math.PI / 2;
  motor.position.set(Ls.x1 - 0.06, Ls.y, Ls.z + 0.032);
  shuttle.add(motor);

  const gearbox = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), M.gearboxSilver);
  gearbox.position.set(Ls.x1 - 0.12, Ls.y, Ls.z + 0.028);
  shuttle.add(gearbox);

  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 12, 1, true), M.aluDark);
  chain.rotation.z = Math.PI / 2;
  chain.position.set((Ls.x0 + Ls.x1) / 2, Ls.y + 0.028, Ls.z - 0.012);
  shuttle.add(chain);

  const carriage = new THREE.Group();
  carriage.name = "out_carriage";
  shuttle.add(carriage);
  const carriagePlate = rbox(0.135, 0.120, 0.018, 0.003, M.alAnodGrey, 0, 0, -0.030, carriage);
  carriagePlate.position.z = -0.010;
  for (const [dx, dy] of [[-0.040, 0.036], [0.040, 0.036], [-0.040, -0.036], [0.040, -0.036]]) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 12), M.steel);
    pin.rotation.x = Math.PI / 2;
    pin.position.set(dx, dy, -0.028);
    carriage.add(pin);
  }

  const magazine = new THREE.Group();
  magazine.name = "out_magazine";
  root.add(magazine);
  const magX = LAYOUT.tray.magazine.x, magY = LAYOUT.tray.magazine.y;
  for (let i = 0; i < 6; i++) {
    const tray = new THREE.Mesh(trayGeo, M.kltBlue.clone());
    tray.name = `out_magazine_tray_${i}`;
    tray.castShadow = tray.receiveShadow = true;
    tray.visible = i < 6;
    tray.position.set(magX, magY, 0.025 + i * 0.020);
    magazine.add(tray);
  }

  const fullTable = new THREE.Group();
  fullTable.name = "out_fullTable";
  root.add(fullTable);
  const tableBed = rbox(0.32, 0.18, 0.035, 0.006, M.ral7035, LAYOUT.tray.fullTable.x, LAYOUT.tray.fullTable.y, TRAY.top - 0.03, fullTable);
  tableBed.position.z = TRAY.top - 0.03;
  for (let i = 0; i < 5; i++) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.17, 16), M.steel);
    roller.rotation.z = Math.PI / 2;
    roller.position.set(LAYOUT.tray.fullTable.x - 0.10 + i * 0.05, LAYOUT.tray.fullTable.y, TRAY.top - 0.02);
    fullTable.add(roller);
  }
  const pusher = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.13, 18), M.aluClear);
  pusher.rotation.z = Math.PI / 2;
  pusher.position.set(LAYOUT.tray.fullTable.x + 0.06, LAYOUT.tray.fullTable.y, TRAY.top - 0.02);
  fullTable.add(pusher);

  return { root, trays, shuttle, carriage, pusher, magazine, fullTable };
})();

function updateOutfeed(t) {
  const trayPos = (m) => trayPose(m, t);
  const fillPos = [TRAY.cx, TRAY.cy, TRAY.top];

  OUTFEED.trays.forEach((g, m) => {
    const p = trayPos(m);
    g.visible = !!p && !(m > 0 && p[2] === fillPos[2] && Math.abs(p[0] - fillPos[0]) < 1e-6 && Math.abs(p[1] - fillPos[1]) < 1e-6);
    if (p) g.position.set(p[0], p[1], p[2] - TRAY.t / 2);
  });

  const activeSwap = trayLog.swaps.find((sw) => t >= sw.t0 && t <= sw.t3);
  const target = activeSwap ? trayPos(activeSwap.m) : fillPos;
  OUTFEED.carriage.visible = !!target;
  if (target) {
    OUTFEED.carriage.position.set(target[0], target[1], target[2] - TRAY.t / 2);
  }

  const magazineTrays = OUTFEED.magazine.children.filter((c) => c.isMesh && c.name.startsWith("out_magazine_tray_"));
  const completed = trayLog.swaps.filter((s) => t >= s.t3).length;
  const stackCount = Math.max(0, 6 - completed);
  magazineTrays.forEach((tray, i) => {
    tray.visible = i < stackCount;
    if (tray.visible) {
      tray.position.set(LAYOUT.tray.magazine.x, LAYOUT.tray.magazine.y, 0.025 + i * 0.020 + (completed ? 0 : 0));
    }
  });

  const sw = trayLog.swaps.find((s) => t >= s.t1 && t <= s.t2);
  const pusherPhase = sw ? clamp((t - sw.t1) / Math.max(1e-6, sw.t2 - sw.t1), 0, 1) : 0;
  OUTFEED.pusher.visible = !!sw;
  OUTFEED.pusher.position.x = LAYOUT.tray.fullTable.x + 0.085 + pusherPhase * 0.09;
}
