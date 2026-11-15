# Blender pipeline

The web logic remains the source of truth. This pipeline imports its geometry and sampled motion; it does not reimplement robot kinematics or the scheduler.

## Export and build

Run from the repository root after integrating the finished module branches:

```sh
node tools/build.mjs
node tests/run.mjs
node tools/export-blender.mjs --port 8788 --out _cad/blender
~/Applications/blender-4.5.3-linux-x64/blender --background --factory-startup \
  --python-exit-code 1 --python blender/build_scene.py -- --input _cad/blender
```

The exporter uses `tools/lib/browser.mjs`, its shared Chrome lock, and `?cad=0`. A temporary response-only bridge exposes the module-scoped scene to the exporter. It never changes application sources. Do not export while another engineer is rebuilding the same checkout.

Outputs:

- `scene.glb`: frozen glTF, grouped by module. Instanced meshes expand into individually addressable objects with shared geometry and materials. Named group nodes remain as transform markers. All nodes carry an `mfc_id` custom property.
- `manifest.json`: source commit/dirty state, initial transforms and visibility, stable instance/part identities, material definitions, camera views, event segments, marks and run statistics.
- `animation.json`: 30 Hz samples. Each sample contains sparse world-matrix/visibility patches, vertex/normal patches for flexible geometry, and lamp color/intensity states. Unchanged state is held. Matrix arrays are **column-major**, in three.js scene-world Y-up coordinates. Blender uses `C M C^-1` with `C = Rx(+90°)`. Frame 1 is t=0; `ceil(DURATION*30)` frames cover the run. Video/audio duration is frame count / 30.
- `export-report.json`, `build-report.json`: completion and verification evidence. Build checks glTF import transforms and actual evaluated Blender animation at six representative frames. A mismatch >0.1 mm-equivalent matrix tolerance aborts the build.
- `mini_factory_cell.blend`: AgX/Cycles scene with area LED high-bay lights, soft skylight fill, a provisional camera cut sequence, and baked object/visibility/material curves.

Tracked products retain their logical identities even though the browser compacts their instance buffers. Source objects without names receive stable module/traversal names. Regenerate the export after geometry changes; IDs are stable for a given scene topology, not guaranteed across different source revisions.

## Previews (default; no long render)

```sh
~/Applications/blender-4.5.3-linux-x64/blender --background _cad/blender/mini_factory_cell.blend \
  --python-exit-code 1 --python blender/render.py -- --frames 76 361 901
# Inspect a specific view without altering the saved film camera:
~/Applications/blender-4.5.3-linux-x64/blender --background _cad/blender/mini_factory_cell.blend \
  --python-exit-code 1 --python blender/render.py -- --frames 361 --view feederA
```

Previews use **960×540 (50%), 24 samples**, OptiX when available, otherwise CPU. `render.py` reinstalls deterministic vertex-cache playback for deforming hoses; opening the `.blend` directly provides baked transform animation but does not automatically load this Python handler. Export JSON files must remain available at the path stored in scene property `mfc_export_dir`; change it if moving the package. No auto-executing Python is embedded in the blend.

Full 1920×1080 rendering is opt-in through `--animation`, optionally `--start`, `--end`, `--samples`. Do not run it without the coordinator's approval. A `STOP_RENDER` file in the export directory stops before the next frame. Existing frame files are overwritten, so use a separate `--out` directory for variants.

## Sound, encode and validation

The audio/encode script requires NumPy. Blender's bundled Python already supplies it on this machine:

```sh
BPY=~/Applications/blender-4.5.3-linux-x64/4.5/python/bin/python3.11
$BPY blender/finish_film.py --input _cad/blender --audio-only
# Once all final PNGs exist:
$BPY blender/finish_film.py --input _cad/blender --frames-dir _cad/blender/frames
python blender/validate_video.py --input _cad/blender --frames-dir _cad/blender/frames
```

Sound is deterministic stereo 48 kHz PCM: 100 Hz bowl hum, robot servos, indexer clunks and pneumatic events derived from exported logic segments. The audio report lists each cue. `--audio-only` is also suitable for supplying the WAV to the browser film tool.

Encoding uses CPU libx264 / AAC and validates the source PNG sequence before starting. The validator checks exact frame count, resolution, both FPS fields, duration, stereo 48 kHz audio and a complete `ffmpeg -xerror` decode, then writes a contact sheet. Pass `--video PATH` to validate a browser film against the same manifest. The validator exits nonzero on failure.

## Deliberate limits

- This is the procedural robot export (`cad=0`), as required. Re-export after final module integration; it cannot retroactively update a snapshot of M0/M1 geometry.
- Flexible geometry must retain its vertex count/order. The importer fails on topology changes rather than silently producing a broken animation.
- Canvas HMI/nameplate textures are captured at export time. Lamps animate; continuously changing HMI pixels are not a video texture.
- Camera cuts and lighting are reproducible starting points for the coordinator's cinematic review, not a claim that a final film has been rendered or approved.
- Browser overlays and UI are intentionally excluded. The geometry's physical materials/textures are preserved by glTF, with clear PC/glass adjusted to thin-sheet Fresnel reflection/transparency in Blender (single browser planes must not be treated as infinitely thick refractive volumes).
