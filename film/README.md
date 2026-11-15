# Film

The cell's promotional and engineering film is recorded deterministically from the browser twin. `plan.json` is the shot list. `tools/film.mjs` renders it: time-remapped shots, dissolves, titles and captions, a data inset, the end card and a procedural soundtrack. The output is checked and a contact sheet is written next to it.

## Make the film

```sh
node tools/build.mjs                                   # index.html from src/
node tools/film.mjs --check                            # plan sanity, cut list, camera warnings (no Chrome)
node tools/film.mjs --preview --port 8788              # whole plan at 960x540, 10 fps, about 2-3 min
node tools/film.mjs --from-seg 7 --to-seg 8 --port 8788   # full quality, two segments, with audio
node tools/film.mjs --cad --port 8788 --out ~/Videos/mini-factory-cell/mini_factory_cell.mp4   # the final film
```

Final-render settings: 1920×1080, 30 fps, x264 `-preset slow -crf 17`, yuv420p with BT.709 limited-range tags, `+faststart`. Audio is AAC 192 kb/s, 48 kHz stereo. Every run writes these files next to the mp4:

| File | Content |
|---|---|
| `<name>.contact.jpg` | One tile per segment, the middle frame, labelled |
| `<name>.report.json` | Settings, overlays, validation (ffprobe and full decode), page hooks the tool needed |
| `<name>.work/` | Overlay PNGs and `film.wav`. Frames too with `--keep-frames`; `--resume` reuses them |

Useful flags:

| Flag | Effect |
|---|---|
| `--preview` | Half size, every 3rd frame (10 fps), fast encode |
| `--from-seg A --to-seg B` | Render a subset. Captions and audio are cut to it. |
| `--frames-only` | Stop after the frames and overlays |
| `--keep-frames` | Keep the JPEG frames |
| `--resume` | Keep frames that already exist (an interrupted render of the same plan) |
| `--no-overlays` | No titles, captions, inset or end card |
| `--audio FILE.wav` | Mux a given WAV |
| `--no-audio` | Silent film |
| `--size WxH`, `--fps N` | Override the plan |
| `--cad` | Load the Epson CAD robot (default `?cad=0`, like the other tools) |
| `--root DIR`, `--port N`, `--gpu MODE` | Shared browser flags (see `tools/lib/browser.mjs`) |

The browser tools share one Chrome lock (`/tmp/mfc-chrome.lock`), so a render waits while another tool runs. Chrome closes before the audio and the encode start.

The soundtrack alone: `node tools/audio.mjs --plan film/plan.json --out _frames/film.wav`. It prints the RMS level per second.

## Editing the plan

All positions are in the cell frame: metres, z up, origin at the dial centre on the machine-base top, floor at z = −0.82. The tool converts them to the three.js scene, (x, z, −y).

Key fields:

- `fps`, `size`, `title`: film settings.
- `fadeIn` / `fadeOut`: film fades, in seconds.
- `audio`: `seed`, `fx` (low swells), `levels` (per-group trims in dB: `bowls room delta scara press dial tray reject feeders events`).

Each segment has:

| Field | Meaning |
|---|---|
| `label`, `note` | Free text |
| `dur` | Film seconds. Keep it a whole number of frames, e.g. multiples of 0.1 s at 30 fps. |
| `sim: [s0, s1]` | Program time, mapped linearly over `dur`. `dur > s1 − s0` is slow motion. Segments can jump in sim time. |
| `xfade` | Dissolve from the previous segment, in seconds. Omit it for a cut. |
| `ease` | Camera timing: `linear` `smooth` `smoother` `sine` `in` `out` `in-sine` `out-sine` |
| `cam: [{ u, pos, target, fov }]` | `u` runs 0..1 over the segment. 1 key holds still, 2 keys smoothstep between them, 3+ keys follow a centripetal Catmull-Rom path with smooth speed. A key without `fov` reuses the previous one. |
| `orbit` | `{ target, radius, z, a0, a1, fov, r1, z1, target1, fov1 }`. Angles are degrees counter-clockwise from +x. |
| `caption` | `{ style: title \| chapter \| end, n, text, sub, in, out }`. `in`/`out` are seconds from the segment start. |
| `inset` | `{ kind: "press-curve", in, out }`. Draws the S4 force–travel curve of the press test inside the segment's sim range. |

Event times of the default run (cycle 2.188 s, run 59.17 s) used by the plan:

| Event | Sim time | Where |
|---|---|---|
| Dial index *k* | 1.58 + 2.188 (*k* − 1) s, 0.42 s each | dial centre |
| Spring drops into the housing at S2 | 0.76 + 2.188 *k* s | S2 (0, 0.30) |
| Housing pick at feeder A | 1.95 + 2.188 *k* s | (−0.424, 0.424) |
| Weak-spring press test, assembly 8 | 10.87–11.18 s | S4 (0.30, 0) |
| First reject | 15.13–15.99 s | S6 (0, −0.30), bin (0, −0.62) |
| Tray exchange | 22.98–25.78 s | tray (−0.333, −0.599), shuttle out to x = −1.70 |
| Vision fail, assembly 15 | 28.31 s | S5 (0.212, −0.212) |
| Second reject | 30.44–31.30 s | S6 |

Other references:

- SCARA base: (−0.50, −0.40).
- Bowl centres: A (−0.935, 0.649), B (−0.129, 1.12), C (0.922, 0.662).
- Hall: x −11..13, y −7..7, 7 m tall.

Print the current events with `node -e 'import("./tools/lib/film-plan.mjs").then(({loadLogic}) => console.log(loadLogic("index.html").marks))'`.

The page's `pc.setCamera(pos, target, fov)` must apply the fov. Until it does, every shot uses the page camera's 34°, and the tool warns and lists the hook in `report.json`.
