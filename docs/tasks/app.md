# Task: app (page shell, views, UI, loop) · port 8787

**Files:** `src/page.html`, `src/js/50-views.js`, `src/js/60-ui.js`, `src/js/70-loop.js`.

Keep `window.pc`, `window.pcReady`, `window.pcViews` and every hook named in SPEC §9 (the tools depend on them).

## Improve
1. **"Now" overlay:** compact and collapsible (a chevron), smaller type, never covering more than about 30 % of the viewport at 1600 × 900. Six rows: dial, delta, press, vision, reject, T3. On narrow screens, collapsed by default.
2. **Vision picture-in-picture** (Process card):
   - A `THREE.PerspectiveCamera` at the S5 camera (cell `st(5)` x/y, z ≈ `TOOL.camera.z0`) looking straight down at the S5 nest.
   - When the Process card is open, render it every 3rd frame into a 320 × 240 `WebGLRenderTarget` (`renderer.setRenderTarget`, then `renderer.render(scene, pipCam)`) and read it back with `renderer.readRenderTargetPixels` into the `#vision-canvas` 2D context (flip y).
   - Overlay: crosshair, ROI circle around the cap, measured cap height and tilt text, and a PASS/FAIL badge from `marks.vision`.
   - Guard against the shadow-map and GTAO state; restore the render target afterwards.
3. **Press card:** the live force–travel curve with the window box, and ghosts of the last 5 tests (faint), including the weak-spring fail.
4. **Feeders card:** a small level gauge per feeder, the escapement state and the queue/starved state, and a tiny SVG of the linear track showing the parts.
5. **Live card:** add OEE-style rows (availability = 1, performance = ideal/actual cycle with ideal = 2.1 s, quality = good/(good + rejected)), and the reject log (assembly, station, reason, time).
6. **Keyboard:** 1–9 and 0 jump to views; [ and ] step the time by one dial cycle; Space plays and pauses (already). Show the shortcuts in the hint.
7. **Timeline:** hovering shows the time and the active labels; red reject ticks and blue tray-exchange spans (already partly drawn).
8. **Performance:** keep the per-frame UI work small (update DOM only on change; panels closed means no work). Measure fps with `tools/shots.mjs` (HQ on ≥ 30 fps on this machine at 1600 × 900).
9. Keep it responsive: no horizontal scroll at 390 px wide; the drawer overlays on ≤ 900 px.

## Do not
- Change any logic or module API.
- Touch other files.

## Views to check
`iso`, `dial`, `vision`, with the Process and Feeders cards open (use `page.evaluate` to click the rail buttons, or add a `?panels=process,feeders` URL flag for testing).
