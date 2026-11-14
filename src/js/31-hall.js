// ---------------------------------------------------------------- hall: building, floor, lighting fixtures and props around the cell
// M0 STUB (owner: hall task). Contract, fixed: HALL.root (module "hall"); updateHall(t) (optional animation, may be empty).
// The hall floor is the floor of the whole scene (z = LAYOUT.floor). ?hall=0 hides the hall except its floor.
const HALL = (() => {
  const root = moduleRoot("hall"), H = LAYOUT.hall, F = LAYOUT.floor;
  const floorMat = M.floor.clone(); floorMat.map = epoxyMap.clone(); floorMat.map.repeat.set(24, 14); floorMat.map.needsUpdate = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(H.x1 - H.x0, H.y1 - H.y0), floorMat);
  floor.position.set((H.x0 + H.x1) / 2, (H.y0 + H.y1) / 2, F); floor.receiveShadow = true; floor.name = "hall_floor"; root.add(floor);
  const wall = phys(0xd5d8da, 0.7, 0.2);
  const w = (len, x, y, rot) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(len, H.h), wall); o.rotation.set(Math.PI / 2, rot, 0); o.position.set(x, y, F + H.h / 2); root.add(o); return o; };
  const walls = new THREE.Group(); root.add(walls);
  [w(H.x1 - H.x0, (H.x0 + H.x1) / 2, H.y1, Math.PI), w(H.y1 - H.y0, H.x0, (H.y0 + H.y1) / 2, Math.PI / 2), w(H.y1 - H.y0, H.x1, (H.y0 + H.y1) / 2, -Math.PI / 2)].forEach((o) => walls.add(o));
  if (QS.get("hall") === "0") walls.visible = false;
  return { root, floor, floorMat, walls };
})();
const floorMat = HALL.floorMat;
function updateHall(t) {}
