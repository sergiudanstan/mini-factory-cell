# App — page shell, views, UI, loop

## Built

- **Now overlay.** Compact 348 px card with a 28 px header (mode chip, cycle counter, six status LEDs, chevron) and one 21 px row per actor — dial, delta, press, vision, reject, T3. Each row carries the actor chip, the live step label and PLC/robot command, the current vision/press verdict and a progress fill. The open card is 166 px tall at 1600 × 900 (18 % of the viewport); it is collapsible and starts collapsed at ≤ 900 px. The last state is remembered in `localStorage` (wide screens only).
- **Vision picture-in-picture.** A 13° `THREE.PerspectiveCamera` sits at the S5 lens (`st(5)` x/y, `z = TOOL.camera.z0`), with image-up pointing radially out, and looks straight down at the nest. While the Process card is visible it renders every third frame into a 320 × 240 `WebGLRenderTarget`, reusing the frame's shadow map, clearing GTAO's override material, then `readRenderTargetPixels` into the `#vision-canvas` 2D context with a y-flip. The render target, auto-clear, clear colour and shadow-map flags are restored in a `finally` block. The canvas is developed with a sensor LUT, vignette and deterministic grain, and annotated with a crosshair, ROI circle, `#assembly`, cap Δh, tilt, `5 mm` scale and a PASS/FAIL badge from `marks.vision`.
- **Press card.** Live force–travel curve with the S4 window box, the last five test ghosts (including the weak-spring NOK curve), the 4.5 mm reading, peak/snap force and verdict cells. The curve follows the S4 ram state and pauses cleanly.
- **Feeders card.** A level gauge per feeder with the pendulum start threshold, hopper state, escapement and nest state, queue/picks counts, bowl level, and a to-scale SVG of the linear track with parts, Q-full marker, pins and the bowl outlet. The viewBox is wide enough that the bowl label stays inside the card.
- **Live card.** Cycle/throughput/good/rejected/clearance/force tiles, OEE rows (availability 1, performance ideal 2.1 s / actual cycle, quality good/(good + rejected)), tray and dial maps, and the reject log (assembly, station, reason, measurement, time).
- **Keyboard.** `1`–`9`, `0`, `-` and `=` select the twelve camera views in toolbar order; `[` and `]` step one dial cycle at the same phase and pause; `Space` plays/pauses. The view buttons show their key, and the hint lists the shortcuts.
- **Timeline.** Hover shows the time, cycle number and the active label of every lane (dial, delta, press, vision, reject, T3, tray), plus nearby NOK detections, S6 reject ticks and tray-exchange spans. The lanes draw red reject ticks/diamonds and blue tray-exchange spans. Click/drag scrubs; arrow keys and Home/End work on the slider.
- **Performance.** Closed panels return before any work; all live DOM writes go through write-on-change helpers; the PiP only renders while the card is intersecting and only every third frame. FPS is 60.0 with HQ on and off at 1600 × 900, also with Process + Feeders open.
- **Responsive.** The drawer overlays the stage at ≤ 900 px and can be dismissed by closing its cards. At ≤ 640 px the rail narrows to 54 px, the view strip moves to the bottom (horizontal swipe for the remaining views), the transport wraps, and the Now overlay uses the full stage width. Verified at 390 × 844 with an open drawer and an expanded Now overlay: `document.documentElement.scrollWidth` is 390, no element leaves the viewport, and the drawer is `display: none` when all cards are closed.

## Validation

- `node tools/build.mjs`: `index.html built from 17 fragments, 327723 bytes`.
- `node tests/run.mjs | tail -2`: `all checks passed` (59.17 s, cycle 2.188 s, 1645 parts/h, 25 good, 2 rejected).
- `node tools/shots.mjs --port 8787 --view iso,dial,vision --t 2.5,12,30 --query "panels=process,feeders" --out _shots/app-final-panels`: **0 console errors**, fps **60.0** HQ and noHQ (frame avg 16.7 ms, p95 16.7 ms), `renderInfo` 496 calls / 664,364 triangles, `checks` delta 5.6e-13, T3 2.5e-13, cad null.
- `node tools/shots.mjs --port 8787 --view iso,dial,vision --t 2.5,12,30 --out _shots/app-final`: **0 console errors**, fps **60.0**, same render info.
- Browser: headless Chrome 157, ANGLE (NVIDIA, Vulkan) on the RTX 5050, shared Chrome lock, one browser at a time on port 8787.
- Inspected all final stills. The Process card shows PASS (#7, +0.03 mm, 0.3°) and FAIL (#13, +0.51 mm, 6.2°) cases, the weak-spring NOK ghost with 2.38 N < 3.0 N, the live curve and the window box. The Feeders card shows the gauges, queue full/feeding state and the track parts. The Now overlay, view keys, OEE rows, reject log, red reject ticks and blue tray-exchange spans are visible in the shots.
- 390 × 844 probe (`page.evaluate`, no console errors): `scrollWidth` = `innerWidth` = 390, header 106 px, drawer 54–382 px overlay, PiP canvas 277 × 208 with real sensor pixels (min 66, max 243), `1`→hall, `=`→tray, `-`→scara, `0`→vision, `9`→press, timeline click at 50 % seeks to 29.83 s of 59.17 s.

## Fixes during completion

- Added a global `[hidden] { display: none !important; }`; author `display` rules on `.drawer`/`.rail-item` were overriding the `hidden` attribute, leaving an empty 360 px drawer and program-only rail items visible in Manual mode.
- Widened the OEE value column and stopped the percentage from wrapping.
- Tightened the ≤ 640 px header (padding/gap, 20 px title, mode switch shares the row with the theme button); the header height went from 214 px to 106 px at 390 px.
- Gave `#vision-res` a wider cap-Δh column; `+0.03 mm` no longer truncates.
- Widened the feeder track SVG viewBox by 18 units so the bowl label stays inside the card.

## Integration notes

- Only `src/page.html` and `src/js/60-ui.js` changed relative to the WIP commit; all other app source was already in place.
- `window.pc`, `window.pcReady`, `window.pcViews` and every SPEC §9 hook are untouched, and no logic or module API changed.
- The generated `index.html` is intentionally not committed. `?panels=process,feeders` remains a test URL flag; panels are closed by default on narrow screens.

## Known gaps

- On ≤ 640 px the camera-view strip scrolls horizontally (all views remain reachable by swipe or keys); the drawer itself scrolls vertically when several cards are open. Neither produces page-level horizontal scroll.
- The PiP is a stylized sensor readback (LUT, grain, vignette), and its measured values come from the deterministic `marks.vision` gauge model, not a separate metrology simulation.
