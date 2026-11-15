# Film tools: M3 report (Claude, herdr w7:p1)

## What I built (branch `feat/film`)

- **`film/plan.json`**: a 14-segment shot plan, 63.8 s at 1080p30 (1914 frames). Every segment holds one real event of the default run:
  1. hall crane-in with the title
  2. high glide over the bowls C, B and A
  3. feeder A macro: escapement and pick at sim 12.89
  4. delta loading
  5. spring drop at S2 in 0.2x slow motion
  6. dial index from the side, showing the indexer and motor
  7. S4 press test of assembly 8 (weak spring) in 0.22x, with a force–travel inset
  8. first reject into the bin
  9. S5 vision fail of assembly 15
  10. second reject
  11. SCARA palletising
  12. tray exchange outside the guard
  13. rising orbit
  14. pull-out to the hall with the end card

  Ten segments carry a chapter lower-third (01–09) or the title / end card. Dissolves are 0.3–1.0 s. Film fades: in 1.0 s, out 1.5 s.
- **`tools/film.mjs`**: the time-remapped renderer.
  - Each segment is rendered as its own JPEG sequence: `pc.pause`, `pc.seek(sim)`, `pc.setCamera(scenePos, sceneTarget, fov)`, two rAF, a canvas-only screenshot with HQ on.
  - One ffmpeg graph joins the segments: `xfade` for dissolves, `concat` for cuts.
  - Overlay PNGs are composited with alpha fades. The audio is cut to the rendered range.
  - Encode: x264 `-preset slow -crf 17`, yuv420p, BT.709 limited-range tags, `+faststart`.
  - Flags: `--check`, `--preview` (half size, every 3rd frame), `--from-seg/--to-seg`, `--frames-only`, `--keep-frames`, `--resume`, `--audio`/`--no-audio`, `--no-overlays`, `--size`, `--fps`, `--cad`, plus the shared `--root/--port/--gpu`.
  - It uses `startSession`, so it holds the shared Chrome lock, and closes Chrome before the audio and the encode.
- **Validation** (built in): ffprobe checks size, `fps/1`, exact frame count, video and audio duration, yuv420p, `bt709/tv`, AAC 48 kHz stereo. A full decode runs with `-v error -xerror` and must print nothing. The run writes `<name>.contact.jpg` (one labelled tile per segment) and `<name>.report.json`.
- **`tools/lib/film-overlays.html`**: transparent cards in an industrial style. Fonts are Barlow Semi Condensed, IBM Plex Sans and Mono from Google Fonts, with a Noto fallback. Cards:
  - title
  - chapter lower-third (number and safety-amber bar)
  - end card with the run's numbers from the logic: 2.19 s cycle, 1,645/h, 25 good, 2 rejected, 92.6 % first-pass yield, 0.42 s interlocked index, delta as the bottleneck
  - S4 force–travel inset: this part against a good part, the 3.0–4.5 N window at 4.5 mm, the F(4.5 mm) point, and an OK/NOK chip
- **`tools/audio.mjs`**: fixed a crash (`harm.map` on noise voices, whose `harm` is null). It now renders the plan's soundtrack in about 2.4 s: 705 positioned one-shots plus motion sounds, bowl hum and room tone; peak −3 dBFS, RMS −20 to −36 dBFS per second.
- **`film/README.md`**: commands, flags, the plan format, and the event times of the run for editing the plan.

## Verified (tests run for real, port 8788)

| Run | Result |
|---|---|
| `node tools/build.mjs`, `node tests/run.mjs` | Built from 17 fragments. All checks pass: run 59.17 s, cycle 2.188 s, 1645/h, 25 good, 2 rejected. |
| `node tools/film.mjs --check` | 14 segments, 63.80 s, no camera warnings |
| Full preview, 960×540 at 10 fps, the whole plan | 700 frames in 56 s, 12 overlays. ffprobe: 960x540 h264 yuv420p bt709/tv, 10/1, 638 frames, 63.800 s, AAC 48 kHz stereo 63.800 s. Full decode PASS, validation PASS, about 1m25s wall. |
| Full quality, segments 7–8 with audio | 207 frames rendered in 20.7 s (about 10 frames/s at 1080p). ffprobe: 1920x1080 h264 yuv420p bt709/tv, 30/1, 198 frames, 6.600 s, 8.3 MB, AAC 48 kHz stereo 6.600 s. Full decode PASS, validation PASS. |

I opened the contact sheets, frame grids of segments 2, 3, 5, 6, 11, 12 and 13, two full-resolution frames (the press with the inset and lower-third, the reject) and the overlay PNGs. After two camera iterations, the dial index, palletising, tray exchange, rejects and bowls segments read clearly. The inset's tick labels no longer collide.

The full 1080p film (1914 frames, about 2120 rendered with the dissolves) takes about 3.5 min of frames plus about 1 min to encode. I have not rendered it yet: the frame, robots and app modules are still being merged, so the final render belongs after M2.

## Page hooks the lead needs (`70-loop.js`)

- `window.pc.setCamera(pos, target, fov)`: apply the fov (degrees) and call `camera.updateProjectionMatrix()`. Today it ignores the third argument, so every shot uses the page camera's 34°. `film.mjs` detects this (`setCamera.length < 3`), warns, and lists it under `pageHooksNeeded` in `report.json`.
- My test renders used a scratch copy of the built page with that one-line patch (via `--root`, so `src/` was not touched). The plan is tuned for the fov values in `plan.json`.

## Gaps and notes

- The cameras are tuned against current main (dial and product merged; frame, robots and app not yet merged). Re-run `node tools/film.mjs --preview` after M2 and check the contact sheet. Segment 2 starts over bowl C's PC lid, which looks milky from above, and the segment 13 orbit looks through the guard panels.
- The captions quote the default run (assembly 8 weak spring, assembly 15 cap tilt, 2.19 s cycle). The end card and the inset read their numbers from the logic, but the chapter texts in `plan.json` are static. Edit them if the run changes.
- The press inset is a static chart; it does not animate with the stroke.
- The fonts load from Google Fonts. Offline, the overlays fall back to Noto Sans.
- I merged `main` into `feat/film` once (16a40f1) to pick up the dial and product merges; nothing else outside my files changed.

## Commands for the final film

```sh
node tools/build.mjs
node tools/film.mjs --check
node tools/film.mjs --preview --port 8788            # look at _frames/film-preview.contact.jpg
node tools/film.mjs --cad --port 8788 --out ~/Videos/mini-factory-cell/mini_factory_cell.mp4
```
