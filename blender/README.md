# Blender film

The cinematic version of the cell film: the same choreography as the browser film (`film/plan.json`), rendered in Cycles. The browser twin supplies the geometry and the exact motion, the plan supplies the shots, and the finishing is shared with the browser film (`tools/film.mjs`).

## Pipeline

```sh
B=~/Applications/blender-4.5.3-linux-x64/blender
node tools/build.mjs
node tools/export-blender.mjs --port 8788 --out _cad/plan            # scene.glb, manifest.json, animation.json (about 2 min)
$B -b --factory-startup --python blender/build_scene.py -- --input _cad/plan   # _cad/plan/mini_factory_cell.blend (about 15 s)
$B -b _cad/plan/mini_factory_cell.blend --python blender/render.py -- --stills   # one 24-sample still per segment -> _cad/plan/previews
$B -b _cad/plan/mini_factory_cell.blend --python blender/render.py -- --segments 7 8 --samples 12 --percent 50   # a test
python3 blender/finish_film.py --input _cad/plan --from-seg 7 --to-seg 8      # overlays, audio, dissolves, encode, checks
python3 blender/validate_video.py --input _cad/plan --video _cad/plan/mini_factory_cell_s07-08.mp4 --from-seg 7 --to-seg 8
```

The film itself (only after release v1.0). Measured at 1080p and 32 samples: 7.5–10.5 s per frame, so the 2100 frames (the 1914 film frames plus the dissolve overlaps) take about 4.5–6 h. The default of 24 samples brings that to about 3.5–4.5 h:

```sh
$B -b _cad/plan/mini_factory_cell.blend --python blender/render.py -- --segments 1 14 --animation   # 1080p, 24 samples (--samples 32 for cleaner glass)
python3 blender/finish_film.py --input _cad/plan --out ~/Videos/mini-factory-cell/mini_factory_cell_cinematic.mp4
python3 blender/validate_video.py --input _cad/plan --video ~/Videos/mini-factory-cell/mini_factory_cell_cinematic.mp4
```

`render.py` keeps frames that already exist, so an interrupted render resumes. A `STOP_RENDER` file in the export folder stops it cleanly after the current frame.

## How the pieces fit

- **Export** (`tools/export-blender.mjs`). The timeline is the film plan: Blender frame *f* is one film frame of one segment. Segments follow each other with their dissolve overlaps included (segment *k* has `dur × 30` frames), so slow motion and jumps in sim time are exact.
  - For every frame it samples the browser scene at the remapped sim time: sparse world matrices, visibility, lamp states, hose vertices.
  - It also stores the plan camera `[pos, target, fov]`, computed by `tools/lib/film-plan.mjs`, the same code `tools/film.mjs` uses.
  - Material names carry the 21-materials key, or `<module>-<object>` for module-local materials.
  - Flags: `--from-seg/--to-seg` export a subset. `--cad` uses the Epson CAD robot. `--linear` gives the old 30 Hz run timeline.
- **Scene** (`blender/build_scene.py`).
  - Imports the glTF, keys every animated object, and checks the round trip (under 1e-4).
  - Builds the film camera: location, look-at quaternion, lens from the vertical fov (vertical sensor fit, 24 mm), focus distance, and the f-stop from the plan segment's `"blender": {"fstop": N}` (none = f/64). The live plan file wins, so f-stops change without a re-export.
  - At every cut the outgoing pose holds until *f* − 0.51 and the incoming one starts at *f* − 0.49, so motion blur (shutter 0.35, centred) never smears across a cut.
  - Adds one marker per segment, then applies `look.py`.
- **Look** (`blender/look.py`). Idempotent, so it can be re-applied to a saved scene: `$B -b scene.blend --python blender/look.py -- --save [--levels '{"exposure": -1.0}']`.
  - Principled presets by material: bead-blasted 304 bowls, brushed and blasted steel, natural anodised profiles, RAL powder coats with a soft clear layer, PA66 housing, red PA cap, music-wire spring, POM nests, epoxy floor with roughness variation. Clear PC panels stay thin dielectric sheets with Fresnel.
  - Lights: 15 disc lights at the hall's LED high-bays (4300 K, 110° spread), two cell LED bars (5000 K), and a 5600 K sun at 63° elevation. The sun comes through the two skylight strips: the roof deck is cut open and the skylights are clear.
  - Sky-gradient world, AgX Medium High Contrast, white balance 4700 K, exposure −1.2 EV, motion blur, denoised Cycles with light tree, filter glossy and clamping.
  - Levels live in `LEVELS`; the build report lists every material left as imported.
- **Render** (`blender/render.py`): stills (`--stills [--at 0.5]`), segment ranges into `frames/sNN/f_NNNNN.png` (the layout `film.mjs --frames-from` reads), OptiX GPU with OptiX denoising.
- **Finish** (`blender/finish_film.py`): runs `node tools/film.mjs --frames-from <frames> --from-seg A --to-seg B --size WxH`. The browser film's finishing applies the same plan: dissolves, cuts, captions, insets, end card, the procedural soundtrack (`tools/audio.mjs`), the BT.709 encode, ffprobe, a full decode and a contact sheet.
- **Validate** (`blender/validate_video.py`): an independent check of the frames and the mp4 against the plan's frame count, fps, size, colour tags, audio and a full decode.

## Notes

- Keep the export, the built `index.html` and the plan in step. The export records `sourceCommit` and `planHash`; `finish_film.py` warns when the plan changed since the export. Changing cameras or segment lengths needs a re-export; f-stops do not.
- The export bridge reads app internals (`update`, `tracked`, `partPose`, `MODULES`, `views`). Re-check it after app changes.
- Canvas textures (HMI, labels) are snapshots taken at export time, not animated.
