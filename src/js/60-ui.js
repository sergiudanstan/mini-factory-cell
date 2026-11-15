// ---------------------------------------------------------------- UI: panels, "now" overlay, program, timing, live (OEE, reject log),
// process (S4 force-travel chart, S5 camera picture-in-picture), feeders, joints, report, what-if, jog.
// Per-frame rule: a closed panel does no work, and the DOM is written only when a shown value changes.
const ACTOR_NAME = { dial: "DIAL", delta: "DELTA", press: "PRESS", vision: "VISION", reject: "REJECT", scara: "T3", tray: "TRAY", feedA: "FEED A", feedB: "FEED B", feedC: "FEED C" };
const ACTOR_LONG = { dial: "Dial (TC220T, 8 st.)", delta: "Delta robot", press: "S4 servo press", vision: "S5 vision", reject: "S6 reject unit",
                     scara: "Epson T3-B401S", tray: "Tray shuttle", feedA: "Feeder A · housing", feedB: "Feeder B · spring", feedC: "Feeder C · cap" };
const ACTOR_CHIP = { dial: "dial", delta: "delta", press: "press", vision: "vision", reject: "reject", scara: "scara", tray: "tray", feedA: "feed", feedB: "feed", feedC: "feed" };
const ACTOR_VAR = Object.fromEntries(Object.entries(ACTOR_CHIP).map(([a, c]) => [a, `--${c}`]));
const NOW_ACTORS = ["dial", "delta", "press", "vision", "reject", "scara"];
const LANE_ACTORS = ["dial", "delta", "press", "vision", "reject", "scara", "tray"];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "–");
const uiNarrow = matchMedia("(max-width: 900px)");
let mode = "program";
// write-on-change helpers (the cached value lives on the node)
function uiText(node, s) { s = String(s); if (node.__v !== s) { node.__v = s; node.textContent = s; } }
function uiHtml(node, s) { if (node.__h !== s) { node.__h = s; node.innerHTML = s; } }
function uiStyle(node, k, v) { const c = `__s_${k}`; if (node[c] !== v) { node[c] = v; node.style[k] = v; } }
function uiAttr(node, k, v) { const c = `__a_${k}`; if (node[c] !== v) { node[c] = v; node.setAttribute(k, v); } }
// entries of a list sorted by key k with list[i][k] <= t
function uiCount(list, t, k) { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m][k] <= t) lo = m + 1; else hi = m; } return lo; }
const uiNoise = (a, s) => { const v = Math.sin(a * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };   // 0..1, deterministic
const uiCycleNo = (t) => Math.min(NC_RUN, Math.floor(dialTurn(t) + 1e-9) + 1);

// ---- panels (?panels=process,feeders opens exactly these; names: live program timing process feeders joints report whatif)
const UI_PANELS = { live: "live-card", program: "program-card", timing: "gantt-card", gantt: "gantt-card", process: "process-card", feeders: "feeders-card",
                    joints: "joints-card", report: "report-card", whatif: "whatif-card", jog: "jog-card" };
const openPanels = { program: new Set(["live-card", "program-card"]), manual: new Set(["live-card", "jog-card"]) };
if (uiNarrow.matches) { openPanels.program.clear(); openPanels.manual.clear(); }
if (QS.has("panels")) openPanels.program = new Set(QS.get("panels").split(",").map((k) => UI_PANELS[k.trim().toLowerCase()]).filter((id) => id && id !== "jog-card"));
const uiDrawer = $("drawer");
let uiDrawerOpen = false;
function syncPanels() {
  const open = openPanels[mode];
  document.querySelectorAll(".rail-item").forEach((b) => {
    const allowed = b.dataset.modes.split(" ").includes(mode);
    b.hidden = !allowed; b.setAttribute("aria-pressed", String(allowed && open.has(b.dataset.panel)));
  });
  let any = false;
  document.querySelectorAll(".drawer .card").forEach((c) => { const show = open.has(c.id); c.hidden = !show; any = any || show; });
  uiDrawer.hidden = !any; uiDrawerOpen = any;
  uiPipDirty = true; uiFxKey = ""; uiFxPos = "";
  requestAnimationFrame(() => { resize(); fitComposer(); uiPipFit(); });
}
document.querySelectorAll(".rail-item").forEach((b) => b.addEventListener("click", () => {
  const set = openPanels[mode], id = b.dataset.panel;
  if (set.has(id)) set.delete(id); else set.add(id);
  syncPanels();
}));
document.querySelectorAll(".card .close").forEach((b) => b.addEventListener("click", () => { openPanels[mode].delete(b.closest(".card").id); syncPanels(); }));
const panelOpen = (id) => uiDrawerOpen && openPanels[mode].has(id);

// ---- "now" overlay: one compact row per actor, a progress fill per step, collapsible to a header with status LEDs
const uiNow = $("now"), uiNowMode = $("now-mode"), uiNowCyc = $("now-cyc");
const nowEls = {};
for (const a of NOW_ACTORS) {
  const c = ACTOR_CHIP[a];
  const row = el("div", "now-row idle", `<span class="prog"></span><span class="chip ${c}">${ACTOR_NAME[a]}</span><div class="what"><b>–</b><code></code></div><span class="vd"></span>`);
  row.style.setProperty("--soft", `var(--${c}-soft)`);
  $("now-rows").appendChild(row);
  const led = el("i"); led.style.setProperty("--c", `var(--${c})`); led.title = ACTOR_LONG[a]; $("now-leds").appendChild(led);
  nowEls[a] = { row, b: row.querySelector("b"), code: row.querySelector("code"), vd: row.querySelector(".vd"), prog: row.querySelector(".prog"), led, seg: null, p: -1 };
}
const uiVerdict = (ok, yes, no) => `<span class="verdict ${ok ? "pass" : "fail"}">${ok ? yes : no}</span>`;
function showNow(a, s, t) {
  const n = nowEls[a];
  if (n.seg !== s) {
    n.seg = s;
    const busy = s.kind !== "wait";
    n.b.textContent = s.label; n.code.textContent = s.cmd || "";
    n.row.title = `${ACTOR_LONG[a]}: ${s.label}${s.cmd ? `  (${s.cmd})` : ""}`;
    n.row.classList.toggle("idle", !busy); n.led.classList.toggle("on", busy);
    let v = "";
    if (a === "vision" && s.kind === "process") v = uiVerdict(s.pass, "PASS", "FAIL");
    // the press verdict exists once the load cell is read: hold, release and ram up of the tested assembly
    if (a === "press" && s.a != null && (s.kind === "io" || (s.kind === "lin" && s.z1 > s.z0))) { const T = assemblies.get(s.a)?.press; if (T) v = uiVerdict(T.pass, "OK", "NOK"); }
    n.vd.innerHTML = v; n.p = -1;
  }
  if (uiNowCollapsed) return;   // rows hidden: LEDs only
  const p = s.kind === "wait" ? 0 : Math.round(clamp((t - s.t0) / Math.max(1e-6, s.t1 - s.t0), 0, 1) * 50) / 50;
  if (p !== n.p) { n.p = p; n.prog.style.transform = `scaleX(${p})`; }
}
let uiNowModeV = "";
function showNowHead(t) {
  const m = mode === "manual" ? "man" : playing ? "auto" : "hold";
  if (m !== uiNowModeV) { uiNowModeV = m; uiNowMode.className = `now-mode ${m}`; uiNowMode.textContent = m === "man" ? "MANUAL" : m.toUpperCase(); }
  uiText(uiNowCyc, mode === "manual" ? "" : `cycle ${uiCycleNo(t)}/${NC_RUN}`);
}
let uiNowCollapsed = uiNarrow.matches;
if (!uiNarrow.matches) { try { uiNowCollapsed = localStorage.getItem("mfc-now-collapsed") === "1"; } catch (e) {} }
if (QS.get("now") === "collapsed") uiNowCollapsed = true; else if (QS.get("now") === "open") uiNowCollapsed = false;
function uiSetNow(collapsed, save) {
  uiNowCollapsed = collapsed; uiNow.classList.toggle("collapsed", collapsed);
  const b = $("now-toggle");
  b.setAttribute("aria-expanded", String(!collapsed)); b.setAttribute("aria-label", collapsed ? "Expand the live steps" : "Collapse the live steps");
  if (save && !uiNarrow.matches) { try { localStorage.setItem("mfc-now-collapsed", collapsed ? "1" : "0"); } catch (e) {} }
}
$("now-toggle").addEventListener("click", () => uiSetNow(!uiNowCollapsed, true));
uiSetNow(uiNowCollapsed, false);

// ---- zone legend (who owns S1..S8 now)
const zoneDots = STATIONS.map((stn) => {
  const sp = el("span", "", `<i></i>${stn.code}`); sp.title = `${stn.code} · ${stn.name}`; $("zone-legend").appendChild(sp); return sp.querySelector("i");
});
let lastOwners = [];
function showOwners(t) {
  STATIONS.forEach((stn, i) => {
    const o = zoneOwner(stn.s, t);
    if (o === lastOwners[i]) return; lastOwners[i] = o;
    zoneDots[i].style.background = o ? `var(${ACTOR_VAR[o]})` : "";
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

// ---- timing: gantt + transport lanes (with reject ticks, NOK detections, tray-exchange spans and a time ruler)
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
let uiTlW = 0, uiRejects = [];
function drawLanes() {
  const r = lanesCanvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  lanesCanvas.width = Math.max(1, Math.round(r.width * dpr)); lanesCanvas.height = Math.max(1, Math.round(r.height * dpr));
  uiTlW = r.width;
  const g = lanesCanvas.getContext("2d"), W = lanesCanvas.width, H = lanesCanvas.height;
  const rul = 13 * dpr, top = 3 * dpr, lh = (H - rul - top) / LANE_ACTORS.length, X = (t) => (t / DURATION) * W;
  g.clearRect(0, 0, W, H);
  g.fillStyle = css("--swap-soft");                                  // tray exchange: a blue span across every lane
  for (const s of marks.swap) g.fillRect(X(s.t0), 0, Math.max(dpr, X(s.t1) - X(s.t0)), H - rul);
  LANE_ACTORS.forEach((a, i) => {
    const y = top + i * lh + lh * 0.16, h = lh * 0.68;
    g.fillStyle = css("--line"); g.fillRect(0, y, W, h);
    g.fillStyle = css(a === "tray" ? "--swap" : ACTOR_VAR[a]);
    for (const s of segs[a]) if (s.kind !== "wait") g.fillRect(X(s.t0), y, Math.max(dpr, X(s.t1) - X(s.t0)), h);
  });
  g.fillStyle = css("--bad");
  for (const d of uiRejects) {                                       // NOK detection: a diamond on the S4 or S5 lane
    const y = top + (LANE_ACTORS.indexOf(d.st === "S4" ? "press" : "vision") + 0.5) * lh, x = X(d.t), k = 4 * dpr;
    g.beginPath(); g.moveTo(x, y - k); g.lineTo(x + k, y); g.lineTo(x, y + k); g.lineTo(x - k, y); g.closePath(); g.fill();
  }
  for (const rj of marks.reject) {                                   // S6 removal: a red tick through every lane
    const x = Math.round(X(rj.t0)), k = 4 * dpr;
    g.fillRect(x - dpr, 0, 2 * dpr, H - rul);
    g.beginPath(); g.moveTo(x - k, 0); g.lineTo(x + k, 0); g.lineTo(x, k * 1.2); g.closePath(); g.fill();
  }
  const ry = H - rul + 2 * dpr;                                      // ruler: 1 s ticks, labels every 10 s
  g.fillStyle = css("--faint"); g.font = `500 ${9 * dpr}px ${css("--mono") || "monospace"}`; g.textBaseline = "top";
  for (let t = 0; t <= DURATION + 1e-9; t += 1) {
    const x = Math.round(X(t)), big = t % 10 === 0;
    g.fillRect(x, ry - 2 * dpr, Math.max(1, dpr), (big ? 4 : 2) * dpr);
    if (big) { g.textAlign = t === 0 ? "left" : "center"; g.fillText(String(t), x + (t === 0 ? 2 * dpr : 0), ry + 2 * dpr); }
  }
  $("clock-total").textContent = DURATION.toFixed(1);
  uiTl.setAttribute("aria-valuemax", DURATION.toFixed(1));
}
// hover: time, cycle, the step of every lane, nearby events
const uiTl = $("timeline"), uiTip = $("tl-tip"), uiHover = $("tl-hover");
let uiTipX = -1, uiTipRaf = 0;
function uiTipShow() {
  uiTipRaf = 0;
  if (uiTipX < 0) return;
  const r = uiTl.getBoundingClientRect(), f = clamp((uiTipX - r.left) / Math.max(1, r.width), 0, 1), t = f * DURATION, near = 0.018 * DURATION;
  let h = `<div class="t">${t.toFixed(2)} s<em>cycle ${uiCycleNo(t)}/${NC_RUN}</em></div>`;
  for (const a of LANE_ACTORS) {
    const s = segAt(segs[a], t);
    h += `<div class="r${s.kind === "wait" ? " idle" : ""}"><span class="chip ${ACTOR_CHIP[a]}">${ACTOR_NAME[a]}</span><span>${s.label}</span></div>`;
  }
  const ev = [];
  for (const d of uiRejects) if (Math.abs(d.t - t) < near) ev.push(`<b>${d.st} NOK · #${d.a}</b> ${d.short} at ${d.t.toFixed(1)} s`);
  for (const rj of marks.reject) if (Math.abs(rj.t0 - t) < near) ev.push(`<b>Reject #${rj.a}</b> S6 to the bin at ${rj.t0.toFixed(1)} s`);
  for (const s of marks.swap) if (t >= s.t0 - near && t <= s.t1 + near) ev.push(`<b class="sw">Tray exchange</b> ${s.t0.toFixed(1)}–${s.t1.toFixed(1)} s (tray ${s.m + 1} out, ${s.m + 2} in)`);
  if (ev.length) h += `<div class="ev">${ev.join("<br>")}</div>`;
  uiHtml(uiTip, h); uiTip.hidden = false; uiHover.hidden = false;
  const w = uiTip.offsetWidth, x = f * r.width;
  uiTip.style.transform = `translateX(${Math.round(clamp(x - w / 2, 6 - r.left, innerWidth - r.left - w - 6))}px)`;
  uiHover.style.transform = `translateX(${x}px)`;
}
uiTl.addEventListener("pointermove", (e) => { uiTipX = e.clientX; if (!uiTipRaf) uiTipRaf = requestAnimationFrame(uiTipShow); });
uiTl.addEventListener("pointerleave", () => { uiTipX = -1; uiTip.hidden = true; uiHover.hidden = true; });

// ---- live card: counters, OEE, tray and dial maps, reject log
const liveStats = [["cycle", "Cycle", "s"], ["rate", "Throughput", "/h"], ["good", "Good", ""], ["rej", "Rejected", ""], ["clear", "Min. clearance", "mm"], ["force", "S4 force", "N"]];
const uiLs = {};
for (const [k, label, unit] of liveStats) {
  const d = el("div", "stat", `<small>${label}</small><div class="value"><span>–</span><em>${unit}</em></div><div class="sub"></div>`);
  $("live-stats").appendChild(d); uiLs[k] = { v: d.querySelector(".value span"), s: d.querySelector(".sub") };
}
const UI_IDEAL_CYCLE = 2.1;          // OEE performance: ideal cycle / actual cycle (the delta-limited design cycle)
const uiOee = {};
{
  const host = $("oee"), row = (k, label, parent) => {
    parent.appendChild(el("span", "k", label)); const m = el("span", "m", "<i></i>"); parent.appendChild(m); const v = el("span", "v", "–"); parent.appendChild(v);
    uiOee[k] = { i: m.firstChild, v };
  };
  const tot = el("div", "tot"); host.appendChild(tot); row("oee", "OEE", tot);
  row("a", "Availability", host); row("p", "Performance", host); row("q", "Quality", host);
  uiOee.note = el("div", "note"); host.appendChild(uiOee.note);
}
function uiMeter(o, f) {
  uiText(o.v, `${(f * 100).toFixed(1)} %`);
  const s = `scaleX(${clamp(f, 0, 1).toFixed(4)})`; uiStyle(o.i, "transform", s);
}
const trayCells = Array.from({ length: CAP }, () => { const d = el("div"); $("tray-map").appendChild(d); return d; });
$("live-legend").innerHTML = `<span><i style="background:var(--part-a)"></i>A housing</span><span><i style="background:var(--part-b)"></i>B spring</span><span><i style="background:var(--part-c)"></i>C cap</span>`;
let lastTraySig = "", lastDialSig = "", uiDialEv = [], uiRejSig = "";
function uiBuildRejects() {   // NOK detections of this run: station, time, reason; S6 removal time
  uiRejects = [];
  for (const A of assemblies.values()) {
    if (A.a < 0 || A.status !== "reject") continue;
    if (A.failAt === 4) {
      const m = marks.press.find((x) => x.a === A.a); if (!m) continue;
      uiRejects.push({ a: A.a, st: "S4", t: m.t1 + PRESS.tDwell, short: "weak spring", why: `F@4.5 mm ${m.f45.toFixed(2)} N < ${PRESS.window[0].toFixed(1)} N` });
    } else if (A.failAt === 5) {
      const m = marks.vision.find((x) => x.a === A.a); if (!m) continue;
      uiRejects.push({ a: A.a, st: "S5", t: m.t1, short: "cap hook open", why: `cap +${(m.capH * 1000).toFixed(1)} mm, tilt ${m.tilt.toFixed(1)}°` });
    }
  }
  for (const d of uiRejects) { const r = marks.reject.find((x) => x.a === d.a); d.out = r ? r.t0 : null; }
  uiRejects.sort((p, q) => p.t - q.t);
  // dial-map change events: every track key of a component in a nest, every press end
  uiDialEv = [];
  for (const p of parts) for (const k of p.track) if (k.mode === "dial" || k.mode === "fall" || k.mode === "reject" || k.mode === "scara") uiDialEv.push(k.t);
  for (const m of marks.press) uiDialEv.push(m.t1);
  uiDialEv.sort((a, b) => a - b);
  uiDialEv = uiDialEv.map((t) => ({ t }));
}
function nestContents(t) {   // what each nest holds now: "", "A", "AB", "ABC", "ABC*" (pressed)
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
  if (!panelOpen("live-card")) return;
  const good = uiCount(marks.place, t, "t"), rej = uiCount(marks.reject, t, "t0");
  uiText(uiLs.cycle.v, CYCLE.toFixed(2)); uiText(uiLs.cycle.s, `index ${DIAL.index.toFixed(2)} s`);
  uiText(uiLs.rate.v, Math.round(3600 / CYCLE)); uiText(uiLs.rate.s, "steady state");
  uiText(uiLs.good.v, good); uiText(uiLs.good.s, "placed in trays");
  uiText(uiLs.rej.v, rej); uiText(uiLs.rej.s, rej ? `last #${marks.reject[rej - 1].a}` : "none yet");
  const cl = info.clear;
  uiText(uiLs.clear.v, Number.isFinite(cl) ? Math.round(cl * 1000) : "–"); uiLs.clear.v.classList.toggle("warn", cl < 0.025);
  uiText(uiLs.clear.s, PAIRS[info.pair].join(" ↔ "));
  uiText(uiLs.force.v, fmt(info.press.F, 1));
  uiText(uiLs.force.s, info.press.a != null && info.press.seg.kind !== "wait" ? `assembly ${info.press.a}` : "ram up");
  // OEE: availability 1 (no stops in the program), performance ideal/actual, quality good/(good + rejected) so far
  const A = 1, P = Math.min(1, UI_IDEAL_CYCLE / CYCLE), Q = good + rej ? good / (good + rej) : 1;
  uiMeter(uiOee.oee, A * P * Q); uiMeter(uiOee.a, A); uiMeter(uiOee.p, P); uiMeter(uiOee.q, Q);
  uiText(uiOee.note, `ideal ${UI_IDEAL_CYCLE.toFixed(2)} s / actual ${CYCLE.toFixed(3)} s · ${good} good, ${rej} rejected · no unplanned stops`);
  // tray at the fill position
  const ts = trayState(t), atFill = ts.trays.find((tr) => tr.p && Math.abs(tr.p[0] - TRAY.cx) < 1e-6 && Math.abs(tr.p[2] - TRAY.top) < 1e-6);
  const m = atFill ? atFill.m : -1, n = atFill ? atFill.count : 0, sig = `${m}:${n}`;
  if (sig !== lastTraySig) { lastTraySig = sig; trayCells.forEach((d, i) => d.classList.toggle("full", i < n)); $("tray-n").textContent = m >= 0 ? `tray ${m + 1} · ${n} / ${CAP}` : "exchanging"; }
  const dsig = `${uiCount(uiDialEv, t, "t")}|${Math.round(dialTurn(t) * 16)}`;
  if (dsig !== lastDialSig) { lastDialSig = dsig; drawDialMap(t, nestContents(t)); }
  uiRejLog(t);
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
function uiRejLog(t) {
  const n = uiCount(uiRejects, t, "t");
  let sig = String(n);
  for (let i = 0; i < n; i++) sig += uiRejects[i].out != null && t >= uiRejects[i].out ? "b" : "w";
  if (sig === uiRejSig) return;
  uiRejSig = sig;
  $("rej-sub").textContent = n ? `${n} detected` : "none yet";
  if (!n) {
    const plan = Object.entries(DEFECTS).map(([a, d]) => `#${a} at S${d.station}`).join(", ");
    $("rejlog").innerHTML = `<div class="empty">No rejects so far. Planned defects in this run: ${plan}.</div>`;
    return;
  }
  $("rejlog").innerHTML = uiRejects.slice(0, n).reverse().map((d) => {
    const where = d.out == null ? "not removed in this run" : t >= d.out ? `S6 → bin at ${d.out.toFixed(1)} s` : "awaiting S6";
    return `<div class="row"><b>#${d.a}</b><span class="st">${d.st}</span><span class="why">${d.short[0].toUpperCase() + d.short.slice(1)}<small>${d.why} · ${where}</small></span><span class="tm">${d.t.toFixed(1)} s</span></div>`;
  }).join("");
}

// ---- process card, S4: force-travel chart (maXYmos-style evaluation objects) with the last 5 tests as ghosts and a zoom of EO2
const UI_FX = { x0: 30, x1: 312, yT: 10, yB: 140, xMax: 4.8, fMax: 26, zl: 212, zt: 16, zw: 98, zh: 74, zx0: 3.6, zx1: 4.7, zf0: 1.5, zf1: 5.5 };
const uiFxX = (x) => UI_FX.x0 + (x / UI_FX.xMax) * (UI_FX.x1 - UI_FX.x0);
const uiFxY = (f) => UI_FX.yB - (f / UI_FX.fMax) * (UI_FX.yB - UI_FX.yT);
const uiFxZX = (x) => UI_FX.zl + ((x - UI_FX.zx0) / (UI_FX.zx1 - UI_FX.zx0)) * UI_FX.zw;
const uiFxZY = (f) => UI_FX.zt + UI_FX.zh - ((f - UI_FX.zf0) / (UI_FX.zf1 - UI_FX.zf0)) * UI_FX.zh;
const UI_FX_LINES = ["g0", "g1", "g2", "g3", "g4", "ref", "un", "live"];
const uiFx = {};
let uiFxKey = "", uiFxPos = "";
{
  const F = UI_FX, sx = (F.x1 - F.x0) / F.xMax, sy = (F.yB - F.yT) / F.fMax, zsx = F.zw / (F.zx1 - F.zx0), zsy = F.zh / (F.zf1 - F.zf0);
  const lines = UI_FX_LINES.map((k) => `<polyline data-k="${k}" class="${k === "live" ? "live" : k === "un" ? "unload" : k === "ref" ? "ghost ref" : "ghost"}" points=""/>`).join("");
  let h = `<svg viewBox="0 0 320 156" role="img" aria-label="S4 force-travel curve with evaluation windows and the last five tests">`;
  h += `<defs><clipPath id="uiFxClipM"><rect x="${F.x0}" y="${F.yT - 4}" width="${F.x1 - F.x0}" height="${F.yB - F.yT + 4}"/></clipPath>`;
  h += `<clipPath id="uiFxClipZ"><rect x="${F.zl}" y="${F.zt}" width="${F.zw}" height="${F.zh}"/></clipPath></defs>`;
  for (let f = 0; f <= 25; f += 5) h += `<line class="grid" x1="${F.x0}" x2="${F.x1}" y1="${uiFxY(f)}" y2="${uiFxY(f)}"/><text x="${F.x0 - 5}" y="${uiFxY(f) + 3}" text-anchor="end">${f}</text>`;
  for (let i = 0; i <= 9; i++) {
    const x = i / 2, X = uiFxX(x);
    h += `<line class="axis" x1="${X}" x2="${X}" y1="${F.yB}" y2="${F.yB + (i % 2 ? 2 : 4)}"/>`;
    if (i % 2 === 0) h += `<text x="${X}" y="${F.yB + 13}" text-anchor="middle">${x}</text>`;
  }
  h += `<line class="axis" x1="${F.x0}" x2="${F.x1}" y1="${F.yB}" y2="${F.yB}"/><line class="axis" x1="${F.x0}" x2="${F.x0}" y1="${F.yT - 4}" y2="${F.yB}"/>`;
  h += `<text x="${F.x0 - 5}" y="${F.yT - 2}" text-anchor="end">N</text><text x="${F.x1}" y="${F.yB + 13}" text-anchor="end">mm</text>`;
  const e1 = [uiFxX(1.2), uiFxY(24.5), uiFxX(2.8), uiFxY(PRESS.snapMin)];
  h += `<rect class="eo1" x="${e1[0]}" y="${e1[1]}" width="${e1[2] - e1[0]}" height="${e1[3] - e1[1]}"/><text class="eo" x="${e1[0] + 3}" y="${e1[1] + 10}">EO1 snap ≥ ${PRESS.snapMin} N</text>`;
  const e2 = [uiFxX(4.35), uiFxY(PRESS.window[1]), uiFxX(4.65), uiFxY(PRESS.window[0])];
  h += `<rect class="eo2" x="${e2[0]}" y="${e2[1]}" width="${e2[2] - e2[0]}" height="${e2[3] - e2[1]}"/>`;
  h += `<path class="axis" d="M${e2[0]} ${e2[1]} L${F.zl + 8} ${F.zt + F.zh}" stroke-dasharray="2 2" opacity="0.6"/>`;
  h += `<g clip-path="url(#uiFxClipM)"><g transform="translate(${F.x0} ${F.yB}) scale(${sx} ${-sy})">${lines}</g></g>`;
  // EO2 zoom
  const z2 = [uiFxZX(4.35), uiFxZY(PRESS.window[1]), uiFxZX(4.65), uiFxZY(PRESS.window[0])];
  h += `<rect class="zoomf" x="${F.zl}" y="${F.zt}" width="${F.zw}" height="${F.zh}" rx="3"/>`;
  h += `<rect class="eo2" x="${z2[0]}" y="${z2[1]}" width="${z2[2] - z2[0]}" height="${z2[3] - z2[1]}"/>`;
  h += `<g clip-path="url(#uiFxClipZ)"><g transform="translate(${F.zl - F.zx0 * zsx} ${F.zt + F.zh + F.zf0 * zsy}) scale(${zsx} ${-zsy})">${lines}</g></g>`;
  h += `<text class="eo" x="${F.zl + 4}" y="${F.zt + 10}">EO2 ${PRESS.window[0].toFixed(1)}–${PRESS.window[1].toFixed(1)} N</text>`;
  h += `<text x="${z2[0] - 3}" y="${z2[3] + 3}" text-anchor="end">${PRESS.window[0].toFixed(1)}</text><text x="${z2[0] - 3}" y="${z2[1] + 3}" text-anchor="end">${PRESS.window[1].toFixed(1)}</text>`;
  h += `<text x="${uiFxZX(4.5)}" y="${F.zt + F.zh - 3}" text-anchor="middle">4.5</text>`;
  h += `<circle class="dot" data-k="dot" r="3.4" cx="-20" cy="-20"/><circle class="dot" data-k="zdot" r="3" cx="-20" cy="-20"/></svg>`;
  $("press-chart").innerHTML = h;
  for (const k of UI_FX_LINES) uiFx[k] = [...$("press-chart").querySelectorAll(`polyline[data-k="${k}"]`)];
  uiFx.dot = $("press-chart").querySelector('[data-k="dot"]'); uiFx.zdot = $("press-chart").querySelector('[data-k="zdot"]');
  uiFx.res = $("press-res"); uiFx.sub = $("press-sub");
  uiFx.res.innerHTML = ["Assembly", "Peak (snap)", "F @ 4.5 mm", "Verdict"].map((k) => `<div><small>${k}</small><b>–</b></div>`).join("");
  uiFx.cells = [...uiFx.res.querySelectorAll("b")];
}
function uiFxPts(curve, xTo = Infinity, end = null) {
  let s = "";
  for (const [x, f] of curve) { if (x > xTo + 1e-6) break; s += `${x.toFixed(2)},${f.toFixed(2)} `; }
  if (end) s += `${end[0].toFixed(3)},${end[1].toFixed(3)}`;
  return s.trim();
}
function uiFxSet(k, pts, cls) { for (const p of uiFx[k]) { uiAttr(p, "points", pts); uiAttr(p, "class", cls); } }
function uiFxDot(x, f, on, nok) {
  const c = nok ? "dot nok" : "dot";
  uiAttr(uiFx.dot, "cx", on ? uiFxX(x).toFixed(1) : "-20"); uiAttr(uiFx.dot, "cy", on ? uiFxY(f).toFixed(1) : "-20"); uiAttr(uiFx.dot, "class", c);
  const zin = on && x >= UI_FX.zx0 && x <= UI_FX.zx1 && f >= UI_FX.zf0 && f <= UI_FX.zf1;
  uiAttr(uiFx.zdot, "cx", zin ? uiFxZX(x).toFixed(1) : "-20"); uiAttr(uiFx.zdot, "cy", zin ? uiFxZY(f).toFixed(1) : "-20"); uiAttr(uiFx.zdot, "class", c);
}
function uiPressTick(t, ps) {
  const s = ps.seg, active = s.kind !== "wait" && s.a != null;
  const i = active ? marks.press.findIndex((m) => m.a === s.a) : uiCount(marks.press, t, "t0") - 1;
  const m = i >= 0 ? marks.press[i] : null;
  if (String(i) !== uiFxKey) {   // a new test: ghosts of the five before it, the weak-spring reference, the result cells
    uiFxKey = String(i);
    for (let k = 0; k < 5; k++) {
      const g = i - 5 + k >= 0 ? marks.press[i - 5 + k] : null;
      uiFxSet(`g${k}`, g ? (g.__pts ||= uiFxPts(g.curve)) : "", g && !g.pass ? "ghost nok" : "ghost");
    }
    const ref = marks.press.findIndex((x, j) => j < i - 5 && !x.pass);
    uiFxSet("ref", ref >= 0 ? (marks.press[ref].__pts ||= uiFxPts(marks.press[ref].curve)) : "", "ghost ref");
  }
  let x = 0, f = 0, phase = "idle";
  if (m) {
    if (!active) phase = "done";
    else if (s.kind === "lin" && s.z1 < s.z0) phase = "approach";
    else if (s.kind === "press") { phase = "press"; x = ps.x; f = ps.F; }
    else if (s.kind === "io") { phase = "hold"; x = ps.x; f = ps.F; }
    else if (s.label === "Release to latch") { phase = "release"; x = ps.x; f = ps.F; }
    else phase = "up";
  }
  const pos = `${i}|${phase}|${x.toFixed(2)}|${f.toFixed(1)}`;
  if (pos === uiFxPos) return;
  uiFxPos = pos;
  const nok = !!m && !m.pass, T = m ? assemblies.get(m.a).press : null;
  const loadTo = phase === "approach" || phase === "idle" ? -1 : phase === "press" ? x : 4.5;
  uiFxSet("live", m && loadTo >= 0 ? uiFxPts(m.curve, loadTo, phase === "press" ? [x, f] : null) : "", nok ? "live nok" : "live");
  const fLatch = T ? (T.cond.k / 1000) * PRESS.latch * 1000 : 0, latchX = PRESS.latch * 1000;
  uiFxSet("un", phase === "release" ? `4.5,${m.f45.toFixed(2)} ${x.toFixed(3)},${f.toFixed(3)}` : phase === "up" || phase === "done" ? `4.5,${m.f45.toFixed(2)} ${latchX},${fLatch.toFixed(3)}` : "", "unload");
  uiFxDot(x, f, phase === "press" || phase === "hold" || phase === "release", nok);
  const tested = phase === "hold" || phase === "release" || phase === "up" || phase === "done";
  uiText(uiFx.cells[0], m ? `#${m.a}` : "–");
  uiText(uiFx.cells[1], m && (tested || x > 2.8) ? `${m.peak.toFixed(1)} N` : "–");
  uiText(uiFx.cells[2], m && tested ? `${m.f45.toFixed(2)} N` : "–");
  uiText(uiFx.cells[3], m && tested ? (m.pass ? "OK" : "NOK") : phase === "approach" || phase === "press" ? "testing" : "–");
  uiFx.cells[3].className = m && tested ? (m.pass ? "ok" : "warn") : "";
  const sub = { idle: "waiting", approach: `#${m?.a} · ram down to cap`, press: `#${m?.a} · ${x.toFixed(2)} mm · ${f.toFixed(1)} N`, hold: `#${m?.a} · hold, read load cell`,
                release: `#${m?.a} · release to latch`, up: `#${m?.a} · ram up`, done: `last test #${m?.a} · ram up` }[phase];
  uiText(uiFx.sub, sub);
}

// ---- process card, S5: picture-in-picture from a camera at the S5 lens looking straight down at the nest.
// Rendered every 3rd frame into a 320 x 240 target while the card is visible, read back, developed (sensor look) and annotated.
const UI_PIP = { w: 320, h: 240, fov: 13, every: 3 };
const uiPipCam = new THREE.PerspectiveCamera(UI_PIP.fov, UI_PIP.w / UI_PIP.h, 0.07, 1.5);   // near clips the lens barrel
{
  const S5 = st(5);
  uiPipCam.position.copy(cv(S5.x, S5.y, TOOL.camera.z0));
  uiPipCam.up.copy(cv(Math.cos(S5.a), Math.sin(S5.a), 0));       // image up = radially out, so the dial runs left to right
  uiPipCam.lookAt(cv(S5.x, S5.y, HB));
  uiPipCam.updateMatrixWorld(true);
}
const uiPipRT = new THREE.WebGLRenderTarget(UI_PIP.w, UI_PIP.h, { samples: 4, colorSpace: THREE.SRGBColorSpace });
const uiPipBuf = new Uint8Array(UI_PIP.w * UI_PIP.h * 4);
const uiPipCanvas = $("vision-canvas"), uiPipCtx = uiPipCanvas.getContext("2d");
const uiPipFrame = document.createElement("canvas"); uiPipFrame.width = UI_PIP.w; uiPipFrame.height = UI_PIP.h;
const uiPipFrameCtx = uiPipFrame.getContext("2d");
const uiPipImg = uiPipFrameCtx.createImageData(UI_PIP.w, UI_PIP.h);
const UI_GRAIN_N = 1 << 17;
const uiPipVig = new Float32Array(UI_PIP.w * UI_PIP.h), uiPipGrain = new Int8Array(UI_GRAIN_N), uiPipLut = new Uint8Array(256);
{
  for (let y = 0; y < UI_PIP.h; y++) for (let x = 0; x < UI_PIP.w; x++) {
    const dx = (x + 0.5) / UI_PIP.w - 0.5, dy = ((y + 0.5) / UI_PIP.h - 0.5) * 0.75;
    uiPipVig[y * UI_PIP.w + x] = 1 - 0.95 * (dx * dx + dy * dy);   // lens falloff, about 0.7 in the corners
  }
  const rnd = mulberry32(5);
  for (let i = 0; i < UI_GRAIN_N; i++) uiPipGrain[i] = Math.round((rnd() + rnd() + rnd() - 1.5) * 6);
}
let uiPipN = 0, uiPipT = -1, uiPipDirty = true, uiPipVisible = false, uiPipGain = -1, uiPipFont = "";
function uiPipFit() {
  const r = uiPipCanvas.getBoundingClientRect();
  if (r.width < 16) return;
  const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (uiPipCanvas.width !== w || uiPipCanvas.height !== h) { uiPipCanvas.width = w; uiPipCanvas.height = h; uiPipDirty = true; }
}
new ResizeObserver(uiPipFit).observe(uiPipCanvas);
new IntersectionObserver((es) => { for (const e of es) uiPipVisible = e.isIntersecting; if (uiPipVisible) uiPipDirty = true; }).observe(uiPipCanvas);
const _uiCC = new THREE.Color(), _uiPv = new THREE.Vector3();
function uiPipRender() {
  const r = renderer, sm = r.shadowMap, prevRT = r.getRenderTarget(), prevAuto = sm.autoUpdate, prevNeeds = sm.needsUpdate;
  const prevOverride = scene.overrideMaterial, prevAutoClear = r.autoClear, prevAlpha = r.getClearAlpha();
  r.getClearColor(_uiCC);
  try {
    sm.autoUpdate = false; sm.needsUpdate = false;        // reuse this frame's shadow map, never re-render it for the PiP
    scene.overrideMaterial = null;                        // GTAO's normal pass is done; render real materials
    r.autoClear = true; r.setClearColor(0x000000, 1);
    r.setRenderTarget(uiPipRT);
    r.render(scene, uiPipCam);
    r.readRenderTargetPixels(uiPipRT, 0, 0, UI_PIP.w, UI_PIP.h, uiPipBuf);
  } finally {
    r.setRenderTarget(prevRT); sm.autoUpdate = prevAuto; sm.needsUpdate = prevNeeds;
    scene.overrideMaterial = prevOverride; r.autoClear = prevAutoClear; r.setClearColor(_uiCC, prevAlpha);
  }
}
// sRGB bytes (rows bottom-up) -> flipped, slightly desaturated, contrasty, vignetted, grainy sensor image; gain > 1 during the flash
function uiPipDevelop(gain) {
  if (gain !== uiPipGain) {
    uiPipGain = gain;
    for (let i = 0; i < 256; i++) { const v = Math.min(1, (i / 255) * gain), c = v + 0.10 * Math.sin(2 * Math.PI * v) * v * (1 - v) * 4; uiPipLut[i] = Math.round(255 * clamp(c * 1.03 - 0.015, 0, 1)); }
  }
  const W = UI_PIP.w, H = UI_PIP.h, src = uiPipBuf, dst = uiPipImg.data, lut = uiPipLut, gr = uiPipGrain, vig = uiPipVig, off = (uiPipN * 7919) & (UI_GRAIN_N - 1);
  for (let y = 0; y < H; y++) {
    let s = (H - 1 - y) * W * 4, d = y * W * 4, v = y * W;
    for (let x = 0; x < W; x++, s += 4, d += 4, v++) {
      const r = src[s], g = src[s + 1], b = src[s + 2], l = (r * 77 + g * 150 + b * 29) >> 8, k = vig[v], n = gr[(v + off) & (UI_GRAIN_N - 1)];
      dst[d] = lut[(l + (r - l) * 0.8) | 0] * k + n; dst[d + 1] = lut[(l + (g - l) * 0.8) | 0] * k + n; dst[d + 2] = lut[(l + (b - l) * 0.8) | 0] * k + n; dst[d + 3] = 255;
    }
  }
  uiPipFrameCtx.putImageData(uiPipImg, 0, 0);
}
function uiPipProject(x, y, z) { _uiPv.set(x, z, -y).project(uiPipCam); return [(_uiPv.x + 1) * 0.5 * UI_PIP.w, (1 - _uiPv.y) * 0.5 * UI_PIP.h]; }
function uiVisionState(t) {   // what S5 sees: phase index | wait | acq | proc | result, the assembly under the camera, its result
  const ds = dialState(t), vs = visionState(t), k = Math.floor(ds.turn + 1e-9), a = k + 2;
  const mk = marks.vision[k] && marks.vision[k].a === a ? marks.vision[k] : marks.vision.find((m) => m.a === a) || null;
  let phase = "wait";
  if (ds.moving) phase = "index";
  else if (vs.seg.kind === "inspect" && vs.a === a) phase = "acq";
  else if (vs.seg.kind === "process" && vs.a === a) phase = "proc";
  else if (mk && t >= mk.t1) phase = "result";
  return { phase, a, mk, flash: vs.flash };
}
function uiVisionMeas(mk) {   // measured values: the defect plus a small, repeatable gauge scatter
  return mk.pass ? { dh: (uiNoise(mk.a, 1) - 0.5) * 0.08, tilt: 0.05 + uiNoise(mk.a, 2) * 0.3 }
                 : { dh: mk.capH * 1000 + (uiNoise(mk.a, 1) - 0.5) * 0.04, tilt: mk.tilt + (uiNoise(mk.a, 2) - 0.5) * 0.1 };
}
function uiPipDraw(t, info) {
  const c = uiPipCtx, W = uiPipCanvas.width, H = uiPipCanvas.height, k = W / UI_PIP.w;
  if (!uiPipFont) uiPipFont = css("--mono") || "monospace";
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
  c.drawImage(uiPipFrame, 0, 0, W, H);
  const S5 = st(5), zCap = HB + STACK.C1 + PART.C.h, pxmm = (UI_PIP.h / 2) / ((TOOL.camera.z0 - zCap) * Math.tan((UI_PIP.fov * RAD) / 2)) / 1000;
  const result = info.phase === "result" && info.mk, pass = result && info.mk.pass;
  const col = info.phase === "acq" || info.phase === "proc" ? "#ffc247" : result ? (pass ? "#46e08c" : "#ff5a52") : "#7fd3ff";
  c.save();
  // crosshair through the optical axis (the S5 nest centre)
  c.strokeStyle = "rgba(127, 211, 255, 0.55)"; c.lineWidth = Math.max(1, k * 0.9); c.setLineDash([5 * k, 4 * k]);
  const cx = W / 2, cy = H / 2, gap = 14 * k;
  c.beginPath(); c.moveTo(0, cy); c.lineTo(cx - gap, cy); c.moveTo(cx + gap, cy); c.lineTo(W, cy); c.moveTo(cx, 0); c.lineTo(cx, cy - gap); c.moveTo(cx, cy + gap); c.lineTo(cx, H); c.stroke();
  c.setLineDash([]);
  c.beginPath(); c.arc(cx, cy, 2.2 * k, 0, Math.PI * 2); c.stroke();
  // ROI around the cap (search region before the trigger)
  if (info.phase !== "index") {
    const hook = DEFECTS[info.a] && DEFECTS[info.a].kind === "hook" && t >= (marks.press.find((m) => m.a === info.a)?.rel ?? Infinity);
    const zc = zCap + (hook ? DEFECTS[info.a].rise : 0), lean = hook ? PART.C.h * Math.sin(DEFECTS[info.a].tilt * RAD) : 0;
    const [px, py] = uiPipProject(S5.x + Math.sin(S5.a) * lean, S5.y - Math.cos(S5.a) * lean, zc);
    const rr = (PART.C.d / 2 + 0.0019) * 1000 * pxmm * k, X = px * k, Y = py * k;
    c.strokeStyle = col; c.lineWidth = 1.6 * k;
    if (info.phase === "wait") c.setLineDash([4 * k, 3 * k]);
    c.beginPath(); c.arc(X, Y, rr, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + Math.PI / 4; c.beginPath(); c.moveTo(X + Math.cos(a) * (rr + 3 * k), Y + Math.sin(a) * (rr + 3 * k)); c.lineTo(X + Math.cos(a) * (rr + 8 * k), Y + Math.sin(a) * (rr + 8 * k)); c.stroke(); }
    c.font = `600 ${8.5 * k}px ${uiPipFont}`; c.fillStyle = col; c.textBaseline = "bottom"; c.textAlign = "left";
    c.fillText(`ROI 1 · cap`, X + rr * 0.72 + 4 * k, Y - rr * 0.72);
    if (result && !pass) {   // measured tilt vector, x10
      const [qx, qy] = uiPipProject(S5.x, S5.y, zc);
      c.strokeStyle = col; c.lineWidth = 1.4 * k; c.beginPath(); c.moveTo(qx * k, qy * k);
      const ex = qx * k + (px - qx) * k * 10, ey = qy * k + (py - qy) * k * 10; c.lineTo(ex, ey); c.stroke();
      c.beginPath(); c.arc(ex, ey, 2.2 * k, 0, Math.PI * 2); c.fillStyle = col; c.fill();
    }
  }
  // header: camera + state, verdict badge
  c.font = `600 ${9.5 * k}px ${uiPipFont}`; c.textBaseline = "middle"; c.textAlign = "left";
  const stateTxt = { index: "INDEXING", wait: "ARMED", acq: "ACQUIRE · 6 ms", proc: "PROCESSING", result: "RESULT" }[info.phase];
  const head = `S5 CAM1 · ${stateTxt}`;
  c.fillStyle = "rgba(0, 0, 0, 0.55)"; c.fillRect(6 * k, 6 * k, c.measureText(head).width + 12 * k, 16 * k);
  c.fillStyle = info.phase === "acq" ? "#ffc247" : "#e6edf3"; c.fillText(head, 12 * k, 14.5 * k);
  if (info.phase !== "index" && info.phase !== "wait") {
    const txt = info.phase === "result" ? (pass ? "PASS" : "FAIL") : "BUSY", w = c.measureText(txt).width + 16 * k;
    c.fillStyle = info.phase === "result" ? (pass ? "#1f9d55" : "#d93a32") : "rgba(0, 0, 0, 0.55)";
    c.beginPath(); c.roundRect(W - w - 6 * k, 6 * k, w, 16 * k, 3 * k); c.fill();
    c.fillStyle = info.phase === "result" ? "#fff" : "#ffc247"; c.textAlign = "center"; c.fillText(txt, W - w / 2 - 6 * k, 14.5 * k);
  }
  // footer: measurement and a 5 mm scale bar
  c.fillStyle = "rgba(0, 0, 0, 0.6)"; c.fillRect(0, H - 19 * k, W, 19 * k);
  c.textAlign = "left"; c.fillStyle = "#e6edf3"; c.font = `500 ${9.5 * k}px ${uiPipFont}`;
  let foot = `#${info.a}`;
  if (result) { const v = uiVisionMeas(info.mk); foot += `  Δh ${v.dh >= 0 ? "+" : "−"}${Math.abs(v.dh).toFixed(2)} mm  tilt ${v.tilt.toFixed(1)}°  ${Math.round(VISION.tProc * 1000)} ms`; }
  else if (info.phase === "proc") foot += "  measuring cap height + tilt …";
  else if (info.phase === "acq") foot += "  ring light flash";
  else if (info.phase === "index") foot = "dial indexing · no trigger";
  else foot += "  waiting for dial in position";
  c.fillText(foot, 7 * k, H - 9.5 * k);
  const bar = 5 * pxmm * k, bx = W - bar - 9 * k, by = H - 9.5 * k;
  c.strokeStyle = "#e6edf3"; c.lineWidth = 1.5 * k; c.beginPath(); c.moveTo(bx, by - 3 * k); c.lineTo(bx, by + 3 * k); c.moveTo(bx, by); c.lineTo(bx + bar, by); c.moveTo(bx + bar, by - 3 * k); c.lineTo(bx + bar, by + 3 * k); c.stroke();
  c.textAlign = "center"; c.font = `500 ${8 * k}px ${uiPipFont}`; c.fillText("5 mm", bx + bar / 2, by - 6 * k);
  c.restore();
}
function uiPipTick() {   // from the loop, after the main render
  if (!uiPipVisible || !panelOpen("process-card")) return;
  if (++uiPipN % UI_PIP.every) return;
  const t = mode === "program" ? time : 0;
  if (t === uiPipT && !uiPipDirty) return;   // paused: the picture does not change
  if (!sun.shadow.map) return;               // the shadow map was just reallocated (HQ switch): next time
  uiPipRender();
  uiPipT = t; uiPipDirty = false;
  const info = uiVisionState(t);
  uiPipDevelop(1 + 0.6 * info.flash);
  uiPipDraw(t, info);
}
const uiVis = { res: $("vision-res"), sub: $("vision-sub") };
uiVis.res.innerHTML = ["Assembly", "Cap Δh", "Tilt", "Verdict"].map((k) => `<div><small>${k}</small><b>–</b></div>`).join("");
uiVis.cells = [...uiVis.res.querySelectorAll("b")];
function uiVisionTick(t) {
  const info = uiVisionState(t), res = info.phase === "result" && info.mk;
  const v = res ? uiVisionMeas(info.mk) : null;
  uiText(uiVis.cells[0], info.phase === "index" ? "–" : `#${info.a}`);
  uiText(uiVis.cells[1], v ? `${v.dh >= 0 ? "+" : "−"}${Math.abs(v.dh).toFixed(2)} mm` : "–");
  uiText(uiVis.cells[2], v ? `${v.tilt.toFixed(1)}°` : "–");
  uiText(uiVis.cells[3], res ? (info.mk.pass ? "PASS" : "FAIL") : info.phase === "acq" || info.phase === "proc" ? "busy" : "–");
  uiVis.cells[3].className = res ? (info.mk.pass ? "ok" : "warn") : "";
  uiText(uiVis.sub, { index: "dial indexing", wait: `#${info.a} · armed`, acq: `#${info.a} · acquiring`, proc: `#${info.a} · processing`, result: `#${info.a} · ${Math.round(VISION.tProc * 1000)} ms` }[info.phase]);
}
function updateProcess(t, ps) {
  if (!panelOpen("process-card")) return;
  uiPressTick(t, ps); uiVisionTick(t);
}

// ---- feeders card: bowl level (display model: picks drain the bowl, the pendulum sensor starts the hopper), escapement,
// queue state and the linear track drawn to scale (pick nest left, bowl outlet right).
const UI_BOWL = [{ cap: 400, l0: 0.505, rate: 4 }, { cap: 1500, l0: 0.62, rate: 15 }, { cap: 600, l0: 0.47, rate: 6 }];
const UI_LVL = { on: 0.45, off: 0.50, dt: 0.05 };
let uiBowl = [];
function uiBowlModel() {
  const n = Math.ceil(DURATION / UI_LVL.dt) + 2;
  uiBowl = FEED.map((f, i) => {
    const B = UI_BOWL[i], picks = marks.pick.filter((p) => p.f === i).map((p) => p.t).sort((a, b) => a - b);
    const lv = new Float32Array(n), hop = new Uint8Array(n);
    let L = B.l0, on = false, j = 0;
    for (let s = 0; s < n; s++) {
      const t = s * UI_LVL.dt;
      while (j < picks.length && picks[j] <= t) { L -= 1 / B.cap; j++; }
      if (on) { L += (B.rate / B.cap) * UI_LVL.dt; if (L >= UI_LVL.off) on = false; } else if (L < UI_LVL.on) on = true;
      lv[s] = L; hop[s] = on ? 1 : 0;
    }
    return { lv, hop };
  });
}
const UI_TRK = { x0: 10, x1: 240, w: 280 };   // viewBox is wider than the rail so the bowl label stays inside the card
const UI_PD = { A: [PART.A.flangeD, 12], B: [PART.B.od, 8], C: [PART.C.d, 9] };   // footprint along the track (m), drawn height (px)
const uiTrkX = (f, s) => UI_TRK.x0 + (s / f.track) * (UI_TRK.x1 - UI_TRK.x0);
const feederRows = FEED.map((f) => {
  const [d, ph] = UI_PD[f.part], w = Math.max(2.2, (d / f.track) * (UI_TRK.x1 - UI_TRK.x0)), qf = 0.12;
  let svg = `<svg viewBox="0 0 ${UI_TRK.w} 26" aria-hidden="true">`;
  svg += `<rect class="rail" x="${UI_TRK.x0 - 9}" y="20" width="${UI_TRK.x1 - UI_TRK.x0 + 9}" height="4" rx="1"/>`;
  svg += `<rect class="nest" x="${UI_TRK.x0 - 9}" y="4" width="18" height="20" rx="2"/>`;
  svg += `<path class="bowl" d="M${UI_TRK.x1 + 2} 24 Q ${UI_TRK.x1 + 14} 23 ${UI_TRK.x1 + 19} 12 Q ${UI_TRK.x1 + 21} 6 ${UI_TRK.x1 + 21} 2"/><text x="${UI_TRK.x1 + 3}" y="9">bowl</text>`;
  svg += `<circle class="qf" cx="${uiTrkX(f, qf)}" cy="4" r="2.4"/><text x="${uiTrkX(f, qf) + 5}" y="7">Q-full</text>`;
  for (const s of [f.pitch * 0.5, f.pitch * 1.5]) svg += `<line class="pin" x1="${uiTrkX(f, s)}" x2="${uiTrkX(f, s)}" y1="${20 - ph - 2}" y2="20"/>`;
  for (let n = 0; n < f.q + 4; n++) svg += `<rect class="p ${f.part}" y="${20 - ph}" width="${w.toFixed(2)}" height="${ph}" rx="1" style="display:none"/>`;
  svg += "</svg>";
  const row = el("div", "fd", `<div class="fd-lvl" title="Bowl level (est.), pendulum sensor starts the hopper below ${UI_LVL.on * 100} %"><i></i><s style="bottom:${UI_LVL.on * 100}%"></s></div>
    <div class="fd-top"><span class="id" style="background:var(--part-${f.part.toLowerCase()})">${f.id}</span><b>${f.name}</b><small>${f.rate} /min</small><span class="state">–</span></div>
    <div class="fd-trk">${svg}</div>
    <div class="fd-st"><span><i class="led"></i>esc <b>–</b></span><span><i class="led"></i>nest <b>–</b></span><span>queue <b>–</b></span><span>picks <b>–</b></span><span><i class="led"></i>bowl <b>–</b></span></div>`);
  $("feeders").appendChild(row);
  const st = row.querySelectorAll(".fd-st span"), leds = row.querySelectorAll(".fd-st .led");
  return { f, w, sig: "", rects: [...row.querySelectorAll("rect.p")], pins: [...row.querySelectorAll(".pin")], qf: row.querySelector(".qf"),
    lvl: row.querySelector(".fd-lvl"), lvlI: row.querySelector(".fd-lvl i"), state: row.querySelector(".state"), rate: row.querySelector(".fd-top small"),
    esc: st[0].querySelector("b"), nest: st[1].querySelector("b"), queue: st[2].querySelector("b"), picks: st[3].querySelector("b"), bowl: st[4].querySelector("b"),
    ledEsc: leds[0], ledNest: leds[1], ledHop: leds[2] };
});
function updateFeeders(t) {
  if (!panelOpen("feeders-card")) return;
  for (const r of feederRows) {
    const f = r.f, s = feederState(f.i, t), still = s.queue.filter((e) => !e.moving), moving = s.esc > 0 && s.esc < 1;
    let sig = `${s.present ? 1 : 0}|${s.esc.toFixed(3)}`;
    for (const e of s.queue) sig += `|${(e.s * 2000).toFixed(0)}`;
    if (sig !== r.sig) {   // redraw the parts on the track
      r.sig = sig;
      let n = 0;
      const put = (sv, mv) => { const rc = r.rects[n++]; if (!rc) return; uiAttr(rc, "x", (uiTrkX(f, sv) - r.w / 2).toFixed(2)); uiAttr(rc, "class", `p ${f.part}${mv ? " mv" : ""}`); uiStyle(rc, "display", ""); };
      if (s.present) put(0, false);
      for (const e of s.queue) put(e.s, e.moving);
      for (; n < r.rects.length; n++) uiStyle(r.rects[n], "display", "none");
      for (const p of r.pins) uiAttr(p, "class", moving ? "pin open" : "pin");
      const d = UI_PD[f.part][0];
      r.qf.classList.toggle("on", still.some((e) => Math.abs(e.s - 0.12) < d / 2 + f.pitch * 0.05));
    }
    const full = still.length >= f.q, state = s.starved ? "starved" : full ? "full" : "feeding";
    uiText(r.state, { starved: "STARVED", full: "QUEUE FULL", feeding: "FEEDING" }[state]); uiAttr(r.state, "class", `state ${state}`);
    r.state.title = s.seg.label;
    uiText(r.rate, `${f.rate} /min`);
    uiText(r.esc, moving ? "moving" : "closed"); uiAttr(r.ledEsc, "class", moving ? "led amber" : "led");
    uiText(r.nest, s.present ? "part" : "empty"); uiAttr(r.ledNest, "class", s.present ? "led on" : "led");
    uiText(r.queue, `${still.length}/${f.q}`); uiText(r.picks, String(s.picks));
    const B = uiBowl[f.i], k = B ? clamp(Math.floor(t / UI_LVL.dt), 0, B.lv.length - 1) : 0, lv = B ? B.lv[k] : 0, hop = B ? B.hop[k] : 0;
    uiText(r.bowl, `${Math.round(lv * 100)} %${hop ? " · hopper on" : ""}`); uiAttr(r.ledHop, "class", hop ? "led on" : "led");
    uiStyle(r.lvlI, "transform", `scaleY(${clamp(lv, 0, 1).toFixed(3)})`); r.lvl.classList.toggle("fill", !!hop);
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
    uiStyle(j.i, "left", `${(f * 100).toFixed(2)}%`); uiText(j.v, `${fmt(vals[i], 1)} ${j.unit}`);
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
const uiTcp = { delta: ["x", "y", "z"].map((c) => $(`tcp-delta-${c}`)), scara: ["x", "y", "z"].map((c) => $(`tcp-scara-${c}`)) };
function showTcp(dp, q) {
  if (!panelOpen("report-card")) return;
  const k = t3FK(q).tcp;
  for (let j = 0; j < 3; j++) { uiText(uiTcp.delta[j], (dp[j] * 1000).toFixed(0)); uiText(uiTcp.scara[j], (k[j] * 1000).toFixed(0)); }
}
function renderReport() {
  const st = STATS, rows = [
    ["Run", `${DURATION.toFixed(2)} s`], ["Cycle (steady state)", `${CYCLE.toFixed(3)} s`], ["Throughput", `${Math.round(3600 / CYCLE)} parts/h`],
    ["Good / rejected", `${st.good} / ${st.rejected}`], ["Tray exchanges", `${st.swaps}`], ["Dial index", `${DIAL.index.toFixed(2)} s + ${DIAL.sig.toFixed(2)} s signals`],
    ...PAIRS.map((p, j) => [`Min. ${p.join("–")}`, `<span class="${minClear[j].m >= 0.025 ? "ok" : "warn"}">${(minClear[j].m * 1000).toFixed(1)} mm @ ${minClear[j].at.toFixed(2)} s</span>`]),
    ["Delta IK", ikFail ? `<span class="warn">${ikFail} unreachable</span>` : `<span class="ok">reachable at all ${NS} samples</span>`],
    ["Peak delta TCP speed", `${peakV.toFixed(2)} m/s`], ["Peak shoulder speed", `${(peakW * DEG).toFixed(0)} °/s`],
    ["Utilisation delta / T3 / press", `${Math.round(st.util.delta * 100)} / ${Math.round(st.util.scara * 100)} / ${Math.round(st.util.press * 100)} %`],
    ["OEE (A · P · Q)", `${(100 * Math.min(1, UI_IDEAL_CYCLE / CYCLE) * (st.good / Math.max(1, st.good + st.rejected))).toFixed(1)} % (ideal ${UI_IDEAL_CYCLE.toFixed(1)} s)`],
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
  const W = 320, H = 140, ys = indexCurve.map((p) => p[1]);
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
  uiBuildRejects(); uiBowlModel();
  buildProgram(); renderGantt(); drawLanes(); renderReport(); renderWhatIf(); rebuildPaths(); rebuildTracked();
  for (const a of NOW_ACTORS) nowEls[a].seg = null;
  lastOwners = []; lastTraySig = ""; lastDialSig = ""; uiRejSig = ""; uiFxKey = ""; uiFxPos = ""; uiPipDirty = true;
  for (const r of feederRows) r.sig = "";
}
function refreshModel(o) {
  rebuild(o);
  time = Math.min(time, DURATION);
  refreshAll();
}
function uiThemeChanged() { lastOwners = []; lastDialSig = ""; uiPipDirty = true; uiPipFont = ""; drawLanes(); renderGantt(); renderWhatIf(); }
