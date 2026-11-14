# Task: dial (indexer, dial, nests, column + star plate, S4 press, S5 camera, S6 reject, S8 sensor, bin) · owner: OpenCode t3 · port 8782

**Files:** `src/js/34-dial.js` only. **Prefix:** `dial`. **Module root:** `dial`.

**Fixed API** (keep the shape): `const DIALM = (() => { … return { root, plate, … } })()` and `updateDial(t)`.

## Geometry (all numbers come from the logic block; do not invent other positions)
- **Indexer** (Weiss TC220T style, `LAYOUT.indexer`):
  - RAL 7035 cast housing 260 × 260 × 165 with edge chamfers and ribs.
  - Rotating output flange Ø220 under the dial.
  - Stationary centre flange carrying the column.
  - Side geared brake motor (`indexer.motor`: r, len, axis −x, z) with a fan cover, terminal box and cable.
  - A small nameplate.
- **Dial plate:** `DIAL.r` = 0.35, thickness `DIAL.t`, top at `DIAL.top`, centre bore Ø150, grey anodised `M.alAnodGrey`. Group `plate` rotates with `dialAngle(t)` about the dial centre.
- **8 nests** at radius `DIAL.nestR`, angle `STATIONS[n].a` (nest n starts at station n+1), radial orientation:
  - POM white blocks (`M.nestPOM`) about 80 tangential × 60 radial, top at `DIAL.nestTop`.
  - Each has a Ø20.4 × 8 mm pocket (`DIAL.pocket`) with a chamfered lead-in, a key notch on the radial axis, and 2 dowels + 2 screw heads.
  - Merge the 8 nests into one mesh per material under the plate.
- **Centre column:** `TOOL.column` (r, z0..z1, steel), top flange.
- **Star plate:** hub radius `TOOL.star.hubR`, z `TOOL.star.z0..z1`, arms 60 wide to stations `TOOL.star.stations` = [4, 5, 6, 8] up to radius `TOOL.star.armEnd`. Aluminium. S1–S3 and S7 must stay open from above.
- **S4 servo press** at `st(4)`:
  - Electromechanical cylinder body (grey, about 70 × 70 × 220) with the motor on top, hanging from the S4 arm over the nest. Envelope radius `TOOL.press.r`, z from `TOOL.press.z0` to `TOOL.press.z1`.
  - Load-cell disc, chrome ram Ø16, tool cup Ø14 whose **face is at `pressState(t).z`** (animate).
  - Hardened anvil block under the dial at S4 (`LAYOUT.anvil`).
- **S5 vision** at `st(5)`:
  - Industrial camera body (about 60 × 45 × 100, dark) on a bracket from the S5 arm, lens down, envelope `TOOL.camera`.
  - Ring light (white, radius `TOOL.camera.ringR`, z `TOOL.camera.ringZ`); its emissive flash = `visionState(t).flash`.
  - Cable.
- **S6 reject unit:**
  - Radial slide (rail along the S6 ray at z `TOOL.rej.railZ` from the S6 point outward `TOOL.rej.out`), carriage at `rejectState(t).slide`.
  - Vertical lift cylinder.
  - 2-finger gripper whose fingertip centre (TCP) is **exactly `rejectTCP(rejectState(t))`**; fingers open (grip 0) and close (grip 1) on the Ø20 housing.
  - Blue air hoses.
  - A stainless **chute** from radius `BIN.chute[0]` down to the bin.
  - The **red bin** (`BIN`: x, y, floor, w, d, h, `M.ral3020`) with a white "REJECT" label.
- **S8:** a through-beam fibre pair: two small heads either side of the nest path at z `TOOL.s8.z0`, on a bracket from the S8 arm (offset `TOOL.s8.offset` tangentially). A green LED that is lit while the dial stands still (`!dialState(t).moving`).
- **Optional:** part-present fibre heads at S1–S3 on brackets from the machine base outside the dial edge. A cable chain from the column to the star plate.

## Animation in `updateDial(t)` (pure function of t, reuse objects)
- `plate.rotation.z = dialAngle(t)`.
- Press tool face z = `pressState(t).z`.
- Ring flash = `visionState(t).flash`.
- Reject carriage and gripper from `rejectState(t)` / `rejectTCP()`.
- S8 LED.

## Budget
- ≤ 80 draw calls for the `dial` module.
- Merge per material for static parts.
- Moving parts are separate groups with stable names: `dial_plate`, `dial_press_ram`, `dial_reject`, `dial_reject_finger_0/1`, `dial_ring`.

## Views to check
`dial`, `press`, `vision`, `iso`, plus `--solo dial`.

Times: 2.5, 12 and 15.3 (the S6 reject of assembly 8 runs around 15.1–15.9 s).
