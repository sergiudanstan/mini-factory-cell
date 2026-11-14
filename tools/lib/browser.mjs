// Shared helpers for tools/shots.mjs, stats.mjs and record.mjs: CLI flags, a local static server,
// Chrome (headless, GPU WebGL2) through playwright-core, page error collection and frame waits.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CHROME = process.env.CHROME_PATH || "/opt/google/chrome/chrome";

// playwright-core from this checkout, else (a git worktree without node_modules) from the main checkout
async function loadPlaywright() {
  try {
    return await import("playwright-core");
  } catch { /* not installed here */ }
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const main = join(dirname(common), "node_modules/playwright-core/index.mjs");
    if (existsSync(main)) return await import(pathToFileURL(main).href);
  } catch { /* not a git checkout */ }
  return null;
}
const pw = await loadPlaywright();
if (!pw) {
  console.error(`playwright-core is not installed: run "npm install" in ${REPO}`);
  process.exit(2);
}
const { chromium } = pw;

// ---------------------------------------------------------------- exit handling
// Children are killed synchronously on exit, so errors, Ctrl-C and SIGTERM never leave a server behind.
// Playwright kills its own Chrome in its exit handler.
const exitKills = new Set();
process.on("exit", () => {
  for (const kill of exitKills) {
    try { kill(); } catch { /* already gone */ }
  }
});
for (const [sig, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]]) {
  process.once(sig, () => {
    console.error(`\n${sig}: stopping`);
    process.exit(code);
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const firstLine = (e) => String(e?.message || e).split("\n")[0];

// ---------------------------------------------------------------- one Chrome at a time, machine-wide
// Several agents share this laptop (about 3 GB of free RAM). Every tool run takes /tmp/mfc-chrome.lock (a directory,
// created atomically) before it starts Chrome and drops it when Chrome closes or the process exits. A lock whose owner
// process is gone, or that is older than 20 minutes, is broken. MFC_LOCK_WAIT_S caps the wait (default 1500 s).
const LOCK = process.env.MFC_CHROME_LOCK || "/tmp/mfc-chrome.lock";
let lockHeld = false;
function lockOwner() { try { return JSON.parse(readFileSync(join(LOCK, "owner.json"), "utf8")); } catch { return null; } }
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } }
export function releaseChromeLock() {
  if (!lockHeld) return;
  lockHeld = false;
  try { const o = lockOwner(); if (!o || o.pid === process.pid) rmSync(LOCK, { recursive: true, force: true }); } catch { /* gone */ }
}
export async function acquireChromeLock(label, maxWaitS = Number(process.env.MFC_LOCK_WAIT_S || 1500)) {
  const t0 = Date.now();
  let nextSay = 0;
  for (;;) {
    try {
      mkdirSync(LOCK);
      writeFileSync(join(LOCK, "owner.json"), JSON.stringify({ pid: process.pid, label, since: Date.now() }));
      lockHeld = true;
      exitKills.add(releaseChromeLock);
      return;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    const o = lockOwner(), age = o ? (Date.now() - o.since) / 1000 : 0;
    if (o && (!pidAlive(o.pid) || age > 1200)) { rmSync(LOCK, { recursive: true, force: true }); continue; }
    if (!o) {   // owner file not written yet: a lock without one for 10 s is stale
      try { if (Date.now() - statSync(LOCK).mtimeMs > 10000) { rmSync(LOCK, { recursive: true, force: true }); continue; } } catch { continue; }
    }
    const waited = (Date.now() - t0) / 1000;
    if (waited > maxWaitS) throw new Error(`Chrome lock ${LOCK} still held after ${Math.round(waited)} s by ${o ? `pid ${o.pid} (${o.label})` : "an unknown process"}`);
    if (waited >= nextSay) { console.log(`waiting for the shared Chrome lock (held by ${o ? `pid ${o.pid}: ${o.label}, ${Math.round(age)} s` : "?"})`); nextSay = waited + 30; }
    await sleep(1000);
  }
}

// Prints a fatal error (with stack only for programming errors) and sets exit code 1.
export function reportFatal(e) {
  const prog = e instanceof TypeError || e instanceof ReferenceError || e instanceof SyntaxError || e instanceof RangeError;
  console.error(`error: ${prog ? e.stack : e?.message ?? e}`);
  process.exitCode = 1;
}

// ---------------------------------------------------------------- flags
// spec: { name: { type, default, help } }; types: bool, string, int, num, list, nums, size (WxH), onoff.
const COMMON = {
  root: { type: "string", help: "folder to serve (default: the repo root)" },
  port: { type: "int", help: "http port (default: $PORT or 8780)" },
  query: { type: "string", help: "extra URL query, e.g. theme=dark&x=1" },
  headed: { type: "bool", help: "visible Chrome window on Wayland instead of headless" },
  gpu: { type: "string", help: "auto|vulkan|egl|swiftshader|native (default: auto headless, native headed)" },
  uncapped: { type: "bool", help: "no 60 Hz vsync cap, so fps shows the real headroom" },
  seed: { type: "int", default: 1, help: "Math.random seed for repeatable images; 0 = native random" },
  help: { type: "bool", help: "show this help" },
};
const HINT = { bool: "", string: " STR", int: " N", num: " T", list: " a,b", nums: " x,y", size: " WxH", onoff: " on|off" };
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function convert(type, val, name) {
  const bad = () => { throw new Error(`--${name}: bad value "${val}"`); };
  const num = (v) => { const n = Number(v); if (v === "" || !Number.isFinite(n)) bad(); return n; };
  switch (type) {
    case "string": return val;
    case "int": { const n = num(val); if (!Number.isInteger(n)) bad(); return n; }
    case "num": return num(val);
    case "list": return val.split(",").map((s) => s.trim()).filter(Boolean);
    case "nums": return val.split(",").map((s) => num(s.trim()));
    case "size": {
      const m = /^(\d+)x(\d+)$/.exec(val);
      if (!m) bad();
      return { width: Number(m[1]), height: Number(m[2]) };
    }
    case "onoff":
      if (/^(on|1|true|yes)$/i.test(val)) return true;
      if (/^(off|0|false|no)$/i.test(val)) return false;
      return bad();
    default: throw new Error(`flag type ${type}`);
  }
}

export function parseFlags(spec, usage, argv = process.argv.slice(2)) {
  const all = { ...spec, ...COMMON };
  const help = () => {
    const dflt = (s) => (s.default === undefined || s.default === "" || s.type === "bool" ? "" : ` (default ${s.default})`);
    const rows = Object.entries(all).map(([k, s]) => [`--${k}${HINT[s.type]}`, s.help + (s.shown ?? dflt(s))]);
    const w = Math.max(...rows.map((r) => r[0].length));
    return `usage: ${usage}\n` + rows.map(([a, b]) => `  ${a.padEnd(w)}  ${b}`).join("\n");
  };
  const fail = (msg) => { console.error(`${msg}\n${help()}`); process.exit(2); };
  const out = {};
  for (const [k, s] of Object.entries(all)) {
    out[camel(k)] = typeof s.default === "string" && s.type !== "string" ? convert(s.type, s.default, k) : s.default;
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) fail(`unexpected argument "${a}"`);
    const eq = a.indexOf("=");
    const name = eq < 0 ? a.slice(2) : a.slice(2, eq);
    let val = eq < 0 ? undefined : a.slice(eq + 1);
    const s = all[name];
    if (!s) fail(`unknown flag --${name}`);
    if (s.type === "bool") {
      out[camel(name)] = val === undefined || !/^(0|false|off|no)$/i.test(val);
      continue;
    }
    if (val === undefined) {
      val = argv[++i];
      if (val === undefined || val.startsWith("--")) fail(`--${name} needs a value`);
    }
    try { out[camel(name)] = convert(s.type, val, name); } catch (e) { fail(e.message); }
  }
  if (out.help) { console.log(help()); process.exit(0); }
  return out;
}

// ---------------------------------------------------------------- static server
function assertPortFree(port) {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once("error", (e) => rej(new Error(e.code === "EADDRINUSE"
      ? `port ${port} is busy (another server running?): pass --port N or set PORT`
      : `port ${port}: ${e.message}`)));
    s.listen(port, "127.0.0.1", () => s.close(() => res()));
  });
}

export async function startServer(root, port) {
  if (!existsSync(join(root, "index.html"))) {
    throw new Error(`no index.html in ${root}` + (root === REPO ? ` (run "npm run build" first)` : ""));
  }
  await assertPortFree(port);
  const proc = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  let log = "";
  const keep = (d) => { log = (log + d).slice(-4000); };
  proc.stdout.on("data", keep);
  proc.stderr.on("data", keep);
  const alive = () => proc.exitCode === null && proc.signalCode === null;
  const stop = () => { if (alive()) proc.kill("SIGTERM"); exitKills.delete(stop); };
  exitKills.add(stop);
  proc.on("error", (e) => { log += `\nspawn python3: ${e.message}`; });
  const url = `http://127.0.0.1:${port}/`;
  const t0 = Date.now();
  for (;;) {
    if (!alive() || proc.pid === undefined) { stop(); throw new Error(`http.server did not start:\n${log}`); }
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await r.body?.cancel();
      if (r.status < 500 && alive()) break;
    } catch { /* not up yet */ }
    if (Date.now() - t0 > 10000) { stop(); throw new Error(`http.server did not answer on ${url}\n${log}`); }
    await sleep(100);
  }
  return { url, root, stop, log: () => log };
}

// ---------------------------------------------------------------- Chrome
// Headless WebGL on this Arch/Hyprland laptop (Intel UHD + NVIDIA RTX 5050), probed with Chrome 157:
//   vulkan       ANGLE on Vulkan without a presentation surface -> NVIDIA RTX 5050 (Vulkan 1.4). Without
//                --disable-vulkan-surface the GPU process fails and WebGL2 is unavailable.
//   egl          ANGLE on native EGL; the glvnd env vars select the NVIDIA EGL vendor (else Intel Mesa).
//   swiftshader  CPU rasteriser, ~100x slower: the last resort.
//   native       Chrome defaults (headless: SwiftShader; headed: the desktop GPU).
const NV_ENV = {
  __NV_PRIME_RENDER_OFFLOAD: "1",
  __VK_LAYER_NV_optimus: "NVIDIA_only",
  __GLX_VENDOR_LIBRARY_NAME: "nvidia",
  __EGL_VENDOR_LIBRARY_FILENAMES: "/usr/share/glvnd/egl_vendor.d/10_nvidia.json",
};
export const GPU_MODES = {
  vulkan: { args: ["--use-angle=vulkan", "--disable-vulkan-surface", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] },
  egl: { args: ["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"], env: NV_ENV },
  swiftshader: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  native: { args: [] },
};
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software/i;

async function probeWebGL(browser) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) return { renderer: null };
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return { renderer };
    });
  } finally {
    await page.close();
  }
}

// Launches one Chrome; with --gpu auto it tries vulkan, egl, swiftshader in turn (one instance at a time).
export async function launchBrowser(flags = {}, size = { width: 1600, height: 900 }) {
  const headed = !!flags.headed;
  const mode = flags.gpu || (headed ? "native" : "auto");
  const order = mode === "auto" ? ["vulkan", "egl", "swiftshader"] : [mode];
  for (const m of order) {
    const g = GPU_MODES[m];
    if (!g) throw new Error(`--gpu ${m}: use auto|${Object.keys(GPU_MODES).join("|")}`);
    const args = [...g.args];
    if (headed) args.unshift("--ozone-platform=wayland", `--window-size=${size.width + 16},${size.height + 120}`);
    if (flags.uncapped) args.push("--disable-frame-rate-limit", "--disable-gpu-vsync");
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: CHROME,
        headless: !headed,
        args,
        env: { ...process.env, ...(g.env || {}) },
        timeout: 30000,
      });
    } catch (e) {
      console.warn(`gpu=${m}: Chrome did not start: ${firstLine(e)}`);
      continue;
    }
    const { renderer = null, error } = await probeWebGL(browser).catch((e) => ({ error: firstLine(e) }));
    const software = !renderer || SOFTWARE.test(renderer);
    if (renderer && (!software || order.length === 1 || m === "swiftshader")) {
      console.log(`chrome ${browser.version()} ${headed ? "headed" : "headless"} gpu=${m}`);
      console.log(`webgl: ${renderer}`);
      if (software) console.warn("WARNING: software WebGL (SwiftShader): images are fine, fps numbers are not meaningful");
      return { browser, gpu: m, renderer, software };
    }
    console.warn(`gpu=${m}: ${renderer ? `software renderer (${renderer})` : `no WebGL2${error ? ` (${error})` : ""}`}, trying the next mode`);
    await browser.close().catch(() => {});
  }
  throw new Error("Chrome did not start with WebGL2 in any GPU mode");
}

// ---------------------------------------------------------------- pages
// Counts WebGL draw calls and triangles per animation frame (all contexts, incl. shadow and post passes).
// Install with { glCounter: true }; read window.__glCounter.history (last 30 frames) and .last
// (the last frame that drew anything, for pages that render on demand).
function glCounterInit() {
  const st = { calls: 0, triangles: 0, history: [], last: null };
  window.__glCounter = st;
  const add = (mode, count, inst = 1) => {
    st.calls += 1;
    if (mode === 4) st.triangles += Math.floor(count / 3) * inst;
    else if (mode === 5 || mode === 6) st.triangles += Math.max(0, count - 2) * inst;
  };
  const patch = (obj, name, fn) => {
    const orig = obj && obj[name];
    if (typeof orig !== "function") return;
    obj[name] = function (...a) { fn(a); return orig.apply(this, a); };
  };
  const sum = (list, off, n) => { let s = 0; for (let i = 0; i < n; i++) s += list[off + i]; return s; };
  const multi = (ext) => {
    if (!ext || ext.__counted) return ext;
    ext.__counted = true;
    patch(ext, "multiDrawArraysWEBGL", (a) => add(a[0], sum(a[3], a[4], a[5])));
    patch(ext, "multiDrawElementsWEBGL", (a) => add(a[0], sum(a[1], a[2], a[6])));
    patch(ext, "multiDrawArraysInstancedWEBGL", (a) => { for (let i = 0; i < a[7]; i++) add(a[0], a[3][a[4] + i], a[5][a[6] + i]); st.calls -= a[7] - 1; });
    patch(ext, "multiDrawElementsInstancedWEBGL", (a) => { for (let i = 0; i < a[8]; i++) add(a[0], a[1][a[2] + i], a[6][a[7] + i]); st.calls -= a[8] - 1; });
    return ext;
  };
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    const p = C && C.prototype;
    if (!p) continue;
    patch(p, "drawArrays", (a) => add(a[0], a[2]));
    patch(p, "drawElements", (a) => add(a[0], a[1]));
    patch(p, "drawArraysInstanced", (a) => add(a[0], a[2], a[3]));
    patch(p, "drawElementsInstanced", (a) => add(a[0], a[1], a[4]));
    patch(p, "drawRangeElements", (a) => add(a[0], a[3]));
    const getExt = p.getExtension;
    p.getExtension = function (name) {
      const ext = getExt.call(this, name);
      return name === "WEBGL_multi_draw" ? multi(ext) : ext;
    };
  }
  // registered before the page's scripts, so this callback runs first in every frame
  const tick = () => {
    const f = { calls: st.calls, triangles: st.triangles };
    st.history.push(f);
    if (st.history.length > 30) st.history.shift();
    if (f.calls > 0) st.last = f;
    st.calls = 0;
    st.triangles = 0;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Replaces Math.random with a seeded PRNG (mulberry32), so page noise (e.g. the GTAO denoise
// texture) is the same on every run.
function seedInit(seed) {
  let a = seed >>> 0;
  Math.random = function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function contextLossInit() {
  addEventListener("webglcontextlost", (e) => {
    const t = e.target;
    console.error(`webglcontextlost on ${t && (t.id ? `#${t.id}` : t.className ? `canvas.${t.className}` : t.tagName)}`);
  }, true);
}

// New context + page with console/page error collection. errors: string[] (favicon noise ignored).
// seed: Math.random seed (0 keeps the native random).
export async function newPage(browser, size, { glCounter = false, seed = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
  await context.addInitScript(contextLossInit);
  if (seed) await context.addInitScript(seedInit, seed);
  if (glCounter) await context.addInitScript(glCounterInit);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    const loc = m.location() || {};
    if (/favicon/i.test(`${text} ${loc.url || ""}`)) return;
    errors.push(loc.url ? `${text}  (${loc.url.replace(/^https?:\/\/127\.0\.0\.1:\d+\//, "")}:${loc.lineNumber ?? 0})` : text);
  });
  page.on("pageerror", (e) => {
    const text = (e.stack || String(e)).split("\n").slice(0, 3).join(" | ");
    if (!/favicon/i.test(text)) errors.push(`pageerror: ${text}`);
  });
  page.on("crash", () => errors.push("page crashed (renderer process died)"));
  return { context, page, errors };
}

// Loads url and waits for window.pcReady === true.
export async function openCell(page, url, errors = [], timeout = 60000) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  try {
    await page.waitForFunction(() => window.pcReady === true, null, { timeout, polling: 100 });
  } catch (e) {
    const why = errors.length ? `\nconsole errors so far:\n  ${errors.join("\n  ")}` : "";
    throw new Error(`window.pcReady was not true within ${timeout / 1000} s at ${url} (${firstLine(e)})${why}`);
  }
}

// Resolves after n animation frames in the page.
export function frames(page, n = 2) {
  return page.evaluate((n) => new Promise((res) => {
    let k = 0;
    const f = () => (++k >= n ? res() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), n);
}

// Lets the page's 3 s HQ watchdog finish (window.__hqStats), then forces the requested quality.
// Returns false when the page has no window.setQuality.
export async function settleQuality(page, on, waitMs = 4500) {
  if (!(await page.evaluate(() => typeof window.setQuality === "function"))) return false;
  await page.waitForFunction(() => window.__hqStats !== undefined, null, { timeout: waitMs }).catch(() => {});
  await page.evaluate((on) => window.setQuality(on), on);
  await frames(page, 2);
  return true;
}

// Counts requestAnimationFrame callbacks for ms milliseconds.
export function measureFps(page, ms = 3000) {
  return page.evaluate((ms) => new Promise((res) => {
    const dts = [];
    let t0 = 0, last = 0;
    const f = (now) => {
      if (!t0) t0 = now;
      else dts.push(now - last);
      last = now;
      if (now - t0 < ms) { requestAnimationFrame(f); return; }
      dts.sort((a, b) => a - b);
      const avg = (now - t0) / dts.length;
      res({ fps: 1000 / avg, frames: dts.length, avgMs: avg, p95Ms: dts[Math.floor(dts.length * 0.95)], maxMs: dts[dts.length - 1] });
    };
    requestAnimationFrame(f);
  }), ms);
}

export function cellUrl(base, { cad = false, solo, query } = {}) {
  const u = new URL("index.html", base);
  if (!cad) u.searchParams.set("cad", "0");
  if (solo) u.searchParams.set("solo", solo);
  if (query) for (const [k, v] of new URLSearchParams(query)) u.searchParams.set(k, v);
  return u.href;
}

// Server + Chrome for one tool run. close() is safe to call twice.
export async function startSession(flags, size) {
  const root = resolve(flags.root || REPO);
  const port = flags.port ?? (process.env.PORT ? Number(process.env.PORT) : 8780);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`bad port ${port}`);
  await acquireChromeLock(`${process.argv[1]?.split("/").pop() || "tool"} ${root}`);
  let server, b;
  try {
    server = await startServer(root, port);
    b = await launchBrowser(flags, size);
  } catch (e) {
    server?.stop();
    releaseChromeLock();
    throw e;
  }
  console.log(`serving ${root} at ${server.url}`);
  return {
    ...b,
    root,
    server,
    url: (opts = {}) => cellUrl(server.url, { ...opts, query: flags.query }),
    newPage: (sz = size, opts = {}) => newPage(b.browser, sz, { seed: flags.seed ?? 1, ...opts }),
    async close() {
      let timer;
      await Promise.race([
        b.browser.close().catch(() => {}),
        new Promise((r) => { timer = setTimeout(r, 10000); }),
      ]);
      clearTimeout(timer);
      server.stop();
      releaseChromeLock();
    },
  };
}
