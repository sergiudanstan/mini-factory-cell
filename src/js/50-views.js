// ---------------------------------------------------------------- TCP paths (cell frame, under world)
function pathLine(points, colorVar) {
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(points.flat()), 3));
  const ghost = new THREE.Line(g, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.22 }));
  const live = new THREE.Line(g.clone(), new THREE.LineBasicMaterial({}));
  ghost.visible = live.visible = false;
  world.add(ghost, live); return { ghost, live, colorVar };
}
const paths = [pathLine(S.dp, "--delta"), pathLine(S.tp, "--scara")];
function rebuildPaths() {
  const src = [S.dp, S.tp];
  paths.forEach((p, i) => {
    for (const line of [p.ghost, p.live]) {
      line.geometry.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(src[i].flat()), 3));
      line.geometry = g;
    }
    p.live.geometry.setDrawRange(0, 0);
  });
}
function applyTheme() {
  const top = new THREE.Color(css("--scene-top")), bottom = new THREE.Color(css("--scene-bottom"));
  const c = document.createElement("canvas"); c.width = 2; c.height = 256;
  const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "#" + top.getHexString()); gr.addColorStop(1, "#" + bottom.getHexString());
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; scene.background = tex;
  scene.environmentIntensity = themeIsDark() ? 0.5 : 0.7;
  for (const p of paths) { const col = new THREE.Color(css(p.colorVar)); p.ghost.material.color.copy(col); p.live.material.color.copy(col); }
  if (typeof uiThemeChanged === "function") uiThemeChanged();
}

// ---------------------------------------------------------------- camera views. Written in the cell frame (x, y, z up) and
// converted to three.js scene space: cell (x, y, z) -> scene (x, z, -y).
const cv = (x, y, z) => V(x, z, -y);
const VIEW_DEFS = {
  hall:    { label: "Hall",     pos: [6.2, -7.4, 3.6],   target: [0.0, 0.40, 0.10] },
  iso:     { label: "Iso",      pos: [2.75, -3.05, 1.85], target: [0.0, 0.15, 0.25] },
  front:   { label: "Front",    pos: [0.0, -3.70, 0.85], target: [0.0, 0.10, 0.30] },
  top:     { label: "Top",      pos: [0.0, 0.16, 5.4],   target: [0.0, 0.18, 0.0] },
  bowls:   { label: "Bowls",    pos: [0.15, -0.85, 1.55], target: [0.0, 0.80, 0.20] },
  feederA: { label: "Feeder A", pos: [-0.30, 0.05, 0.72], target: [-0.80, 0.70, 0.18] },
  dial:    { label: "Dial",     pos: [0.80, -1.00, 0.90], target: [0.0, 0.0, 0.22] },
  delta:   { label: "Delta",    pos: [1.15, -0.65, 1.05], target: [0.0, 0.35, 0.45] },
  press:   { label: "Press",    pos: [0.66, -0.26, 0.44], target: [0.30, 0.0, 0.27] },
  vision:  { label: "Vision",   pos: [0.55, -0.58, 0.44], target: [0.21, -0.21, 0.25] },
  scara:   { label: "SCARA",    pos: [-1.18, -1.00, 0.98], target: [-0.42, -0.38, 0.30] },   // inside the guard corner, clear of the posts and the guard
  tray:    { label: "Tray",     pos: [-0.62, -1.03, 0.60], target: [-0.33, -0.60, 0.17] },   // inside the guard, clear of the front panel
};
const views = Object.fromEntries(Object.entries(VIEW_DEFS).map(([k, v]) => [k, { label: v.label, pos: cv(...v.pos), target: cv(...v.target) }]));
window.pcViews = views;
const UI_VIEW_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];   // keys follow the toolbar order
{
  const host = $("views");
  Object.entries(views).forEach(([k, v], i) => {
    const b = document.createElement("button"), key = UI_VIEW_KEYS[i];
    b.type = "button"; b.dataset.view = k; b.innerHTML = `<span>${v.label}</span>${key ? `<kbd>${key}</kbd>` : ""}`;
    b.title = key ? `${v.label} view (key ${key})` : `${v.label} view`;
    if (key) b.setAttribute("aria-keyshortcuts", key);
    b.setAttribute("aria-pressed", String(k === "iso")); host.appendChild(b);
  });
}
let flight = null;
function setView(name) {
  const v = views[name]; if (!v) return;
  if (camera.fov !== 34) { camera.fov = 34; camera.updateProjectionMatrix(); }   // a film fov never sticks to the views
  flight = { t: 0, fromP: camera.position.clone(), fromT: controls.target.clone(), toP: v.pos.clone(), toT: v.target.clone() };
  document.querySelectorAll(".views button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === name)));
}
camera.position.copy(views.iso.pos); controls.target.copy(views.iso.target);
document.querySelectorAll(".views button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
controls.addEventListener("start", () => { flight = null; document.querySelectorAll(".views button").forEach((b) => b.setAttribute("aria-pressed", "false")); });
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
