# Task: product (push-button parts A/B/C) + outfeed (tray shuttle) · owner: Copilot (herdr t4) · port 8783

**Files:**
- `src/js/24-product.js`, prefix `prod`, no module root. Fixed API: `makePart(type, lod)`, `prodGeometry(type, lod)`, `setSpringLength(obj, len)`, `PROD_MAT`.
- `src/js/36-outfeed.js`, prefix `out`, module root `outfeed`. Fixed API: `OUTFEED`, `updateOutfeed(t)`.

## Part A: product geometry (exact sizes in `PART` / SPEC §2)

For every part:
- The origin is the **bottom centre**, z up, and the key feature points along **+x**.
- **Single material per part:** `PROD_MAT.A` (PA66 black), `PROD_MAT.B` (music wire), `PROD_MAT.C` (red PA).
- `prodGeometry(type, lod)` returns `[{ geo, mat }]`. Each `geo` must have position and normal attributes. The loop and the bowls merge them per type into InstancedMesh geometry (position and normal only), so keep each part to one material.

Triangle budget per part:

| LOD | Use | Max triangles |
|---|---|---|
| 0 | close-ups | 8 k |
| 1 | normal | 2 k |
| 2 | flow parts in the bowls | 300 |

Parts:
- **A housing:** lathe body Ø20 × 20 with a Ø24 × 2 flange on top (small chamfers).
  - Ø13 bore open at the top down to 4 mm above the bottom: visible from above, so model the inner wall and the floor.
  - Two **snap windows** 4 × 3 mm through the wall on ±y at z 14.5–17.5 mm. Build the wall from segments, or as a lathe with dark inset quads.
  - A key slot in the flange along +x.
  - Light knurl or ribs are optional.
- **B spring:** helical wire Ø0.6, outer Ø7, free length 13, 7.5 coils, closed and ground ends (the last coil on each end is flat).
  - Build it as a tube along a helix; `setSpringLength(obj, len)` scales z.
  - LOD2 may be a short cylinder shell.
- **C cap:** Ø12.5 × 15 body with a domed top.
  - Two snap hooks (legs with outward barbs) on ±y reaching 3 mm below the body, and a key rib along +x.
  - Chamfers, plus a subtle ejector mark or text on the dome if you like.

## Part B: outfeed (36-outfeed.js)

Numbers come from `TRAY`, `LAYOUT.tray` (shuttle, magazine, fullTable), `trayPose(m, t)`, `traySlot(n)` and `trayState(t)`.

- **Trays:**
  - Blue (`M.kltBlue` or a slightly glossier copy), `TRAY.w` × `TRAY.d` × `TRAY.t`.
  - 24 pockets Ø21 × 8 mm (`TRAY.pocket`) at `traySlot(n)` with a small chamfer, stacking feet, an embossed label.
  - The top face is at `trayPose(m, t)[2]`.
  - Build one tray geometry and use it for every tray object.
- **Shuttle:**
  - A linear axis along x from `LAYOUT.tray.shuttle.x0` to `x1` at y = `TRAY.cy` (aluminium profile body, belt cover, end motor with gearbox, cable chain).
  - A carriage plate with 4 locating pins under the tray. It follows the tray that is on the shuttle (tray m between `t0` and `t3` of its swap, see `trayLog.swaps`), otherwise it stays at the fill position.
- **Magazine** at `LAYOUT.tray.magazine` (outer position): a 4-post frame holding a stack of empty trays (`stack` = 6) above the shuttle. Its lowest tray drops onto the carriage during the swap: tray m+1 follows `trayPose`, and the stack shrinks by one after each drop.
- **Full-tray table** at `LAYOUT.tray.fullTable`: a roller table where full trays are pushed (tray m follows `trayPose`), with a pusher cylinder that extends during the swap phase.
- **Nearby:** a few blue KLT totes, a label printer if you like.
- **updateOutfeed(t):** a pure function of t. Hide a tray when `trayPose` returns null, unless it is still sitting in the magazine stack.
- The **assemblies inside the trays** are drawn by the loop, not by you. Your pocket floor must be at the tray top minus 8 mm.

## Budget
- outfeed ≤ 40 draw calls.
- The product is measured through the loop's tracked parts (module `product`): ≤ 60 draw calls.

## Views to check
`tray`, `scara`, `iso`, plus `--solo outfeed`.

Times: 2.5, 12, 23.5 and 24.3 (the tray exchange runs about 23.0–25.8 s). For a product close-up use `--view press,vision`.
