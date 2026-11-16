// Export a frozen glTF scene and deterministic, scene-world-space animation for Blender.
// Browser bridge is injected into this tool's HTML response; app sources remain untouched.
// Timeline (default): the film plan. Blender frame f (1-based) is one film frame of one segment: the segments of
// film/plan.json follow each other with their dissolve overlaps included (segment k occupies n_k frames), so every
// frame samples the exact remapped sim time and carries the plan's camera (same code as tools/film.mjs).
// --linear keeps the earlier contract: frame f = sim time (f - 1) / 30 over the run.
import { mkdirSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { resolve, join } from "node:path";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { REPO, parseFlags, startSession, openCell, reportFatal } from "./lib/browser.mjs";
import { loadPlan, segmentAt, segRange } from "./lib/film-plan.mjs";

const flags = parseFlags({
  out: { type: "string", default: "_cad/blender", help: "export directory" },
  plan: { type: "string", default: join(REPO, "film/plan.json"), help: "film plan that drives the timeline and the camera" },
  "from-seg": { type: "int", help: "first plan segment to export (1-based, default 1)" },
  "to-seg": { type: "int", help: "last plan segment to export (default the last)" },
  linear: { type: "bool", help: "old timeline: 30 Hz sim samples over the run, no plan camera" },
  fps: { type: "int", default: 30, help: "sampling rate (production: 30)" },
  to: { type: "num", help: "--linear only: end time, exclusive (default full cycle)" },
  batch: { type: "int", default: 10, help: "samples per browser call" },
  cad: { type: "bool", help: "export the Epson CAD robot instead of the procedural one" },
}, "node tools/export-blender.mjs --port 8788 [--out _cad/blender] [--plan film/plan.json] [--from-seg A --to-seg B]");
if (flags.fps !== 30) throw new Error("The animation contract requires --fps 30");
if (flags.batch < 1 || flags.batch > 100) throw new Error("batch must be 1..100");
const out = resolve(flags.out); mkdirSync(out, { recursive: true });

// plan timeline: one entry per Blender frame { f, seg, j, sim, cam: [px, py, pz, tx, ty, tz, fov] (cell frame) }
function planTimeline() {
  const file = resolve(flags.plan), plan = loadPlan(file);
  if (plan.fps !== flags.fps) throw new Error(`plan fps ${plan.fps}: the export needs ${flags.fps}`);
  const R = segRange(plan, flags.fromSeg ?? 1, flags.toSeg ?? plan.segments.length);
  const frames = [], segments = [];
  for (const seg of plan.segments.slice(R.a - 1, R.b)) {
    const n = Math.round(seg.dur * plan.fps), f0 = frames.length + 1, first = seg.n === R.a;
    for (let j = 0; j < n; j++) {
      const c = segmentAt(seg, seg.T0 + j / plan.fps);
      frames.push({ f: frames.length + 1, seg: seg.n, j, sim: +c.sim.toFixed(9), cam: [...c.pos, ...c.target, c.fov].map((v) => +v.toFixed(6)) });
    }
    segments.push({ n: seg.n, label: seg.label || "", dir: `s${String(seg.n).padStart(2, "0")}`, f0, f1: frames.length, frames: n,
      sim: seg.sim, rate: seg.rate, T0: seg.T0, T1: seg.T1, xfade: first ? 0 : seg.xfade, blender: seg.blender || {} });
  }
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16);
  return { plan, file, hash, R, frames, segments };
}

function bridge() {
  const entries = [], materials = [], materialIds = new Map(), usedNames = new Set();
  const cloneScene = new THREE.Scene(), modules = new Map(), geometryCopies = new Map(), temp = new THREE.Matrix4();
  const materialNames = new Map(Object.entries(M).map(([k, v]) => [v, k]));
  const unique = (s) => { let n = s, i = 1; while (usedNames.has(n)) n = `${s}_${i++}`; usedNames.add(n); return n; };
  const visible = (o) => { for (let a = o; a; a = a.parent) if (!a.visible) return false; return true; };
  const advance = (t) => {
    time = t; mode = "program"; playing = true; update(0); playing = false;
    world.updateWorldMatrix(true, true);
  };
  // material names: the M key, else the material's own name, else the first module/object that uses it
  const clean = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "detail";
  const material = (m, hint) => {
    if (materialIds.has(m)) return materialIds.get(m);
    const id = materials.length, name = `mfc_material_${id}_${clean(materialNames.get(m) || m.name || hint || "detail")}`;
    const copy = m.clone(); copy.name = name;
    materialIds.set(m, id);
    materials.push({ source: m, copy, name, id });
    return id;
  };
  const copiedMaterial = (m, hint) => Array.isArray(m) ? m.map(x => materials[material(x, hint)].copy) : materials[material(m, hint)].copy;
  const copiedGeometry = (geo) => {
    if (!geometryCopies.has(geo.uuid)) geometryCopies.set(geo.uuid, geo.clone());
    return geometryCopies.get(geo.uuid);
  };
  advance(0);
  for (const [moduleName, root] of Object.entries(MODULES)) {
    const group = new THREE.Group(); group.name = `module_${moduleName}`; cloneScene.add(group); modules.set(moduleName, group);
    let ordinal = 0;
    root.traverse((o) => {
      if (!o.isMesh && !o.name) return;
      if (o.isLine || o.isLight || o.isCamera) return;
      const stem = `${moduleName}__${o.name || `mesh_${ordinal++}`}`;
      const track = Object.values(tracked).find(v => v.im === o);
      const capacity = o.isInstancedMesh ? (track ? track.list.length : /flow/.test(o.name) ? o.instanceMatrix.count : o.count) : 1;
      for (let i = 0; i < capacity; i++) {
        const name = unique(`${stem}${o.isInstancedMesh ? `__${String(i).padStart(4, "0")}` : ""}`);
        const e = { name, module: moduleName, source: o, instance: o.isInstancedMesh ? i : null, tracked: track || null, clone: null, previous: null, geo: null };
        const mesh = o.isMesh ? new THREE.Mesh(copiedGeometry(o.geometry), copiedMaterial(o.material, `${moduleName}-${o.name || "mesh"}`)) : new THREE.Group();
        mesh.name = name; mesh.matrixAutoUpdate = false; mesh.userData = { mfc_id: name, module: moduleName };
        group.add(mesh); e.clone = mesh; entries.push(e);
      }
    });
  }
  function ranks(t) {
    const map = new Map(), dp = deltaPose(t), tp = t3Pose(t);
    for (const track of Object.values(tracked)) {
      let rank = 0;
      map.set(track, track.list.map(p => partPose(p, t, dp, tp) ? rank++ : -1));
    }
    return map;
  }
  function state(e, rankMap) {
    const o = e.source; let on = visible(o), index = e.instance;
    if (e.tracked) { index = rankMap.get(e.tracked)[index]; on &&= index >= 0; }
    temp.copy(o.matrixWorld);
    if (index !== null) {
      on &&= index >= 0 && index < o.count;
      if (on) { const local = new THREE.Matrix4(); o.getMatrixAt(index, local); temp.multiply(local); }
    }
    // Hidden objects get identity transform but remain in glTF; visibility is explicit in JSON.
    const matrix = on ? temp.toArray().map(n => +n.toFixed(9)) : (e.previous?.matrix || new THREE.Matrix4().toArray());
    if (!matrix.every(Number.isFinite)) throw new Error(`Nonfinite matrix: ${e.name}`);
    return { matrix, visible: on };
  }
  const rank0 = ranks(0), manifest = [];
  for (const e of entries) {
    const s = state(e, rank0); e.previous = s; e.clone.matrix.fromArray(s.matrix);
    e.clone.matrix.decompose(e.clone.position, e.clone.quaternion, e.clone.scale);
    e.clone.visible = true;
    if (e.source.isMesh && !e.source.isInstancedMesh) e.geo = Array.from(e.source.geometry.attributes.position.array);
    manifest.push({ id: e.name, module: e.module, sourceName: e.source.name, instance: e.instance,
      part: e.tracked ? e.tracked.list[e.instance] : undefined, initial: s,
      materials: e.source.material ? (Array.isArray(e.source.material) ? e.source.material : [e.source.material]).map((m) => material(m)) : [],
      vertexCount: e.source.isMesh ? e.source.geometry.attributes.position.count : 0 });
  }
  window.mfcExport = {
    scene: cloneScene,
    meta: { schema: "mfc-blender-1", fps: 30, duration: DURATION,
      coordinateSystem: "three.js scene-world, Y up; matrices column-major. Blender transform = C M C^-1, C = Rx(+pi/2)",
      frameSemantics: "frame 1 is t=0; sparse state patches hold until replaced; hidden objects retained",
      nodes: manifest, materials: materials.map(m => ({ id: m.id, name: m.name, color: m.source.color?.toArray(), metalness: m.source.metalness, roughness: m.source.roughness, opacity: m.source.opacity, transparent: !!m.source.transparent, transmission: m.source.transmission || 0, clearcoat: m.source.clearcoat || 0, map: !!m.source.map, emissive: m.source.emissive?.toArray(), intensity: m.source.emissiveIntensity || 0 })),
      views: Object.fromEntries(Object.entries(views).map(([k, v]) => [k, { pos: v.pos.toArray(), target: v.target.toArray() }])),
      events: segs, marks, stats: STATS, cycle: CYCLE,
    },
    sample(t, first) {
      advance(t); const rankMap = ranks(t), states = [], deform = [];
      for (const e of entries) {
        const s = state(e, rankMap), p = e.previous;
        if (first || s.visible !== p.visible || s.matrix.some((n, i) => n !== p.matrix[i])) states.push({ id: e.name, ...s });
        e.previous = s;
        if (e.geo) {
          const attr = e.source.geometry.attributes.position;
          if (attr.array.length !== e.geo.length) throw new Error(`Topology changed: ${e.name}`);
          let changed = false;
          for (let i = 0; i < e.geo.length; i++) if (Math.abs(e.geo[i] - attr.array[i]) > 1e-8) { changed = true; break; }
          if (changed) {
            e.geo = Array.from(attr.array);
            deform.push({ id: e.name, positions: e.geo.map(n => +n.toFixed(8)), normals: Array.from(e.source.geometry.attributes.normal.array).map(n => +n.toFixed(7)) });
          }
        }
      }
      return { t, states, deform, lamps: materials.filter(m => m.source.emissive).map(m => ({ id: m.id, color: m.source.emissive.toArray(), intensity: m.source.emissiveIntensity || 0 })) };
    },
  };
}
let session, errors = [], stream;
try {
  session = await startSession(flags, { width: 960, height: 540 });
  const p = await session.newPage({ width: 960, height: 540 }); errors = p.errors;
  await p.page.route("**/index.html*", async route => {
    const response = await route.fetch(); let html = await response.text();
    const marker = "window.pcReady = true;";
    if (!html.includes(marker)) throw new Error("Missing pcReady hook; rebuild index.html first");
    // a bridge failure prints its whole stack (page errors are cut to 3 lines by the collector)
    html = html.replace(marker, `try { (${bridge.toString()})(); } catch (e) { console.error("MFC_BRIDGE " + (e && e.stack || e)); throw e; }\n${marker}`);
    await route.fulfill({ response, body: html });
  });
  await openCell(p.page, session.url({ cad: !!flags.cad }), errors);
  if (flags.cad) await p.page.waitForFunction(() => window.pc?.checks?.().cad !== undefined, null, { timeout: 30000 }).catch(() => {});
  const meta = await p.page.evaluate(() => window.mfcExport.meta);
  let times;                                      // sim time of every Blender frame, in frame order
  if (flags.linear) {
    const end = flags.to ?? meta.duration;
    if (!(end > 0 && end <= meta.duration)) throw new Error("--to must be within the program duration");
    meta.duration = end; meta.frames = Math.ceil(end * flags.fps);
    times = Array.from({ length: meta.frames }, (_, f) => f / flags.fps);
    meta.timeline = { mode: "linear", fps: flags.fps, frames: meta.frames };
  } else {
    const T = planTimeline(), runEnd = meta.duration;
    const over = T.frames.filter((x) => x.sim > runEnd + 1e-9);
    if (over.length) console.warn(`warning: ${over.length} frames sample past the run end (${runEnd.toFixed(2)} s); the page clamps them`);
    times = T.frames.map((x) => Math.min(x.sim, runEnd));
    meta.frames = T.frames.length; meta.runDuration = runEnd; meta.duration = meta.frames / flags.fps;
    meta.timeline = { mode: "plan", fps: flags.fps, frames: meta.frames, plan: T.file, planHash: T.hash, title: T.plan.title || "",
      size: T.plan.size, segmentRange: [T.R.a, T.R.b], segments: T.segments };
    meta.camera = T.frames.map((x) => x.cam);   // [px, py, pz, tx, ty, tz, fov] per frame, cell frame = Blender world
    meta.cameraSemantics = "cell frame (metres, z up, origin dial centre on the base top) = Blender world; fov = vertical degrees";
    console.log(`plan ${T.file}: segments ${T.R.a}..${T.R.b}, ${meta.frames} Blender frames (${T.segments.map((s) => `${s.n}:${s.frames}`).join(" ")})`);
  }
  meta.sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: session.root, encoding: "utf8" }).trim();
  meta.sourceDirty = !!execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: session.root, encoding: "utf8" }).trim();
  writeFileSync(join(out, "manifest.json"), JSON.stringify(meta, null, 2));
  const data = await p.page.evaluate(async () => {
    const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
    const buffer = await new GLTFExporter().parseAsync(window.mfcExport.scene, { binary: true, onlyVisible: false, maxTextureSize: 1024 });
    const bytes = new Uint8Array(buffer); let binary = "";
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(binary);
  });
  writeFileSync(join(out, "scene.glb"), Buffer.from(data, "base64"));
  stream = createWriteStream(join(out, "animation.json"));
  const write = async s => { if (!stream.write(s)) await once(stream, "drain"); };
  await write(`{"schema":"mfc-blender-1","fps":30,"timeline":"${meta.timeline.mode}","frames":${meta.frames},"samples":[\n`);
  let count = 0, patches = 0, deformations = 0;
  for (let start = 0; start < meta.frames; start += flags.batch) {
    const slice = times.slice(start, Math.min(start + flags.batch, meta.frames));
    const batch = await p.page.evaluate(({ start, slice }) => slice.map((t, i) => window.mfcExport.sample(t, start + i === 0)), { start, slice });
    for (const sample of batch) {
      sample.f = count + 1;
      await write((count ? ",\n" : "") + JSON.stringify(sample)); count++; patches += sample.states.length; deformations += sample.deform.length;
    }
    if (start % 150 === 0) console.log(`sampled ${count}/${meta.frames}; ${patches} transform patches, ${deformations} geometry patches`);
  }
  await write("\n]}\n"); stream.end(); await once(stream, "finish"); stream = null;
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(join(out, "export-report.json"), JSON.stringify({ ok: true, timeline: meta.timeline.mode, nodes: meta.nodes.length, frames: count, patches, deformations, consoleErrors: errors.length, sourceCommit: meta.sourceCommit, planHash: meta.timeline.planHash || null }, null, 2));
  console.log(`Export complete: ${out}; ${count} frames, ${meta.nodes.length} nodes; console errors: 0`);
} catch (e) { stream?.destroy(); reportFatal(e); }
finally { await session?.close(); }
