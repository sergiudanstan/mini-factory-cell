// ---------------------------------------------------------------- frame: machine base, guard, delta portal, stack light, HMI, cabinet
// M0 STUB (owner: frame task). Contract, fixed:
//   FRAME.root (module "frame"); FRAME.guards (group toggled by the Guards switch: setGuards(on));
//   setStack(state) with state "run" | "hold" | "alarm" | "call" (4-tier tower light: red, amber, green, blue);
//   hmiScreen = { canvas, texture } (512 x 384 canvas painted by the loop every 0.5 s).
const FRAME = (() => {
  const root = moduleRoot("frame"), Lb = LAYOUT.base, G = LAYOUT.guard, P = LAYOUT.portal, F = LAYOUT.floor;
  // machine base: top plate + frame + panels
  rbox(Lb.x1 - Lb.x0, Lb.y1 - Lb.y0, Lb.plate, 0.003, M.ground, (Lb.x0 + Lb.x1) / 2, (Lb.y0 + Lb.y1) / 2, -Lb.plate / 2, root);
  rbox(Lb.x1 - Lb.x0 - 0.04, Lb.y1 - Lb.y0 - 0.04, -F - Lb.plate - Lb.foot, 0.004, M.ral7035, (Lb.x0 + Lb.x1) / 2, (Lb.y0 + Lb.y1) / 2, (F + Lb.foot - Lb.plate) / 2, root);
  // guard posts and top rails (profiles), PC panels
  const guards = new THREE.Group(); guards.name = "guards"; root.add(guards);
  const zt = G.top, zb = F + G.gap;
  for (const x of G.postsX) for (const y of [G.y0, G.y1]) profileBeam(V(x, y, F), V(x, y, zt), root);
  for (const y of G.postsY) for (const x of [G.x0, G.x1]) profileBeam(V(x, y, F), V(x, y, zt), root);
  for (const y of [G.y0, G.y1]) { profileBeam(V(G.x0, y, zt - 0.02), V(G.x1, y, zt - 0.02), root); profileBeam(V(G.x0, y, zb), V(G.x1, y, zb), root); }
  for (const x of [G.x0, G.x1]) { profileBeam(V(x, G.y0, zt - 0.02), V(x, G.y1, zt - 0.02), root); profileBeam(V(x, G.y0, zb), V(x, G.y1, zb), root); }
  const pc = M.pcClear.clone(); pc.color.set(0xb7c3cc); pc.opacity = 0.18;
  const panel = (w, h, x, y, z, rotZ) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pc); o.rotation.set(Math.PI / 2, rotZ, 0); o.position.set(x, y, z); guards.add(o); return o; };
  const ph = zt - zb - 0.04, pz = (zt + zb) / 2;
  panel(G.x1 - G.x0, ph, 0, G.y0, pz, 0); panel(G.x1 - G.x0, ph, 0, G.y1, pz, 0);
  panel(G.y1 - G.y0, ph, G.x0, (G.y0 + G.y1) / 2, pz, Math.PI / 2); panel(G.y1 - G.y0, ph, G.x1, (G.y0 + G.y1) / 2, pz, Math.PI / 2);
  // delta portal (floor-standing steel), mount plate
  for (const [x, y] of P.posts) rbox(P.post, P.post, P.z1 - F, 0.004, M.ral7016, x, y, (P.z1 + F) / 2, root);
  for (const y of P.beamY) rbox(1.90 + P.post, P.beam[0], P.z1 - P.z0, 0.004, M.ral7016, 0, y, (P.z0 + P.z1) / 2, root);
  for (const x of P.crossX) rbox(P.beam[0], P.beamY[1] - P.beamY[0], P.z1 - P.z0, 0.004, M.ral7016, x, (P.beamY[0] + P.beamY[1]) / 2, (P.z0 + P.z1) / 2, root);
  rbox(P.plate.w, P.plate.d, P.plate.z1 - P.plate.z0, 0.003, M.aluClear, P.plate.x, P.plate.y, (P.plate.z0 + P.plate.z1) / 2, root);
  // tower light on the front-right post
  const S = LAYOUT.stack, lamps = {};
  const tierMat = { red: M.lampRed, amber: M.lampAmber, green: M.lampGreen, blue: M.lampBlue };
  vcyl(0.012, 0.15, M.blackPlastic, S.x, S.y, zt + 0.075, 16, root);
  S.tiers.forEach((c, i) => { lamps[c] = tierMat[c]; vcyl(0.03, 0.05, tierMat[c], S.x, S.y, zt + 0.17 + (3 - i) * 0.052, 24, root); });
  // HMI on a swing arm
  const H = LAYOUT.hmi, hmi = new THREE.Group(); hmi.position.set(H.x - 0.10, H.y - 0.25, H.z); hmi.rotation.z = -0.35; root.add(hmi);
  rbox(0.40, 0.06, 0.30, 0.01, M.t3Dark, 0, 0, 0, hmi);
  const hc = document.createElement("canvas"); hc.width = 512; hc.height = 384;
  const ht = new THREE.CanvasTexture(hc); ht.colorSpace = THREE.SRGBColorSpace;
  const hs = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.25), new THREE.MeshStandardMaterial({ map: ht, emissive: 0xffffff, emissiveMap: ht, emissiveIntensity: 0.35, roughness: 0.4 }));
  hs.rotation.x = Math.PI / 2; hs.position.set(0, -0.031, 0); hmi.add(hs);
  // electrical cabinet outside the guard
  const C = LAYOUT.cabinet;
  rbox(C.w, C.d, C.h, 0.006, M.ral7035, C.x, C.y, F + C.plinth + C.h / 2, root);
  rbox(C.w, C.d, C.plinth, 0.004, M.ral9005, C.x, C.y, F + C.plinth / 2, root);
  return { root, guards, lamps, hmiScreen: { canvas: hc, texture: ht } };
})();
const hmiScreen = FRAME.hmiScreen;
function setGuards(on) { FRAME.guards.visible = !!on; }
let frameStack = "";
function setStack(state) {
  if (state === frameStack) return;
  frameStack = state;
  const L = FRAME.lamps;
  L.green.emissiveIntensity = state === "run" ? 1.6 : 0;
  L.amber.emissiveIntensity = state === "hold" ? 1.6 : 0;
  L.red.emissiveIntensity = state === "alarm" ? 1.6 : 0;
  L.blue.emissiveIntensity = state === "call" ? 1.6 : 0;
}
