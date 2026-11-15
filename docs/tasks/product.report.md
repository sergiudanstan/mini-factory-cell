# product report

## What I fixed
- Rebuilt the product geometries to match the coordinator review: A is a genuine hollow annular housing with a visible bore, the bore floor sits at z = 0.004, and the windows/slot are actual cutouts instead of solid extras.
- Reworked spring B to use the proper centerline radius `(OD - wire) / 2`, keep the wire thickness while `setSpringLength(obj, len)` rebuilds the helix, and keep the coil axis in the part frame from z = 0 to the active free length.
- Corrected cap C to the proper z-up orientation, keep it within z = 0..h, keep the hooks on ±x, and keep the body and dome inside the required envelope without extending below the origin.
- Rebuilt the outfeed tray geometry as a real tray with 24 pocket cavities and a pocket floor at `TRAY.top - TRAY.pocket`, plus the empty-tray magazine stack and the pusher timing needed for the swap cycle.

## Validation
- `node tools/build.mjs` — passed.
- `node tests/run.mjs` — passed (`all checks passed`).
- Browser validation on port 8783 — passed.
  - `node tools/shots.mjs --view iso,press,vision,scara,tray --t 2.5,12,23.5,24.3 --port 8783 --out _shots/product-final --tag product`
  - Result: 20 PNGs produced, `console errors: 0`.
- Draw-call budget check — passed.
  - `node tools/stats.mjs --solo product,outfeed --budget --port 8783 --t 12`
  - Result: product = 7 calls / 232,098 triangles (budget 60), outfeed = 35 calls / 47,006 triangles (budget 40), both under budget and no console errors.

## Dimensional sanity
- A housing: hollow ring body with a visible top bore; flange and shell stay within the 0..0.022 m overall height and the bore floor remains at 0.004 m.
- B spring: center radius = `(0.007 - 0.0006) / 2 = 0.0032 m`, with the wire remaining at `0.0006` m thickness as the spring length is rebuilt; z-span remains from 0 to the active free length.
- C cap: body and dome stay inside z = 0..0.015 m, with hooks on ±x and no extension below the part origin.
- Tray: pockets read as actual cutouts with the floor at `TRAY.top - TRAY.pocket`, and the carriage returns to the fill position instead of locking onto tray 0 after the swap.

## Server/blocker note
- No browser/server blocker was encountered during validation. The page served correctly on the headless Chrome lock, rendered on Vulkan via ANGLE, and the recorded browser checks reported zero console errors.
