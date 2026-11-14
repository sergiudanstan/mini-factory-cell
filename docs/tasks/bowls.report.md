# Bowls — M1

## Built

- Three RNA-style feeder assemblies driven by `LAYOUT.bowls`: ribbed RAL 6011 cast pedestals, levelling feet, mounting plates, isolators, grey drive housings, controllers, glands and cables.
- Formed stainless helical ribbons with wallward crossfall, raised outer lips, rolled bowl rims and distribution cones. Bowl B narrows to its spring exit tooling; bowl C has a stepped black PU lining and central mounting boss.
- Slotted wiper carriers, selector notches, air jets with blue 4 mm hose, pressure-break fingers, exit noses and pendulum level sensors. Bowl-wall and acoustic-cover openings use the actual tangent rail/cylinder intersections; nose-to-linear gap is 0.5 mm.
- Acoustic enclosures with seals, latches, identification plates and clear lids raised 60 degrees. Hinge axes follow the incoming hopper chutes to keep the fill corridors clear.
- Folded trapezoidal BVL hoppers, lids, drives, floor stands and open stainless U-section chutes outside the guard.
- SLL linear drives and stands, part-sized locating grooves, clear covers 1 mm above the parts, end stops, pick blocks, two retracting pins and M3 fibre heads with black cables.
- Queues exactly follow `feederState().queue`; no extra part is drawn in the pick nest. Pins retract only for `0 < esc < 1`.
- 32 deterministic stream parts per bowl at 65 mm/s, submillimetre hops, yaw jitter, selector rejection on every fifth part and outlet recirculation; 100 seeded bulk instances per bowl, including sideways parts.
- Static hardware merged by material; product geometry is cloned and merged from `prodGeometry(type, 2)` without modifying the product cache. Stable names on animated flow and pins. No new objects/arrays in this module's update path (the required shared `feederState` API itself allocates).

## Validation

- `node tools/build.mjs`: 17 fragments built successfully.
- `node tests/run.mjs`: all checks passed.
- Direct animation-contract sweep: 3,481 timestamps across the full run; every queue transform and pin state matched the logic, all transforms finite; reverse seeks to 2.5, 12 and 30 s reproduced identical transforms.
- Browser tools acquired through the explicitly authorized merge of `9b5e83b` (`Linux browser tools`). Chrome runs serialized using the tools' shared lock, port 8781, NVIDIA ANGLE/Vulkan.
- Final 1920×1080 HQ screenshots: `bowls`, `feederA`, `iso` at 2.5, 12 and 30 s; isolated `bowls` in all three views at 12 s. Outputs: `_shots/bowls/` and `_shots/bowls-solo/`.
- `node tools/stats.mjs --port 8781 --solo bowls --budget --size 1920x1080 --hq on`: **74 draw calls / 120**, **315,506 triangles / 450,000**, budget passed. GL all-pass instrumentation: 152 calls / 628,965 triangles (includes additional render passes; the module budget uses `pc.renderInfo`).
- **Console errors: 0** in full-scene screenshots, solo screenshots and stats. HQ and non-HQ: **60.0 fps**, capped by the tool's 60 Hz frame clock; HQ watchdog did not trip.
- Inspected full-scene iso/bowls/feederA and solo close-ups. Final text-only nameplate fit adjustment additionally checked at 1080p in `_shots/bowls-labels/` (bowls and feederA).

## Integration notes

- Product geometry in this checkout is still the M0 product stub. Detailed housing/spring/cap geometry will appear automatically when the product module is merged; remeasure the triangle budget after that integration.
- The nominal A/C drive envelopes slightly overlap the supplied bowl floor heights. The drive is modeled as a housing closed by the bowl rather than an exposed grey cap; C uses a 13 mm coated mounting boss. No shared layout or logic numbers were changed.
- Existing app overlays cover parts of the requested camera frames, and the delta partly occludes the full-scene `bowls` view. Solo close-ups confirm the helix and hardware remain visible; camera/UI changes are outside this module's scope.
- No source files outside `src/js/33-bowls.js` changed by this task. The generated `index.html` is intentionally not committed; rebuild after merging.
