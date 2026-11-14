// ---------------------------------------------------------------- UI: panels, now overlay, program, timing, process, feeders, joints, report, what-if, jog
const ACTOR_NAME = { dial: "DIAL", delta: "DELTA", press: "PRESS", vision: "VISION", reject: "REJECT", scara: "T3", tray: "TRAY", feedA: "FEED A", feedB: "FEED B", feedC: "FEED C" };
const ACTOR_LONG = { dial: "Dial (TC220T, 8 st.)", delta: "Delta robot", press: "S4 servo press", vision: "S5 vision", reject: "S6 reject unit",
                     scara: "Epson T3-B401S", tray: "Tray shuttle", feedA: "Feeder A · housing", feedB: "Feeder B · spring", feedC: "Feeder C · cap" };
const ACTOR_CHIP = { dial: "dial", delta: "delta", press: "press", vision: "vision", reject: "reject", scara: "scara", tray: "tray", feedA: "feed", feedB: "feed", feedC: "feed" };
const ACTOR_VAR = Object.fromEntries(Object.entries(ACTOR_CHIP).map(([a, c]) => [a, `--${c}`]));
const NOW_ACTORS = ["dial", "delta", "press", "vision", "reject", "scara"];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "–");
let mode = "program";

// ---- panels
const openPanels = { program: new Set(["live-card", "program-card"]), manual: new Set(["live-card", "jog-card"]) };
if (matchMedia("(max-width: 900px)").matches) { openPanels.program.clear(); openPanels.manual.clear(); }
function syncPanels() {
  const open = openPanels[mode];
  document.querySelectorAll(".rail-item").forEach((b) => {
    const allowed = b.dataset.modes.split(" ").includes(mode);
    b.hidden = !allowed; b.setAttribute("aria-pressed", String(allowed && open.has(b.dataset.panel)));
  });
  let any = false;
  document.querySelectorAll(".drawer .card").forEach((c) => { const show = open.has(c.id); c.hidden = !show; any = any || show; });
  $("drawer").hidden = !any;
  requestAnimationFrame(() => { resize(); fitComposer(); });
}
document.querySelectorAll(".rail-item").forEach((b) => b.addEventListener("click", () => {
  const set = openPanels[mode], id = b.dataset.panel;
  if (set.has(id)) set.delete(id); else set.add(id);
  syncPanels();
}));
document.querySelectorAll(".card .close").forEach((b) => b.addEventListener("click", () => { openPanels[mode].delete(b.closest(".card").id); syncPanels(); }));
const panelOpen = (id) => openPanels[mode].has(id) && !$("drawer").hidden;

// ---- now overlay
const nowEls = {};
for (const a of NOW_ACTORS) {
  const row = el("div", "now-row", `<span class="chip ${ACTOR_CHIP[a]}">${ACTOR_NAME[a]}</span><div class="what"><b id="now-${a}">–</b><span id="verdict-${a}"></span><code id="cmd-${a}"></code></div>`);
  $("now").appendChild(row);
  nowEls[a] = [row.querySelector("b"), row.querySelector("code"), row.querySelector(`#verdict-${a}`)];
}
let lastSegs = {};
function showNow(a, s) {
  if (!nowEls[a] || lastSegs[a] === s) return; lastSegs[a] = s;
  nowEls[a][0].textContent = s.label; nowEls[a][1].textContent = s.cmd || "";
  let v = "";
  if (a === "vision" && s.kind === "process") v = `<span class="verdict ${s.pass ? "pass" : "fail"}">${s.pass ? "PASS" : "FAIL"}</span>`;
  if (a === "press" && s.kind === "press" && s.test) v = `<span class="verdict ${s.test.pass ? "pass" : "fail"}">${s.test.pass ? "OK" : "NOK"}</span>`;
  nowEls[a][2].innerHTML = v;
}

// ---- zone legend (who owns S1..S8 now)
const zoneDots = STATIONS.map((stn) => {
  const sp = el("span", "", `<i></i>${stn.code}`); $("zone-legend").appendChild(sp); return sp.querySelector("i");
});
let lastOwners = [];
function showOwners(t) {
  STATIONS.forEach((stn, i) => {
    const o = zoneOwner(stn.s, t);
    if (o === lastOwners[i]) return; lastOwners[i] = o;
    zoneDots[i].style.background = o ? `var(${ACTOR_VAR[o]})` : "var(--faint)";
  });
}

// ---- program list
let programItems = [], programRows = [], programFilter = "all";
{
  const host = $("program-filter");
  for (const a of ["all", ...ACTORS]) {
    const b = el("button", "", a === "all" ? "All" : ACTOR_NAME[a]); b.type = "button"; b.dataset.actor = a; b.setAttribute("aria-pressed", String(a === "all"));
    b.addEventListener("click", () => { programFilter = a; host.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); applyProgramFilter(); });
    host.appendChild(b);
  }
}
function buildProgram() {
  programItems = [];
  for (const a of ACTORS) for (const s of segs[a]) if (s.kind !== "wait") programItems.push({ ...s, actor: a, seg: s });
  programItems.sort((p, q) => p.t0 - q.t0);
  const list = $("program"); list.innerHTML = "";
  const frag = document.createDocumentFragment();
  programRows = programItems.map((it) => {
    const li = el("li", "", `<span class="fill"></span><span class="chip ${ACTOR_CHIP[it.actor]}">${ACTOR_NAME[it.actor]}</span><span class="label">${it.label}<small>${it.t0.toFixed(2)} s</small></span><span class="dur">${(it.t1 - it.t0).toFixed(2)}</span><code>${it.cmd || ""}</code>`);
    li.addEventListener("click", () => seek(it.t0 + 1e-4));
    frag.appendChild(li); return li;
  });
  list.appendChild(frag);
  $("program-total").textContent = `${programItems.length} steps · ${DURATION.toFixed(1)} s`;
  applyProgramFilter();
  progLo = 0; progActive = new Set();
}
function applyProgramFilter() { programItems.forEach((it, n) => { programRows[n].hidden = programFilter !== "all" && it.actor !== programFilter; }); }
let progLo = 0, progActive = new Set(), lastFirstActive = null;
function updateProgram(t) {
  if (!panelOpen("program-card")) return;
  while (progLo > 0 && programItems[progLo].t0 > t - 4) progLo--;
  while (progLo < programItems.length - 1 && programItems[progLo].t1 < t - 4) progLo++;
  const now = new Set();
  for (let n = progLo; n < programItems.length && programItems[n].t0 <= t; n++) if (t < programItems[n].t1) now.add(n);
  for (const n of progActive) if (!now.has(n)) { const li = programRows[n]; li.classList.remove("active"); li.classList.add("done"); li.querySelector(".fill").style.width = "0"; }
  let first = null;
  for (const n of now) {
    const li = programRows[n], it = programItems[n];
    li.classList.add("active"); li.classList.remove("done");
    li.querySelector(".fill").style.width = `${((t - it.t0) / (it.t1 - it.t0)) * 100}%`;
    if (!first && !li.hidden) first = li;
  }
  progActive = now;
  if (first && first !== lastFirstActive && playing) { lastFirstActive = first; $("program").scrollTop = first.offsetTop - 60; }
}

// ---- timing: gantt + lanes
function busy(a) { return segs[a].filter((s) => s.kind !== "wait").reduce((n, s) => n + s.t1 - s.t0, 0); }
function renderGantt() {
  const W = 330, rowH = 14, top = 6, H = top + ACTORS.length * rowH + 16, x = (t) => 64 + (t / DURATION) * (W - 70);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Busy time per actor">`;
  ACTORS.forEach((a, i) => {
    const y = top + i * rowH, col = css(ACTOR_VAR[a]);
    svg += `<text x="0" y="${y + 10}">${ACTOR_NAME[a]}</text><rect x="64" y="${y + 2}" width="${W - 70}" height="${rowH - 5}" rx="2" fill="${css("--panel-2")}"/>`;
    for (const s of segs[a]) if (s.kind !== "wait") svg += `<rect x="${x(s.t0).toFixed(2)}" y="${y + 2}" width="${Math.max(0.4, x(s.t1) - x(s.t0)).toFixed(2)}" height="${rowH - 5}" fill="${col}"/>`;
  });
  for (let t = 0; t <= DURATION; t += 10) svg += `<text x="${x(t)}" y="${H - 2}" text-anchor="middle">${t}</text>`;
  svg += "</svg>";
  const util = STATS.util;
  const leg = ACTORS.map((a) => `<i style="background:var(${ACTOR_VAR[a]})"></i><span>${ACTOR_LONG[a]}</span><span class="n">${busy(a).toFixed(1)} s</span><span class="n">${Math.round(util[a] * 100)} %</span>`).join("");
  $("gantt").innerHTML = `${svg}<div class="legend">${leg}</div><p class="note">Bottleneck: <b>${ACTOR_LONG[STATS.bottleneck]}</b> · cycle <b>${CYCLE.toFixed(3)} s</b> · <b>${Math.round(3600 / CYCLE)}</b> parts/h</p>`;
}
const lanesCanvas = $("lanes");
function drawLanes() {
  const r = lanesCanvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  lanesCanvas.width = Math.max(1, Math.round(r.width * dpr)); lanesCanvas.height = Math.max(1, Math.round(r.height * dpr));
  const g = lanesCanvas.getContext("2d"), W = lanesCanvas.width, H = lanesCanvas.height, lane = ["dial", "delta", "press", "vision", "reject", "scara", "tray"], h = H / lane.length;
  g.clearRect(0, 0, W, H);
  lane.forEach((a, i) => {
    g.fillStyle = css("--line"); g.fillRect(0, i * h + h * 0.2, W, h * 0.6);
    g.fillStyle = css(ACTOR_VAR[a]);
    for (const s of segs[a]) if (s.kind !== "wait") g.fillRect((s.t0 / DURATION) * W, i * h + h * 0.2, Math.max(1, ((s.t1 - s.t0) / DURATION) * W), h * 0.6);
  });
  g.fillStyle = css("--bad");
  for (const rj of marks.reject) g.fillRect((rj.t0 / DURATION) * W - dpr, 0, 2 * dpr, H);
  $("clock-total").textContent = DURATION.toFixed(1);
}

// ---- live card
const liveStats = [["cycle", "Cycle", "s"], ["rate", "Throughput", "/h"], ["good", "Good", ""], ["rej", "Rejected", ""], ["clear", "Min. clearance", "mm"], ["force", "S4 force", "N"]];
for (const [k, label, unit] of liveStats) $("live-stats").appendChild(el("div", "stat", `<small>${label}</small><div class="value"><span id="ls-${k}">–</span><em>${unit}</em></div><div class="sub" id="ls-${k}-sub"></div>`));
const trayCells = Array.from({ length: CAP }, () => { const d = el("div"); $("tray-map").appendChild(d); return d; });
$("live-legend").innerHTML = `<span><i style="background:var(--part-a)"></i>A housing</span><span><i style="background:var(--part-b)"></i>B spring</span><span><i style="background:var(--part-c)"></i>C cap</span>`;
let lastTraySig = "", lastDialSig = "";
function nestContents(t) {   // what each nest holds now: "", "A", "AB", "ABC", "ABC*" (pressed), "X" (reject)
  const out = Array(8).fill("");
  for (const p of parts) {
    let k = null; for (const e of p.track) { if (e.t <= t) k = e; else break; }
    if (!k || (k.mode !== "dial" && k.mode !== "fall")) continue;
    const A = assemblies.get(p.a); out[k.n] += p.type;
    if (A && p.type === "C" && A.press && t >= (marks.press.find((m) => m.a === p.a)?.t1 ?? Infinity)) out[k.n] += "*";
  }
  return out.map((s) => [...new Set(s.split(""))].sort().join(""));
}
function updateLive(t, info) {
  $("ls-cycle").textContent = CYCLE.toFixed(2); $("ls-cycle-sub").textContent = `index ${DIAL.index.toFixed(2)} s`;
  $("ls-rate").textContent = Math.round(3600 / CYCLE); $("ls-rate-sub").textContent = "steady state";
  const good = marks.place.filter((p) => p.t <= t).length, rej = marks.reject.filter((r) => r.t0 <= t).length;
  $("ls-good").textContent = good; $("ls-good-sub").textContent = "placed in trays";
  $("ls-rej").textContent = rej; $("ls-rej-sub").textContent = rej ? marks.reject.filter((r) => r.t0 <= t).at(-1).reason.split(":")[0] : "none yet";
  $("ls-clear").textContent = Number.isFinite(info.clear) ? Math.round(info.clear * 1000) : "–"; $("ls-clear").className = info.clear < 0.025 ? "warn" : "";
  $("ls-clear-sub").textContent = PAIRS[info.pair].join(" ↔ ");
  $("ls-force").textContent = fmt(info.press.F, 1); $("ls-force-sub").textContent = info.press.a != null && info.press.seg.kind !== "wait" ? `assembly ${info.press.a}` : "ram up";
  // tray at the fill position
  const ts = trayState(t), atFill = ts.trays.find((tr) => tr.p && Math.abs(tr.p[0] - TRAY.cx) < 1e-6 && Math.abs(tr.p[2] - TRAY.top) < 1e-6);
  const m = atFill ? atFill.m : -1, n = atFill ? atFill.count : 0, sig = `${m}:${n}`;
  if (sig !== lastTraySig) { lastTraySig = sig; trayCells.forEach((d, i) => d.classList.toggle("full", i < n)); $("tray-n").textContent = m >= 0 ? `tray ${m + 1} · ${n} / ${CAP}` : "exchanging"; }
  const nc = nestContents(t), dsig = nc.join("|") + Math.round(dialTurn(t) * 8);
  if (dsig !== lastDialSig) { lastDialSig = dsig; drawDialMap(t, nc); }
}
function drawDialMap(t, nc) {
  const R = 46, c = 60, ang = dialAngle(t);
  let svg = `<svg viewBox="0 0 120 120" role="img" aria-label="Dial nests">`;
  svg += `<circle cx="${c}" cy="${c}" r="${R + 8}" fill="none" stroke="${css("--line")}" stroke-width="10"/>`;
  STATIONS.forEach((stn) => { const x = c + (R + 14) * Math.cos(stn.a), y = c - (R + 14) * Math.sin(stn.a); svg += `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle" style="font-size:7px">${stn.code}</text>`; });
  for (let n = 0; n < 8; n++) {
    const a = STATIONS[n].a + ang, x = c + R * Math.cos(a), y = c - R * Math.sin(a), s = nc[n] || "";
    const fill = s.includes("C") ? css("--part-c") : s.includes("A") ? css("--part-a") : css("--panel-2");
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${fill}" stroke="${css("--faint")}"/>`;
    if (s.includes("B")) svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${css("--part-b")}"/>`;
  }
  $("dial-map").innerHTML = svg + "</svg>";
}

// ---- process card: S4 force-travel chart and S5 verdict
let lastPressA = null;
function drawPressChart(test, x, F) {
  const W = 320, H = 150, X = (v) => 34 + (v / 4.8) * (W - 44), Y = (v) => H - 20 - (v / 26) * (H - 30);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Force-travel curve">`;
  for (let v = 0; v <= 25; v += 5) svg += `<line x1="34" x2="${W - 10}" y1="${Y(v)}" y2="${Y(v)}" stroke="${css("--line")}"/><text x="28" y="${Y(v) + 3}" text-anchor="end">${v}</text>`;
  for (let v = 0; v <= 4.5; v += 1.5) svg += `<text x="${X(v)}" y="${H - 6}" text-anchor="middle">${v}</text>`;
  svg += `<rect x="${X(4.35)}" y="${Y(PRESS.window[1])}" width="${X(4.65) - X(4.35)}" height="${Y(PRESS.window[0]) - Y(PRESS.window[1])}" fill="none" stroke="${css("--good")}" stroke-width="1.5"/>`;
  if (test) {
    const ok = test.pass, col = ok ? css("--press") : css("--bad");
    svg += `<polyline fill="none" stroke="${col}" stroke-width="1.8" points="${test.curve.filter(([v]) => v <= x + 1e-6).map(([v, f]) => `${X(v).toFixed(1)},${Y(f).toFixed(1)}`).join(" ")}"/>`;
    svg += `<circle cx="${X(Math.min(x, 4.5))}" cy="${Y(F)}" r="3.5" fill="${col}"/>`;
  }
  svg += `<text x="${W - 10}" y="12" text-anchor="end">N · mm</text></svg>`;
  $("press-chart").innerHTML = svg;
}
function updateProcess(t, ps) {
  if (!panelOpen("process-card")) return;
  const last = [...marks.press].reverse().find((m) => m.t0 <= t);
  const test = ps.seg.kind !== "wait" && ps.test ? ps.test : last ? assemblies.get(last.a).press : null;
  const x = ps.seg.kind === "press" || ps.seg.kind === "io" ? ps.x : 4.5;
  drawPressChart(test, x, ps.seg.kind === "press" || ps.seg.kind === "io" ? ps.F : test ? test.f45 : 0);
  const a = ps.seg.kind !== "wait" ? ps.a : last ? last.a : null;
  if (a !== lastPressA || ps.seg.kind !== "wait") {
    lastPressA = a; const T = a != null ? assemblies.get(a).press : null;
    $("press-kv").innerHTML = T ? `<dt>Assembly</dt><dd>${a}</dd><dt>Peak (snap)</dt><dd>${T.peak.toFixed(1)} N</dd><dt>F @ 4.5 mm</dt><dd>${T.f45.toFixed(2)} N</dd><dt>Verdict</dt><dd class="${T.pass ? "ok" : "warn"}">${T.pass ? "OK" : "NOK · weak spring"}</dd>` : "";
  }
  const vs = visionState(t), lv = [...marks.vision].reverse().find((m) => m.t1 <= t);
  $("vision-tag").textContent = vs.seg.kind === "inspect" ? `S5 · capturing ${vs.a}` : lv ? `S5 · ${lv.a}: ${lv.pass ? "PASS" : "FAIL"}` : "S5 camera";
  $("vision-kv").innerHTML = lv ? `<dt>Assembly</dt><dd>${lv.a}</dd><dt>Cap height</dt><dd>${lv.pass ? "nominal" : "+" + (lv.capH * 1000).toFixed(1) + " mm"}</dd><dt>Tilt</dt><dd>${lv.tilt.toFixed(1)}°</dd><dt>Verdict</dt><dd class="${lv.pass ? "ok" : "warn"}">${lv.pass ? "PASS" : "FAIL"}</dd>` : "";
}

// ---- feeders card
const feederRows = FEED.map((f) => {
  const row = el("div", "", `<div class="kv" style="margin:8px 0 4px"><dt><b>${f.name}</b> · ${f.rate} /min</dt><dd id="fd-${f.id}">–</dd></div><div class="bar"><i id="fb-${f.id}"></i></div>`);
  $("feeders").appendChild(row); return { f, txt: row.querySelector(`#fd-${f.id}`), bar: row.querySelector(`#fb-${f.id}`), head: row.querySelector("dt") };
});
function updateFeeders(t) {
  if (!panelOpen("feeders-card")) return;
  for (const r of feederRows) {
    const s = feederState(r.f.i, t), n = s.queue.filter((e) => !e.moving).length;
    r.head.innerHTML = `<b>${r.f.name}</b> · ${r.f.rate} /min`;
    r.txt.textContent = `${n}/${r.f.q} queued · ${s.present ? "part in nest" : s.esc > 0 ? "escapement" : "nest empty"}${s.starved ? " · STARVED" : ""}`;
    r.bar.style.width = `${(100 * n) / r.f.q}%`;
  }
}

// ---- joints card
const jointDefs = [
  { g: "delta", label: "θ1", lo: DELTA.lim[0], hi: DELTA.lim[1], unit: "°" }, { g: "delta", label: "θ2", lo: DELTA.lim[0], hi: DELTA.lim[1], unit: "°" },
  { g: "delta", label: "θ3", lo: DELTA.lim[0], hi: DELTA.lim[1], unit: "°" },
  { g: "scara", label: "J1", lo: -T3.lim1, hi: T3.lim1, unit: "°" }, { g: "scara", label: "J2", lo: -T3.lim2, hi: T3.lim2, unit: "°" },
  { g: "scara", label: "J3 (Z)", lo: (T3.zTop - T3.stroke) * 1000, hi: T3.zTop * 1000, unit: "mm" }, { g: "scara", label: "J4", lo: -T3.lim4, hi: T3.lim4, unit: "°" },
];
{
  let g0 = "";
  for (const j of jointDefs) {
    if (j.g !== g0) { g0 = j.g; $("joints").appendChild(el("h3", j.g, j.g === "delta" ? "Delta" : "Epson T3-B401S")); }
    const row = el("div", "joint", `<span>${j.label}</span><div class="track ${j.g}"><i></i></div><span class="v">–</span>`);
    $("joints").appendChild(row); j.i = row.querySelector("i"); j.v = row.querySelector(".v"); j.track = row.querySelector(".track");
  }
}
function showJoints(ang, q) {
  if (!panelOpen("joints-card")) return;
  const vals = [...(ang || [NaN, NaN, NaN]).map((a) => a * DEG), q[0] * DEG, q[1] * DEG, q[2] * 1000, q[3] * DEG];
  jointDefs.forEach((j, i) => {
    const f = clamp((vals[i] - j.lo) / (j.hi - j.lo), 0, 1);
    j.i.style.left = `${f * 100}%`; j.v.textContent = `${fmt(vals[i], 1)} ${j.unit}`;
    j.track.classList.toggle("near", f < 0.04 || f > 0.96);
  });
}

// ---- report card
{
  const tcp = $("tcp");
  for (const [k, name] of [["delta", "Delta"], ["scara", "T3"]]) {
    tcp.appendChild(el("span", "", `<b style="color:var(--${k})">${name}</b>`));
    for (const c of ["x", "y", "z"]) tcp.appendChild(el("div", "", `<small>${c.toUpperCase()}</small><b id="tcp-${k}-${c}">0</b>`));
  }
}
function renderReport() {
  const st = STATS, rows = [
    ["Run", `${DURATION.toFixed(2)} s`], ["Cycle (steady state)", `${CYCLE.toFixed(3)} s`], ["Throughput", `${Math.round(3600 / CYCLE)} parts/h`],
    ["Good / rejected", `${st.good} / ${st.rejected}`], ["Tray exchanges", `${st.swaps}`], ["Dial index", `${DIAL.index.toFixed(2)} s + ${DIAL.sig.toFixed(2)} s signals`],
    ...PAIRS.map((p, j) => [`Min. ${p.join("–")}`, `<span class="${minClear[j].m >= 0.025 ? "ok" : "warn"}">${(minClear[j].m * 1000).toFixed(1)} mm @ ${minClear[j].at.toFixed(2)} s</span>`]),
    ["Delta IK", ikFail ? `<span class="warn">${ikFail} unreachable</span>` : `<span class="ok">reachable at all ${NS} samples</span>`],
    ["Peak delta TCP speed", `${peakV.toFixed(2)} m/s`], ["Peak shoulder speed", `${(peakW * DEG).toFixed(0)} °/s`],
    ["Utilisation delta / T3 / press", `${Math.round(st.util.delta * 100)} / ${Math.round(st.util.scara * 100)} / ${Math.round(st.util.press * 100)} %`],
    ...Object.entries(DEFECTS).map(([a, d]) => [`Defect · assembly ${a}`, d.text]),
  ];
  $("report").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}
$("copy-csv").addEventListener("click", async () => {
  const head = "t_s,delta_x_mm,delta_y_mm,delta_z_mm,theta1_deg,theta2_deg,theta3_deg,t3_j1_deg,t3_j2_deg,t3_z_mm,t3_j4_deg,dial_deg,press_N,clear_delta_t3_mm,clear_delta_tool_mm,clear_t3_tool_mm";
  const rows = [head];
  for (let n = 0; n < NS; n++) {
    const t = Math.min(DURATION, n / RATE);
    rows.push([t.toFixed(4), ...S.dp[n].map((v) => (v * 1000).toFixed(2)), ...S.da[n].map((v) => (v * DEG).toFixed(3)),
      (S.tq[n][0] * DEG).toFixed(3), (S.tq[n][1] * DEG).toFixed(3), (S.tq[n][2] * 1000).toFixed(2), (S.tq[n][3] * DEG).toFixed(3),
      (S.dial[n] * DEG).toFixed(3), pressState(t).F.toFixed(2), ...S.cl.map((c) => (c[n] * 1000).toFixed(1))].join(","));
  }
  const text = rows.join("\n");
  try { await navigator.clipboard.writeText(text); $("copy-note").textContent = `Copied ${NS} rows.`; }
  catch (e) { console.log(text); $("copy-note").textContent = "Clipboard blocked: the CSV was written to the console."; }
});

// ---- what-if
const WHATIF = [
  { k: "index", label: "Dial index", min: DIAL.min, max: DIAL.max, step: DIAL.knob, v: () => DIAL.index, fmt: (v) => `${v.toFixed(2)} s` },
  { k: "speed", label: "Delta speed", min: 0.5, max: 1.25, step: 0.05, v: () => DM.speed, fmt: (v) => `${Math.round(v * 100)} %` },
  ...FEED.map((f, i) => ({ k: `rate${i}`, label: `Feeder ${f.id}`, min: 5, max: 120, step: 1, v: () => FEED[i].rate, fmt: (v) => `${v} /min` })),
];
for (const w of WHATIF) {
  const row = el("label", "belt-row", `<span style="min-width:84px">${w.label}</span><input type="range" min="${w.min}" max="${w.max}" step="${w.step}" value="${w.v()}"><output class="mono" style="min-width:58px;text-align:right">${w.fmt(w.v())}</output>`);
  w.input = row.querySelector("input"); w.out = row.querySelector("output");
  w.input.addEventListener("input", () => { w.out.textContent = w.fmt(Number(w.input.value)); queueWhatIf(); });
  $("whatif-controls").appendChild(row);
}
let whatIfTimer = 0;
function whatIfOpts() {
  const v = Object.fromEntries(WHATIF.map((w) => [w.k, Number(w.input.value)]));
  return { index: v.index, speed: v.speed, rates: [v.rate0, v.rate1, v.rate2] };
}
function queueWhatIf() { clearTimeout(whatIfTimer); whatIfTimer = setTimeout(() => refreshModel(whatIfOpts()), 160); }
$("whatif-reset").addEventListener("click", () => {
  WHATIF[0].input.value = DIAL.index0; WHATIF[1].input.value = 1; FEED.forEach((f, i) => { WHATIF[2 + i].input.value = f.rate0; });
  WHATIF.forEach((w) => { w.out.textContent = w.fmt(Number(w.input.value)); });
  refreshModel({});
});
let indexCurve = null, indexCurveKey = "";
function renderWhatIf() {
  const nominal = cycleFor({ index: DIAL.index0, speed: 1 });
  $("whatif-kv").innerHTML = [
    ["Cycle", `${CYCLE.toFixed(3)} s`], ["Throughput", `${Math.round(3600 / CYCLE)} parts/h`],
    ["Δ vs nominal", `${((CYCLE - nominal.CYCLE) * 1000).toFixed(0)} ms`], ["Bottleneck", ACTOR_LONG[STATS.bottleneck]],
    ["Delta waits for the dial", `${segs.delta.filter((s) => s.label === "Wait: dial in position").reduce((n, s) => n + s.t1 - s.t0, 0).toFixed(2)} s`],
    ["Delta waits for parts", `${segs.delta.filter((s) => / part present/.test(s.label)).reduce((n, s) => n + s.t1 - s.t0, 0).toFixed(2)} s`],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  const key = `${DM.speed}|${FEED.map((f) => f.rate).join(",")}`;
  if (key !== indexCurveKey) {
    indexCurveKey = key; indexCurve = [];
    for (let x = DIAL.min; x <= DIAL.max + 1e-9; x += 0.04) indexCurve.push([x, cycleFor({ index: x, speed: DM.speed, rates: FEED.map((f) => f.rate) }).CYCLE]);
  }
  const W = 320, H = 140, xs = indexCurve.map((p) => p[0]), ys = indexCurve.map((p) => p[1]);
  const y0 = Math.min(...ys) * 0.97, y1 = Math.max(...ys) * 1.02, X = (v) => 36 + ((v - DIAL.min) / (DIAL.max - DIAL.min)) * (W - 46), Y = (v) => H - 20 - ((v - y0) / (y1 - y0)) * (H - 30);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cycle versus dial index time">`;
  for (let k = 0; k <= 4; k++) { const v = y0 + (k / 4) * (y1 - y0); svg += `<line x1="36" x2="${W - 10}" y1="${Y(v)}" y2="${Y(v)}" stroke="${css("--line")}"/><text x="32" y="${Y(v) + 3}" text-anchor="end">${v.toFixed(2)}</text>`; }
  for (const v of [0.2, 0.4, 0.6, 0.8, 1.0, 1.2]) svg += `<text x="${X(v)}" y="${H - 6}" text-anchor="middle">${v.toFixed(1)}</text>`;
  svg += `<polyline fill="none" stroke="${css("--accent")}" stroke-width="2" points="${indexCurve.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ")}"/>`;
  svg += `<circle cx="${X(DIAL.index)}" cy="${Y(CYCLE)}" r="4" fill="${css("--accent")}"/><text x="${W - 10}" y="12" text-anchor="end">cycle s vs index s</text></svg>`;
  $("whatif-chart").innerHTML = svg;
}

// ---- jog (manual mode)
const jog = { dp: [...S.dp[0]], grip: 0, q: [...S.tq[0]], tgrip: 0 };
const jogDefs = [
  { g: "delta", label: "X", min: -600, max: 600, get: () => jog.dp[0] * 1000, set: (v) => { jog.dp[0] = v / 1000; } },
  { g: "delta", label: "Y", min: -250, max: 900, get: () => jog.dp[1] * 1000, set: (v) => { jog.dp[1] = v / 1000; } },
  { g: "delta", label: "Z", min: 150, max: 500, get: () => jog.dp[2] * 1000, set: (v) => { jog.dp[2] = v / 1000; } },
  { g: "scara", label: "J1 °", min: -T3.lim1, max: T3.lim1, get: () => jog.q[0] * DEG, set: (v) => { jog.q[0] = v * RAD; } },
  { g: "scara", label: "J2 °", min: -T3.lim2, max: T3.lim2, get: () => jog.q[1] * DEG, set: (v) => { jog.q[1] = v * RAD; } },
  { g: "scara", label: "J3 mm", min: (T3.zTop - T3.stroke) * 1000, max: T3.zTop * 1000, get: () => jog.q[2] * 1000, set: (v) => { jog.q[2] = v / 1000; } },
  { g: "scara", label: "J4 °", min: -180, max: 180, get: () => jog.q[3] * DEG, set: (v) => { jog.q[3] = v * RAD; } },
];
{
  let g0 = "";
  for (const j of jogDefs) {
    if (j.g !== g0) { g0 = j.g; $("jog").appendChild(el("h3", j.g, `${j.g === "delta" ? "Delta TCP" : "T3-B401S joints"} <em id="jog-${j.g}-ik"></em>`)); }
    const row = el("div", `jog-row ${j.g}`, `<label>${j.label}</label><input type="range" min="${j.min}" max="${j.max}" step="0.5"><input type="number" step="0.5">`);
    const [r, n] = row.querySelectorAll("input");
    const sync = (v) => { r.value = v; n.value = Number(v).toFixed(1); };
    r.addEventListener("input", () => { j.set(Number(r.value)); sync(r.value); });
    n.addEventListener("change", () => { const v = clamp(Number(n.value), j.min, j.max); j.set(v); sync(v); });
    j.sync = () => sync(j.get());
    $("jog").appendChild(row);
  }
  const grips = el("div", "jog-check", `<label><input type="checkbox" id="jog-dgrip"> Delta gripper closed</label><label><input type="checkbox" id="jog-tgrip"> T3 fingers closed</label>`);
  $("jog").appendChild(grips);
  $("jog-dgrip").addEventListener("change", (e) => { jog.grip = e.target.checked ? 1 : 0; });
  $("jog-tgrip").addEventListener("change", (e) => { jog.tgrip = e.target.checked ? 1 : 0; });
}
function syncJog() { jogDefs.forEach((j) => j.sync()); $("jog-dgrip").checked = jog.grip > 0.5; $("jog-tgrip").checked = jog.tgrip > 0.5; }
$("jog-home").addEventListener("click", () => { jog.dp = [DELTA.cx, DELTA.cy, 0.40]; jog.q = [...S.tq[0]]; jog.grip = jog.tgrip = 0; syncJog(); });
$("jog-copy").addEventListener("click", () => { const d = deltaPose(time), p = t3Pose(time); jog.dp = [...d.p]; jog.grip = d.grip; jog.q = [...p.q]; jog.tgrip = p.grip; syncJog(); });

// ---- model refresh (what-if)
function refreshAll() {
  buildProgram(); renderGantt(); drawLanes(); renderReport(); renderWhatIf(); rebuildPaths(); rebuildTracked();
  lastSegs = {}; lastOwners = []; lastTraySig = ""; lastDialSig = ""; lastPressA = null;
}
function refreshModel(o) {
  rebuild(o);
  time = Math.min(time, DURATION);
  refreshAll();
}
function uiThemeChanged() { lastOwners = []; lastDialSig = ""; lastPressA = null; drawLanes(); renderGantt(); renderWhatIf(); }
