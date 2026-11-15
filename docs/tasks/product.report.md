# product report

## What I fixed
- Rebuilt the product geometries: A is a hollow housing with the bore floor at z = 0.004 m, actual ±y through-windows, and an actual +x flange slot.
- Reworked spring B to use centerline radius `(OD - wire) / 2` and preserve wire thickness when `setSpringLength(obj, len)` rebuilds its helix.
- Corrected cap C to a Ø12.5 mm straight cylinder through z = 12.5 mm with a low spherical dome ending at z = 15 mm. Its 2 mm-wide vertical hook legs are on ±y, hang from z = 4 mm to -3 mm, and have outward barbs within the 6.75 mm radial envelope. The +x key rib is 1 mm wide and 0.4 mm proud.
- Kept the part LODs within their per-part triangle budgets while preserving the visible spring helix in LOD2.
- Rebuilt the tray as a bottom plate plus a pierced top layer: each pocket has a 0.5 mm chamfer, wall, and solid floor at `TRAY.top - TRAY.pocket`; the 8 mm recesses do not cut through the tray.
- Moved the shuttle motor and gearbox beyond the tray's +x end and below the carriage plane.

## Validation
- `node tools/build.mjs` — passed.
- `node tests/run.mjs` — passed (`all checks passed`).
- Close-up browser validation at port 8783 — passed:
  - `node tools/shots.mjs --port 8783 --view tray,press --t 12`
  - Both views rendered with zero browser console errors.
- Draw-call budget check — passed:
  - `node tools/stats.mjs --solo product,outfeed --budget --port 8783 --t 12`
  - Product: 7 calls / 255,290 triangles (budget 60); outfeed: 35 calls / 57,950 triangles (budget 40); zero console errors.

## Dimensional sanity
- Housing A: overall z = 0..0.022 m; body z = 0..0.020 m; bore floor z = 0.004 m; flange slot faces +x and windows face ±y.
- Spring B: center radius = `(0.007 - 0.0006) / 2 = 0.0032 m`; wire thickness remains 0.0006 m on length changes.
- Cap C: cylinder/dome z = 0..0.015 m; hooks z = -0.003..0.004 m on ±y; radial extent is at most 0.00675 m.
- Tray: local top z = 0 and bottom z = -0.020 m; pocket floors are at -0.008 m, leaving 12 mm of solid material beneath them.
- Shuttle motor/gearbox nearest x extents exceed `TRAY.cx + TRAY.w / 2 + 0.03` and both are below the carriage plane.

## Server/blocker note
- The first browser attempt exposed incompatible indexed and non-indexed tray geometries during merge. Normalizing the geometries fixed it; the requested close-up run then completed without server errors or browser console errors.
