# Mini Factory Cell: specification and module contracts

A browser digital twin of one assembly cell in a small factory hall. Three vibratory bowl feeders supply the three parts of a push-button. A delta robot loads them onto an 8-station indexing dial, a servo press snaps the cap and tests the spring, a camera inspects, a pneumatic unit rejects, and an Epson T3-B401S SCARA palletises good parts into 4 × 6 trays.

The aim is **realism**: real equipment sizes, colours and timings (RNA feeders, a Weiss-class indexer, an IRB 360-class delta, the Epson T3-B401S), and a deterministic program with checked interlocks. Two films are made from it later: one recorded in the browser, then one rendered in Blender.

`src/js/10-logic.js` is the single source of truth for every number the program uses. `src/js/23-layout.js` adds geometry that only the 3D view needs. Both are **read-only for module tasks**. If you need a change in them, say so in your report.

---

## 1. Frame, units, conventions

- Units are metres, seconds and radians. The UI shows mm and degrees.
- The cell frame is **Z up**:
  - z = 0 is the top of the machine-base plate, 820 mm above the floor. `FLOOR = -0.82`.
  - The **origin is the dial centre**.
  - +x points to the operator's right. +y points away from the operator, who stands at −y.
- All cell geometry goes under `world`, a group rotated −90° about x. A cell point (x, y, z) shows in three.js scene space as (x, z, −y). Lights and cameras live in scene space; `cv(x, y, z)` in `50-views.js` converts.
- **Everything is a pure function of the time t.** Do not step state frame by frame; derive it from t.
- Code style: plain JS fragments in one module scope, double quotes, semicolons, 2-space indent, short dense helpers. No imports between fragments. `tools/build.mjs` joins `src/js/*.js` in **lexical order** into `index.html`.

## 2. Product: push-button (A + B + C)

| Part | Material | Size | Notes |
|---|---|---|---|
| A housing | PA66, black | body Ø20 × 20, flange Ø24 × 2 on top, total 22 | Ø13 bore from 4 mm above the bottom; 2 snap windows (4 × 3 mm, z 14.5–17.5) through the wall on ±y; a key slot in the flange along +x |
| B spring | music wire 0.6 | OD 7, free length 13, 7.5 coils, closed and ground ends | rate 0.82 N/mm; installed length 10 |
| C cap / plunger | PA, red (RAL 3020-like) | Ø12.5 × 15: straight cylinder to z 12.5, low spherical dome to z 15 | 2 snap hooks on ±y: vertical cantilever legs flush with the body, hanging 3 mm below the body bottom, small outward barbs (they sit inside the bore and engage the windows); a key rib along +x; slides into the Ø13 bore |

**Stack in the housing** (component bottom above the housing bottom, `STACK`):
- B sits on the bore floor at 0.004.
- C on the free spring: 0.017. Latched: 0.014. Press overtravel: 0.0125.

**In a dial nest** the housing bottom is at `HB = 0.212` (nest top 0.220, pocket 8 mm). Each part's origin is its **bottom centre** with z up and the key along +x.

**Defects (planned):**
- Assembly 8 has a weak spring (0.45 N/mm). It reads 2.4 N at 4.5 mm (good parts 4.0 N) and S4 rejects it.
- Assembly 15 has one hook that does not latch. The cap sits 1.6 mm high and tilted 4.2°, and S5 rejects it.

## 3. Layout (cell frame)

| What | Where |
|---|---|
| Dial | centre (0, 0); Ø700 × 20 aluminium, top z = 0.185; nests on R = 0.300, nest top 0.220 |
| Stations (CCW angle from +x) | S1 135°, S2 90°, S3 45°, S4 0°, S5 −45°, S6 −90°, S7 −135°, S8 180° |
| Rotation | clockwise seen from above; nest n starts at station n+1 |
| Pick nests | radius 0.60 on the S1/S2/S3 rays: A (−0.424, 0.424), B (0, 0.600), C (0.424, 0.424); part bottom z = 0.212 |
| Delta axis | (0, 0.36); portal plate underside z = 1.33 (2.15 m above the floor); shoulders z = 1.17 |
| SCARA base | (−0.50, −0.40) on a 225 mm pedestal, facing −30° |
| Tray (fill position) | centre (−0.333, −0.599), top z = 0.170; the shuttle runs out along −x through the left guard |
| Reject bin | (0, −0.62), red, on the machine base; front light-curtain access |
| Bowls (centres) | A (−0.935, 0.649) CW Ø440; B (−0.129, 1.120) CW Ø288; C (0.922, 0.662) CCW Ø400 (see `LAYOUT.bowls`) |
| Guard | x −1.35…1.35, y −1.10…1.45, 2.0 m high above the floor |
| Delta portal posts | (±0.95, −0.15), (±0.95, 1.25) |
| Hall | x −11…13, y −7…7, 7 m clear height |

## 4. Equipment: what it must look like

- **Bowl feeders** (RNA style; `LAYOUT.bowls`):
  - Bowls are glass-bead-blasted 304 stainless (bowl C is cast and black PU coated).
  - Each has a helical track of 2.9–3.2 turns rising to a tangential outlet, and outer tooling on the last turn: wiper blade, air-jet nozzle with a blue Ø4 PU hose, selector cutout, pressure break.
  - Drive: a grey RAL 7035 cylinder with no visible springs, on a black base plate, on a RAL 6011 green cast pedestal.
  - Pendulum level sensor. Round acoustic cover with a clear PC lid.
  - Outside the guard, a BVL vibratory hopper with a chute into the bowl.
  - SLL 400 linear feeder (grey) under a stainless track with a PC cover.
  - Pick nest with a 2-pin escapement and M3 fibre heads.
  - The 100 Hz vibration is **not** animated. Parts move along the helix at 30–100 mm/s with tiny hops, and fall back at the selector and the pressure break.
- **Indexer and dial:**
  - Weiss TC220T-class cam indexer: RAL 7035, about 260 × 260 × 165, with a side geared brake motor.
  - Ø700 × 20 aluminium dial, grey anodised, 8 nests (POM or anodised, about 80 × 60 × 35).
  - A centre column and a star plate with arms to S4, S5, S6 and S8 only. S1–S3 and S7 stay open from above.
  - S4: servo press (electromechanical cylinder with a load cell) over the nest, hardened anvil under the dial.
  - S5: industrial camera plus ring light.
  - S6: pneumatic pick-off (lift cylinder + gripper on a radial slide) dropping into a chute to the red bin.
  - S8: through-beam fibre pair.
- **Delta:**
  - 1130-class (IRB 360 / Hornet scale), light-grey cast base with three drive lobes, black carbon arms and rod pairs, ball joints with springs.
  - Stepped 2-finger gripper (one tool for all three parts) with blue air hoses.
- **SCARA:** Epson T3-B401S (white covers; controller in the base) on a pedestal, 2-finger gripper (the `cad/t3.glb` display model).
- **Tray outfeed:** blue 4 × 6 trays, a linear shuttle carriage, a magazine of empty trays at the outer position, and a full-tray table.
- **Guarding and controls:**
  - Natural-anodised 40 × 40 profiles, 6 mm PC panels, guard-locking doors and a light curtain at the reject bin.
  - 4-tier stack light (red, amber, green, blue), HMI on a swing arm, E-stops.
  - FRL with a lockable shut-off.
  - Electrical cabinet outside (RAL 7035), cable trays.
- **Hall** (24 × 14 m, 7 m):
  - Building: steel portal frames, light-grey sandwich-panel walls, skylights, 4000–5000 K LED high-bays, sectional door, office window with blinds.
  - Floor: grey epoxy with yellow walkway lines, hatching and L corner marks.
  - Storage: pallet racks (blue uprights, orange beams), EUR pallets with cartons, blue KLT bins.
  - Work areas: QC table (granite, microscope), workbench with a tool board, packing table, pallet truck, a blue aluminium compressed-air ring main, signage.

## 5. Program and timing (validated by `tests/run.mjs`)

**Default run:**
- 27 dial cycles in **59.175 s**, steady-state cycle **2.188 s** (1645 parts/h).
- 25 good, 2 rejected, 1 tray exchange.

**Dial index:** 0.32 s modified sine plus 0.10 s of start and in-position signals. The dial indexes only when every tool has left its nest zone (`zones`).

**Delta sequence per cycle:**
1. Place the held housing at S1.
2. Pick B, drop it into the bore at S2.
3. Pick C, place it on the spring at S3.
4. Pick the next housing during the index.

The delta is the bottleneck.

**Other stations:**
- S4 press: approach 0.12, press 0.22 (force–travel), hold 0.05, release 0.04, up 0.12.
- S5: capture 0.06 (blocks the index), process 0.26 (does not).
- S6 runs only for failed parts.
- S7 T3: pick (0.14/0.10/0.14), ptp to the tray slot, place, return.
- A full tray triggers the exchange (out 1.0, swap 0.8, in 1.0). The T3 waits for it.

## 6. Logic API (pure; read-only for modules)

All names are module-scope globals defined in `10-logic.js`. Call them inside `update<Module>(t)`.

**Constants:** `DIAL STATIONS st(s) PART STACK HB FEED PICK ESC DELTA DM T3 T3G SCARA TRAY CAP TOOL PRESS PZ VISION RJ BIN DEFECTS FLOOR`

**Pose and state functions:**

| Function | Returns |
|---|---|
| `dialTurn(t)` | steps done (fractional while indexing) |
| `dialAngle(t)` | radians, clockwise negative |
| `nestAngle(n, t)`, `nestXY(n, t)` | angle and position of nest n |
| `dialState(t)` | `{ seg, moving, turn, k }` |
| `deltaPose(t)` | `{ p:[x,y,z] TCP, grip 0..1, part:"A"/"B"/"C", seg, f }` |
| `t3Pose(t)` | `{ q:[q1,q2,zTCP,q4], grip, seg, f }`, and `t3FK(q)` → `{ j2, j3, tcp, yaw }` |
| `pressState(t)` | `{ z: tool-face z, F: N, x: mm travel, seg, a }`. The tool face is at `PZ.up` when retracted and touches the cap at `PZ.contact` |
| `visionState(t)` | `{ flash 0..1, busy, a, pass, seg }` |
| `rejectState(t)` | `{ lift 0 up..1 down, slide 0 nest..1 chute, grip 0..1, seg }`, and `rejectTCP(state)` → `[x, y, z]` |
| `feederState(f, t)` | `{ present, esc 0..1, queue:[{ j, s, moving? }], picks, starved, seg }`, where `s` = distance behind the pick point along the track (outward direction `FEED[f].ux/uy`) |
| `trayState(t)` | `{ phase, trays:[{ m, p:[x,y,z top centre] or null, count }] }`, `trayPose(m, t)`, `traySlot(n)` → `[dx, dy]` |

**Model data:** `segs[actor]` (contiguous segments `{ t0, t1, kind, label, cmd, … }`), `parts`, `assemblies`, `marks`, `zones`, `DURATION`, `CYCLE`, `STATS`, `S` (30 Hz samples).

**What-if:** `rebuild(opts)` / `cycleFor(opts)` with `{ index, speed, rates:[A, B, C] }`.

## 7. Module contracts

| File | Owner | Root (`moduleRoot`) | API |
|---|---|---|---|
| `24-product.js` | product task | none (geometry only) | `makePart(type, lod)`, `prodGeometry(type, lod)` → `[{ geo, mat }]`, `setSpringLength(obj, len)`, `PROD_MAT` |
| `30-frame.js` | frame task | `frame` | `FRAME`, `setGuards(on)`, `setStack(state)`, `hmiScreen` |
| `31-hall.js` | hall task | `hall` | `HALL` (with `.floor`), `updateHall(t)` |
| `33-bowls.js` | bowls task | `bowls` | `BOWLS`, `updateBowls(t)`, `bowlHelix(b, u)` |
| `34-dial.js` | dial task | `dial` | `DIALM`, `updateDial(t)` |
| `36-outfeed.js` | outfeed task | `outfeed` | `OUTFEED`, `updateOutfeed(t)` |
| `40-delta.js`, `41-t3.js` | lead / robots task | `delta`, `scara` | `setDelta(p, ang, grip, part)`, `setT3(t3Model, q, grip)` |
| `50-views.js`, `60-ui.js`, `70-loop.js` | lead / app task | `product` (tracked parts) | `window.pc` |

**Rules for every module:**
1. Touch **only your own files**. Build with `node tools/build.mjs`; never edit `index.html` by hand.
2. Module-scope names start with your module prefix (`bowl*`, `dial*`, `prod*`, `out*`, `hall*`, `frame*`). The builder object (`BOWLS`, `DIALM`, …) and the API names in the table are fixed. Other helpers must be prefixed. The whole page is one module scope, so collisions break the build.
3. Build everything under your module root. Read only `LAYOUT`, `M`, the `22-geom` helpers and the pure logic functions. Add module-local materials with your prefix (e.g. `const bowlMat = { … }`), or reuse `M.*` keys (§8).
4. `update<Module>(t)` must be a pure function of t, with no allocations in the hot path. Reuse `Matrix4`, `Vector3` and similar objects.
5. Give every animated object a stable `.name` (the Blender export uses names).
6. Performance budget at 1080p with HQ on, whole scene ≥ 30 fps:

   | Module | Draw calls |
   |---|---|
   | bowls | ≤ 120 |
   | dial | ≤ 80 |
   | hall | ≤ 150 |
   | frame | ≤ 160 |
   | outfeed | ≤ 40 |
   | product (all tracked parts) | ≤ 60 |

   Use `InstancedMesh` for repeated parts and `BufferGeometryUtils.mergeGeometries` for static clusters per material. Avoid real-time lights: use emissive materials (the lead owns the light rig).
7. **Match the logic geometry:** stations, `TOOL`, `PZ`, `TRAY` and `BIN`. The clearance capsules are computed from the same numbers, so geometry that disagrees makes the clearance report false.

## 8. Materials (`M` in `21-materials.js`)

| Group | Keys |
|---|---|
| Aluminium and steel | `aluClear aluBlasted aluDark stainlessBrushed steel chrome zinc9006 galv ground alAnodGrey alAnodBlack ss304Blasted` |
| Paint (RAL) | `ral7035 ral7016 ral6011 ral9005 ral5015 ral2004 ral1023 ral3020` |
| Plastics and rubber | `blackPlastic blackRubber whitePOM nestPOM siliconeBlue puBlue puBlack sealBlack` |
| Robots | `t3White t3Grey t3Dark duct carbonGloss carbonMatte motorBlack gearboxSilver` |
| Glass / PC | `pcClear glass lens` |
| Signals | `lampRed lampAmber lampGreen lampBlue estopRed estopYellow screen` |
| Product | `pa66Black paRed musicWire` |
| Packaging | `cardboard kltBlue` |
| Floor | `floor tape` |

Canvas textures available:
- `brushRough`
- `carbonMap` and `carbonBump`
- `epoxyMap`
- `tapeMap`
- `ductRings`
- `cardboardMap`

You can also make your own with `procTex(w, h, seed, paint)`.

## 9. Tools and checks

```sh
node tools/build.mjs                  # src -> index.html (syntax-checked)
node tests/run.mjs                    # logic: schedule, hand-overs, mutexes, IK, limits, clearance, process, feeders, trays
node tests/run.mjs --perturb          # weakens the dial interlock: must FAIL
node tools/shots.mjs --view iso,dial --t 12 [--solo bowls] [--port 8781] [--out _shots/x]   # stills + console errors
node tools/stats.mjs [--solo bowls]   # draw calls / triangles per module vs budget
```

URL flags: `?cad=0` (procedural T3), `?solo=<module>` (only that module), `?hall=0`.

Hooks:
- `window.pc` has `seek`, `pause`, `play`, `setView`, `setCamera`, `setOpts`, `renderInfo()`, `checks()`, `views`, `modules`, `DURATION`, `CYCLE`, `STATS`.
- `window.pcReady`.

Views: `hall iso front top bowls feederA dial delta press vision scara tray`.

Headless Chrome renders on the NVIDIA RTX 5050 through ANGLE on Vulkan (`--use-angle=vulkan --disable-vulkan-surface`). If that fails, the tools fall back to EGL and then to SwiftShader, and print the WebGL renderer string. Headless rAF is capped at 60 Hz, so pass `--uncapped` to measure the real fps headroom.

**One Chrome at a time:** every tool run waits for the machine-wide lock `/tmp/mfc-chrome.lock` (several agents share about 3 GB of free RAM). Never start Chrome any other way.
