# Blender pipeline — M4 handoff

## Delivered

- `tools/export-blender.mjs`: uses the existing browser session/Chrome lock and `?cad=0`; response-only scene bridge; binary GLTFExporter scene grouped by module, stable custom `mfc_id` properties and shared geometry; 30 Hz sparse JSON world matrices, visibility, stable logical product identities, lamp color/intensity, and vertex/normal caches for flexible hoses. Exports source provenance, events, marks and camera presets.
- `blender/build_scene.py`: glTF import, explicit Y-up → Z-up conversion, baked transform/visibility/emission curves, correct Blender 4.5 action-slot binding, quaternion continuity, numeric round-trip checks, AgX/Cycles, LED high-bay area lights and skylight fill, provisional camera cuts. Thin-sheet PC shader avoids the false refraction/magnification of single browser planes.
- `blender/render.py`: OptiX selection, deterministic hose-cache replay, **preview defaults 50% / 24 samples**, fixed-view override, explicit `--animation` opt-in and STOP_RENDER support.
- `blender/finish_film.py`: deterministic stereo 48 kHz audio from exported logic segments (100 Hz bowls, servos, indexer, pneumatics), CPU encoding with source-frame preflight.
- `blender/validate_video.py`: PNG sequence checks, exact count/FPS/resolution/duration/audio checks, full decode and contact sheet; nonzero exit on failure.
- `blender/README.md`: schema, reproducible commands, dependencies and integration limitations.

## Verified

Baseline: `eda03de7828fffef62d42e48d1195944f9084dba` plus this branch's pipeline. This baseline includes completed bowls and otherwise still contains some M0/M1 module geometry. No other module source was edited.

- `node tools/build.mjs`: 17 fragments built. `node tests/run.mjs`: all checks passed. Node syntax and Python compile checks passed.
- Full browser export on **port 8788**: **1,776 frames at 30 Hz**, **943 nodes**, **362,330 transform/visibility patches**, **1,739 hose geometry patches**; **0 console errors**.
- Blender 4.5.3 imported all 943 identities; 484 objects had changing sampled state. Max initial matrix error **6.56e-7**; max evaluated animation matrix error **5.21e-7**, checking frames **1, 76, 361, 721, 901, 1776**. Translation error is consequently below 0.001 mm at checked poses.
- Preview stills visually inspected: **frame 76 / iso**, **frame 361 / feederA**, **frame 901 / scara**, **960×540**, **24 samples**, **Cycles OptiX on RTX 5050**. Material iterations corrected cloudy overlays and false single-sheet refraction. No long GPU render was started.
- Full sound: **2,841,600 stereo samples**, 48 kHz, **59.2 seconds**, **1,106 scheduled cues**, deterministic PRNG; repeat synthesis test passed.
- Video validator smoke test: a separate **6-frame / 0.2-second synthetic test clip**, 1920×1080, 30 fps, H.264/AAC stereo 48 kHz, full decode **PASS**. Negative test with incorrect expected frame count correctly returned **FAIL**. This is a validator test, not a rendered factory film.

Local ignored artifacts:

- `_cad/final/scene.glb`, `manifest.json`, `animation.json`, `export-report.json`, `build-report.json`.
- `_cad/final/mini_factory_cell.blend`, `machine_sound.wav`, `audio-report.json`.
- `_cad/final/previews/frame_0076.png`, `frame_0361.png`, `frame_0901.png` and per-view logs.
- `_cad/blender/validation-smoke.mp4`, `validation.json` contain the small validator fixture.

## Coordinator actions / limits

1. Merge `feat/blender`, rebuild the final integrated application, and **re-export/rebuild**. These preview artifacts deliberately reflect this branch's baseline, not the ongoing frame/robots/app/hall/dial/product work.
2. Keep export JSON beside the blend and use `render.py`; flexible-mesh handlers are not embedded as auto-executing scripts. If moving exports, update scene property `mfc_export_dir`.
3. Approve final camera choreography/material lighting and only then run `render.py --animation`. No full-film encode or final-film validation has been claimed.
4. NumPy is provided by Blender's bundled Python (`.../4.5/python/bin/python3.11`) for audio; system Python here does not have NumPy. Validation itself uses only the standard library plus ffmpeg/ffprobe.
5. HMI/nameplate canvas textures are snapshots, not animated video textures. Variable topology is rejected; flexible meshes must keep their vertex count/order. Clear-sheet reflections are still noisy at the deliberately low 24-sample preview setting.
6. I stopped my app, robots and frame child agents upon the coordinator's handoff instruction. All subsequent code/artifact work was confined to the blender worktree; no main merges, pushes or further Herdr prompts were made.
