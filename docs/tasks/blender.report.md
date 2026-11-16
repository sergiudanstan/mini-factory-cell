# Blender pipeline: M4 prep report (Claude, herdr w7:p1; first pass by Codex)

## Summary

The Blender film now uses the browser film's choreography and finishing. One `film/plan.json` drives both films, with the same segments, sim remapping, Catmull-Rom cameras with fov, dissolves, titles, captions, inset, end card and soundtrack. Materials and lights have had a Principled/Cycles pass, every segment has a 24-sample preview still on the current main scene, and a 2-segment test render went through finish and validate. No full render was started.

## What changed (branch `feat/blender`, on top of Codex's first pass)

- **`tools/export-blender.mjs`**
  - The timeline is the plan (default). Blender frame *f* is one film frame of one segment, with dissolve overlaps included (14 segments: 2100 frames for the 1914-frame film).
  - Each frame samples the exact remapped sim time, so 0.2x slow motion is exact, not interpolated between 30 Hz samples.
  - Each frame stores the plan camera `[pos, target, fov]`, computed by `tools/lib/film-plan.mjs`, the code `tools/film.mjs` uses.
  - Flags: `--plan`, `--from-seg/--to-seg`, `--cad` (Epson CAD robot), `--linear` (Codex's 30 Hz run timeline, still supported).
  - Material names are `mfc_material_<id>_<M key>`, or `<module>-<object>` for module-local materials (before, 33 materials were all called "detail").
  - The manifest records the timeline, the segments, `planHash` and `sourceCommit`.
  - A bridge failure now prints its whole stack (`MFC_BRIDGE …`).
- **`blender/build_scene.py`**
  - Plan camera keyed per frame: location, look-at quaternion with continuity, lens from the vertical fov (vertical sensor fit, 24 mm), focus distance = |target − pos|.
  - f-stop per segment from the plan's new `"blender": {"fstop": N}` key (none = f/64). It is read from the live plan file, so f-stops change without a re-export. Segments 3, 5, 7 and 9 (the macros) use f/16.
  - Every cut has isolating keys: the outgoing pose holds until *f* − 0.51 and the incoming one starts at *f* − 0.49, on objects and camera alike, so motion blur (0.35, centred) never smears across a cut.
  - Fixed: a plan export that does not start at sim 0 (any `--from-seg` > 1) kept the t = 0 pose for objects that never move.
  - One marker per segment; `look.py` is applied at the end.
- **`blender/look.py`** (new, idempotent: `blender -b scene.blend --python blender/look.py -- --save [--levels '{…}']`).
  - Principled presets by material:
    - metals: bead-blasted 304 bowls (rough 0.55 with micro bump), brushed and blasted steels, natural anodised profiles, chrome, music wire
    - RAL powder coats with a soft clear layer and fine orange-peel bump
    - plastics: black PA66 housing, red PA cap with clear coat, POM nests, KLT trays
    - epoxy floor with clear coat and roughness variation
  - The PC/glass thin-sheet shader from the first pass is kept.
  - Lights:
    - 15 disc lights at the hall's LED high-bays (4300 K, 420 W, 110° spread)
    - two cell LED bars (5000 K)
    - a 5600 K sun (40 W/m², elevation 63°)
  - The sun comes through the two skylight strips: the roof deck gets a boolean cut, and the skylights are transparent with a soft glow, so sun stripes cross the floor, the wall and the machines.
  - Sky-gradient world. AgX Medium High Contrast with white balance 4700 K (Blender 4.5) and exposure −1.2 EV. Lights use Blender 4.5's blackbody temperature.
  - Render settings: motion blur, light tree, filter glossy, indirect clamp, adaptive sampling 0.02, OptiX denoising.
- **`blender/render.py`**
  - `--stills [--at u]`: one still per segment into `previews/`.
  - `--segments A B`: frames into `frames/sNN/f_NNNNN.png` (the layout `film.mjs --frames-from` reads). Existing frames are kept, so a render resumes; `STOP_RENDER` stops it.
  - `--samples`, `--percent`. Plan-mode default for `--animation`: 24 samples.
- **`blender/finish_film.py`**: now a thin wrapper around `node tools/film.mjs --frames-from …`, replacing its own numpy audio and plain concatenation. Both films get identical dissolves, captions, inset, end card and soundtrack (`tools/audio.mjs`). It warns when the plan changed since the export.
- **`blender/validate_video.py`**: plan-aware. It checks the frame folders (count and size per segment), the mp4 (H.264 yuv420p, exact count = frames minus dissolve overlaps, fps, durations, BT.709/tv, AAC stereo 48 kHz), runs a full decode and makes a contact sheet. Linear mode still works.
- **`tools/film.mjs`**: `--frames-from DIR` (PNG or JPG per segment, size check) for external renders. The normal browser path is unchanged; regression run: PASS.
- **`film/plan.json`**:
  - `blender.fstop` on the four macros.
  - Segment 2 has a new six-key path (C, a high pass behind B clear of the delta's back arm, A). It changes the browser film too, deliberately: one choreography.

## Verified (all on current main 8e7fee7, merged into feat/blender as 8461e49)

| Step | Result |
|---|---|
| `node tools/build.mjs` + `node tests/run.mjs` | All checks pass: run 59.17 s, 1645/h, 25 good, 2 rejected |
| Export, plan timeline | 2100 frames, 1545 nodes, 428,982 transform patches, 2019 hose patches, 0 console errors, about 2 min |
| Build | 15 s. Import matrix error 6.6e-7, animation round trip 1.1e-5 (limit 1e-4), 493 animated objects. Look: 54 materials preset, the rest kept as imported (labels, signs, LEDs, screens) |
| Stills | 14 at 50 % / 24 samples in 28 s. I iterated four times on them: warm cast fixed with white balance and blackbody lights, exposure lowered, matte 304, the sun raised from 2.6 to 40 W/m² so the stripes show, segment 2 path |
| Full-resolution check, 32 samples, 1080p | 7.5–10.5 s/frame after the first. Clean after denoising, sun beams visible on the wall and floor |
| Test render, segments 7–8, 50 % / 12 samples | 207 frames in 183 s (0.88 s/frame) |
| `finish_film.py` | Overlays, audio and the 0.3 s dissolve. 960x540 h264 yuv420p bt709/tv, 30/1, 198 frames, 6.600 s, AAC 48 kHz stereo; full decode PASS, validation PASS |
| `validate_video.py` | PASS: 198 = 108 + 99 − 9, 30/1, bt709/tv, decode PASS |

The first merge of main (ee4af19) could not load the page at all: `TypeError … CatmullRomCurve3.getPoint` before `pcReady`, in shots.mjs too. Main 8e7fee7 fixed it, and the export works with the new app and frame.

Artifacts (git-ignored) in `_cad/plan/`:
- `previews/seg01…seg14_*.png`: the 14 stills
- `mini_factory_cell_s07-08.mp4`, plus `.contact.jpg` and `_validation.json`
- `frames/s07`, `frames/s08`
- `mini_factory_cell.blend` (the built scene)
- the logs

## Final film (only after v1.0, as asked)

```sh
B=~/Applications/blender-4.5.3-linux-x64/blender
node tools/build.mjs && node tools/export-blender.mjs --port 8788 --out _cad/plan
$B -b --factory-startup --python blender/build_scene.py -- --input _cad/plan
$B -b _cad/plan/mini_factory_cell.blend --python blender/render.py -- --stills          # look once more
$B -b _cad/plan/mini_factory_cell.blend --python blender/render.py -- --segments 1 14 --animation   # about 3.5–4.5 h at 24 samples
python3 blender/finish_film.py --input _cad/plan --out ~/Videos/mini-factory-cell/mini_factory_cell_cinematic.mp4
python3 blender/validate_video.py --input _cad/plan --video ~/Videos/mini-factory-cell/mini_factory_cell_cinematic.mp4
```

## Gaps and notes for the lead

- **HMI screen:** in Blender it shows a static canvas snapshot from export time; the first export showed "HOLD". Canvas textures are not animated. A "film mode" HMI frame from the app, or a RUN snapshot, would fix it.
- **Segment 2:** its middle still passes almost straight over bowl B (looking down into the HK-S cover). It reads as a fly-over in motion; fine-tune after M2 if wanted. The camera keys are in `film/plan.json`, and changing them needs a re-export.
- **Bridge:** it depends on app internals (`update`, `tracked`, `partPose`, `MODULES`, `views`, `time/mode/playing`). It works with the merged app; re-check after app changes.
- **Keep in step:** the export, the built `index.html` and the plan must match. `finish_film.py` warns on a plan change, and the frame counts are checked.
- **Render time:** 32 samples is cleaner on PC panels and metal but takes about 4.5–6 h; 24 samples is about 3.5–4.5 h. The GPU is shared, so run it when the other agents are idle.
- **Robots:** the robots branch was not merged at test time. Its CAD or procedural changes come in with the next export. `--cad` exports the Epson CAD robot.
