// ---------------------------------------------------------------- outfeed: tray shuttle, trays, empty-tray magazine, full-tray table
// M0 STUB (owner: outfeed task). Contract, fixed: OUTFEED.root (module "outfeed"); updateOutfeed(t) places the trays
// from trayPose(m, t) (centre of the tray top face) and the shuttle carriage from the tray on it.
// The assemblies in the trays are drawn by the loop (tracked parts) at trayPose(m, t) + traySlot(n).
const OUTFEED = (() => {
  const root = moduleRoot("outfeed"), Ls = LAYOUT.tray.shuttle;
  rbox(Ls.x1 - Ls.x0, 0.12, 0.03, 0.003, M.aluClear, (Ls.x0 + Ls.x1) / 2, Ls.y, Ls.z, root);
  const trays = [0, 1, 2].map((m) => {
    const g = new THREE.Group(); g.name = `out_tray_${m}`; root.add(g);
    rbox(TRAY.w, TRAY.d, TRAY.t, 0.004, M.kltBlue, 0, 0, -TRAY.t / 2, g);
    g.visible = false; return g;
  });
  return { root, trays };
})();
function updateOutfeed(t) {
  OUTFEED.trays.forEach((g, m) => { const p = trayPose(m, t); g.visible = !!p; if (p) g.position.set(p[0], p[1], p[2]); });
}
