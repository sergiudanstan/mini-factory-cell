# Task: bowls (vibratory bowl feeders A, B, C) · owner: Codex (herdr t2) · port 8781

**Files:** `src/js/33-bowls.js` only. **Prefix:** `bowl`. **Module root:** `bowls` (keep `const BOWLS = (() => { … })()`, `updateBowls(t)`, `bowlHelix(b, u)`).

This is the star of the film: make the three feeders look like real RNA feeders in a real cell. Everything you need is in `LAYOUT.bowls[i]` (model, rim, h, track, pitch, turns, dir, drive, plate, Z, centre `c`, `rTrack`, `outlet`, `outletZ`, `exitAng`, `mount`, `stand`, `topPlate`, `rimZ`, `bottomZ`, `cover`, `linear`, `pickNest`, `hopper.p`, `hopper.chute`) and `FEED[i]` (pick point x/y, outward direction ux/uy, track length 0.52, pitch, queue capacity q, part type).

## Build (per feeder, bottom up)
1. **Stand** (RNA UG cast pedestal, RAL 6011 `M.ral6011`): ribbed round foot on the floor (`LAYOUT.floor`), column, top plate Ø380 (`topPlate`), levelling screws.
2. **Base plate** (black powder coat `M.ral9005`, Ø`plate.d`), three rubber shock absorbers at 120°, a small grey controller box with cable.
3. **Drive** (`drive.d` × `drive.h`, `M.ral7035`): plain cylinder (springs hidden), nameplate (`labelPlane("RNA " + drive.model …)`), cable gland.
4. **Bowl** (`M.ss304Blasted`; bowl C stepped and black PU coated `M.puBlack`): outer wall (rim Ø`rim`, height `h`), bottom with a shallow centre cone, the **helical track**: a ribbon `track` wide rising `turns` turns from `bottomZ` to `outletZ`, leaving tangentially at `outlet` (use `bowlHelix(b, u)` as the centreline: it already ends exactly at the outlet in the right direction), with a small outer lip and a slight tilt toward the wall. Bowl B: track narrows to `exitTrack` (anti-tangle tooling for springs).
5. **Outer tooling on the last 90–180°:** wiper blade on a slotted bracket, air-jet nozzle with a blue Ø4 PU hose (`M.puBlue`), selector cutout (a notch in the track), pressure break, exit nose with a 0.5 mm gap to the linear track.
6. **Level sensor:** pendulum paddle hanging into the bowl from a support arm with a guide tube.
7. **Sound cover:** cylinder radius `cover.r`, `cover.z0`…`cover.z1`, RAL 7035 outside, open at the top or with a hinged **clear PC lid half open** (`M.pcClear` clone) so the helix stays visible from the `bowls` and `feederA` views; a cutout where the track leaves.
8. **Hopper** (BVL style, outside the guard): stainless trapezoid hopper with a lid on a small grey drive and stand at `hopper.p`, a stainless chute along `hopper.chute` into the bowl.
9. **Linear feeder** (SLL 400-400, `linear`): grey drive body `len × w × h` placed from `s0` to `s1` behind the pick point, column stand (`linear.column`), **stainless track** (`linear.trackH` thick, a groove shaped for the part) along the full `FEED.track`, a **clear PC cover strip** 1 mm above the parts, end stop.
10. **Pick nest** at the pick point: block (`pickNest.block`), **2-pin escapement** (two mini cylinders with pins between the nest and the first queued part), two M3 fibre heads with thin black fibre cables.

## Animate in `updateBowls(t)` (pure function of t, no allocations)
- **Linear track queue:** exactly `feederState(f, t).queue`. Each entry `{ s, moving }` sits at `pick + s·(ux, uy)`, z = `PICK.z` (part bottom), yaw = `FEED[f].a`. Never draw the part IN the pick nest (the loop draws it).
- **Escapement pins:** retracted while `feederState(f, t).esc` is between 0 and 1, extended otherwise.
- **Helix stream:** a deterministic decorative stream (about 20–35 parts per bowl) moving up the helix at 50–80 mm/s, with tiny hops (0.5–1 mm, high frequency, per-part phase) and slight jitter in yaw. About every 5th part tips over at the selector cutout and falls back into the bowl. Parts reaching the outlet drop back at the pressure break: the track queue is fed by the logic, not by this stream.
- **Bulk pile** of loose parts on the bowl bottom (static InstancedMesh, seeded random positions and orientations, some lying on their side).
- Use `prodGeometry(type, 2)` merged per type for all flow parts (InstancedMesh). The product task will replace that geometry with real LOD meshes; your code must keep working with any geometry that follows the contract (origin at the part's bottom centre, z up).

## Budget
- ≤ 120 draw calls for the whole `bowls` module.
- ≤ 450 k triangles.
- Merge static meshes per material: `BufferGeometryUtils.mergeGeometries`.

## Views to check
`bowls`, `feederA`, `iso`, plus `--solo bowls`.

Times: 2.5, 12 and 30 s.
