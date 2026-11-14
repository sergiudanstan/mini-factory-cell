# Task: robots (delta 40-delta.js + Epson T3-B401S 41-t3.js polish) · port 8786

**Files:** `src/js/40-delta.js` and `src/js/41-t3.js` only. Prefixes: `delta`, `t3`.

**Fixed API:**
- `setDelta(p, ang, grip, part)`, `deltaCheck`.
- `t3Models`, `t3Model`, `setT3(m, q, grip)`, `t3Check`, `cadCheck`.
- Module roots `delta` (via `MODULES.delta`) and `scara` (via `MODULES.scara`).

## Delta (1130-class, IRB 360 / Omron Hornet look)
- **Base:** cast light-grey base (`M.ral7035`) hung under the portal plate (z from `LAYOUT.delta.baseZ[0]` to `DELTA.mount`), with three motor lobes. Each lobe has a motor cover (cooling ribs), a gearbox, a cable conduit with a connector, a nameplate and a status LED ring.
- **Arms:** keep the kinematics exact (`DELTA`, `deltaJoints`). Black carbon upper arms with aluminium end fittings.
- **Rod pairs:** carbon, with ball sockets, a spring pair per end and white POM cups.
- **Travelling plate:** stainless.
- **Gripper:** a Schunk/Zimmer-style 2-finger pneumatic parallel gripper.
  - Body, flange adaptor, two **stepped fingers**: an outer step for the Ø20 housing and Ø12.5 cap, and a slim tip for the Ø7 spring.
  - The finger gap follows `deltaFingerGap(part, grip)`.
  - Two blue Ø4 air hoses with push-in fittings, routed along an arm to the base with clips.
  - A gripper-closed LED (`deltaLedMat`).
- The TCP (fingertip centre) must stay exactly at `p` (z = `p[2]`): `eff.position = p + [0, 0, DELTA.tool]`.
- `deltaCheck()` must stay below 0.5 mm.

## T3-B401S
- **Pedestal:** replace the profile-leg pedestal with a machined steel or aluminium column. Base flange bolted to the machine-base plate at z = 0, top plate 220 × 220 with the 4 × M8 pattern on 120 × 120 (`LAYOUT.t3`), height = `T3G.riser`, and a cable exit at the back.
- **Gripper:** a 2-finger parallel gripper on the quill, with fingers shaped for the Ø20 housing (V or round jaws) and blue hoses to arm 2's air fittings. The fingers follow `setT3`'s grip (half-gap from 20 mm to 14 mm).
- Keep the procedural model and the CAD loader (`cad/t3.glb`) working, and keep `cadCheck()` ≤ 2 mm.
- Small details: the "EPSON" wordmark on arm 2 (`labelPlane`), a T3-B label on the base, LED.

## Budget
- `delta` ≤ 60 draw calls.
- `scara` ≤ 40 draw calls (CAD mode included).

## Views to check
`delta`, `scara`, `tray`, `dial`, with and without `?cad=0` (`--cad` flag).

Times: 1.0, 1.5, 6.5 and 12.
