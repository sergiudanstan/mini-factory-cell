# Dial — M1

## Built

- Weiss TC220T-class indexer from `DIAL`/`LAYOUT`: RAL 7016 base, 260 × 260 × 133 RAL 7035 housing, corner foot pads, inspection cover with gasket and screws, hold-down bolts, rotating Ø220 output flange and a stationary centre flange.
- Geared brake motor on the −x side: motor and gearbox barrels, cooling ribs, fan shroud and domed cover with eight dark ventilator slots, brake-release lever, side terminal box with gasket, glands and cable, rating plate.
- Rotating dial plate with turned rim, running seal and eight M10 plate screws, plus the four-arm star plate (S4, S5, S6, S8 only) with hub bolts, arm bolts and cable clamps. S1–S3 and S7 stay open from above.
- Eight POM nest blocks (60 radial × 80 tangential × 35 mm) on the rotating plate: Ø20.4 × 8 mm pocket, key notch, conical lead-in, two dowels and two M5 screws per nest. Pocket details are modelled, not textured.
- S4 servo press: mounting plate, 70 × 70 electric-cylinder body with corner grooves and wiper, load-cell disc, servo stack, brake motor, terminal box, front nameplate, pressure port/gauge, hardened anvil and a chrome ram whose tool face follows `pressState(t).z`.
- S5 vision station: camera body, lens barrel and lens, three standoffs, ring light at `TOOL.camera.ringZ`, arm bracket, and the `S5 · VISION` label. The ring material is emissive and follows `visionState(t).flash`.
- S6 reject unit: rail and end blocks on the S6 arm, servo carriage, guided lift, two-finger gripper with hardened fingers, guide rods and two blue air hoses. Carriage, tool and finger gap follow `rejectState`/`rejectTCP`; parts transfer along the real TCP.
- Stainless reject chute from radius 0.43 m into the RAL 3020 bin with white `REJECT` label, rim, corner posts and floor.
- S8 through-beam pair straddling the nest tangentially at `S8.y ± 0.030`, beam at z 0.226, post and bracket from the S8 arm, amplifier with a green “dial at rest” LED that is dark while `dialState(t).moving`.
- S1–S3 part-present fibre heads on posts at radius 0.40, side-looking lenses at radius ≈0.347, bracket clamps and fibre cable runs.
- Static cable runs, hose/cable clamps, motor cable and a nameplate on the indexer. Static geometry is merged per material; all module-scope helper names are `dial`-prefixed. The public surface is `DIALM` (`root`, `plate`, `nests`, `ram`, `ring`, `ringMat`, `rej`, `rejTool`, `rejFingers`, `rejRods`, `rejHoses`, `s8LedMat`) and `updateDial(t)`.
- Animation is a pure function of `t` and reuses all objects. Stable names: `dial_plate`, `dial_press_ram`, `dial_reject`, `dial_reject_finger_0/1`, `dial_ring` (plus `dial_reject_hoses`, `dial_reject_tool`, `dial_s8_led`).

## Validation

- `node tools/build.mjs`: `index.html built from 17 fragments, 252059 bytes`.
- `node tests/run.mjs | tail -2`: `all checks passed` (59.17 s, 1645 parts/h, 25 good, 2 rejected).
- `node tools/stats.mjs --port 8782 --solo dial`: **71 draw calls / 80**, **266,522 triangles**, budget ok. Full scene: 459 calls / 839,424 triangles; 232 geometries, 37 textures.
- Browser: headless Chrome 157, ANGLE (NVIDIA, Vulkan), shared Chrome lock, port 8782. Screenshots: `_shots/dial/` (`dial`, `press`, `vision`, `iso` at 2.5, 12 and 15.3 s) and close-ups in `_shots/dial_extra/` (indexer, press, star plate, S8, reject, bin, top). Full-scene reject shots in `_shots/dial_full/`.
- **Console errors: 0** in every screenshot run and in stats. No page errors. HQ watchdog did not trip; fps held at 60.0 (frame avg 16.7 ms, p95 16.8 ms).
- Inspected the indexer, nests (pocket, notch, dowels, screws), star plate and cable clamps, press body/label/ram, S5 ring light flash (15.18–15.24 s inspect window), S6 gripper around a real housing, chute/bin, S8 head pair and the S1–S3 fibre heads. Fixed the nest-detail transform, motor terminal-box/dial collision, press-label overhang and chute/bin alignment during review.

## Integration notes

- No shared logic or layout numbers were changed. Nest pocket, heights, station angles, press/vision/reject/S8 envelopes all come from `DIAL`, `STATIONS`, `TOOL`, `PZ`, `BIN` and `LAYOUT`.
- The bin drop path and the rejected part itself belong to the product tracks in `src/js/70-loop.js`; `solo=dial` intentionally shows the empty gripper. The chute mouth matches `BIN.chute` and the drop TCP so the product’s existing fall path passes through it.
- The indexer nameplate sits on the inspection cover, and the press nameplate is sized to the flat face of the electric-cylinder body. No additional decals were placed on curved surfaces.
- The generated `index.html` is intentionally not committed. Only `src/js/34-dial.js` and this report are part of the change.
