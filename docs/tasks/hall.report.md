# Hall — M1

## Built

- Single hall floor from `M.floor` / `epoxyMap` (grey epoxy, clearcoat, darkened slightly for a mid-grey reading), with saw-cut joints, a safety outline 0.6 m around the cell, a pedestrian walkway and two cross aisles, four L-corner pallet marks, and black/yellow hazard hatching in front of the cabinet and the tray outfeed.
- Sandwich-panel walls on three sides with a procedural vertical-rib colour/bump map (1 m panel joints, 0.25 m rib pitch), plinth, head trim, and an open front for the camera. The side-wall UVs are swapped so the ribs stay vertical on both long walls.
- Steel portal frame: HEA-like columns every 6 m along both long walls, HEA rafters over each frame, six purlins, fascia, a dark roof deck and two emissive blue-white skylight strips. The front row stands on the open slab edge at y = -7 so the x -4…9 / y -7…-1.7 camera corridor stays clear.
- Fifteen round LED high-bays on rods at 6.5 m above the floor (instanced housings and emissive LED discs).
- Openings: 3.6 × 3.6 m sectional door in the x = 13 wall (four panels, seams, three glazed panes, side tracks, torsion shaft, motor, control box); personnel door in the back wall with vision panel, push bar and closer; office block in the back-right corner with aluminium-framed two-pane window, partly lowered venetian blinds, glazed office door, threshold/skirting, plaques, desk silhouette and interior glow.
- Storage: four-bay pallet rack run (blue uprights, orange beams, diagonal bracing, footplates, 3 levels) with EUR pallets (1200 × 800 × 144, built board by board), cardboard cartons and blue KLT 4310-type bins; stacked empty pallets, free WIP pallet and three octabins of bulk parts beside the hoppers.
- Work areas: QC table with black granite plate, height gauge, stereo microscope and a live-looking QC monitor; workbench with perforated tool board, hanging tools, shelf bins, vice and drawer unit; packing table with scale, LCD, tape dispenser and flat cartons; hand pallet truck; parked blue electric forklift with counterweight, overhead guard, mast, forks and an animated amber beacon.
- Utilities and signage: blue aluminium compressed-air ring main around three walls at 4 m with clamps, three drops, ball valves and couplings; two red fire extinguishers with FIRE signs; two emissive green exit signs; blue hearing-protection sign on a post outside the reserved cell zone; office/QC wall plaques.
- All static geometry is merged into one mesh per material; pallets, cartons, KLT bins, rack parts, blinds and lamps are instanced. Only `HALL.rotor` is animated: `updateHall(t)` turns the forklift beacon at `t * 2.4` rad/s (pure, no allocations).

## Validation

- `node tools/build.mjs`: 17 fragments, built successfully.
- `node tests/run.mjs`: `all checks passed`.
- `node tools/stats.mjs --port 8784 --solo hall --budget --size 1920x1080 --hq on`:
  **57 draw calls / 150 budget**, **46,164 triangles**; GL all-pass instrumentation 118 calls / 92,319 triangles. Full scene: 492 calls / 422,948 triangles. Status: ok, all modules within budget.
- HQ screenshots at 1920 × 1080: `_shots/hall-final/` (`hall`, `iso` at 2.5, 12, 30 s) and `_shots/hall-final-solo/` (`hall`, `iso` at 12 s). **Console errors: 0** in both runs. FPS 60.0 (tool frame-clock cap), HQ watchdog did not trip.
- `?hall=0` checked: only `HALL.floor` remains visible, all other hall children hidden.
- Inspected full-scene and solo captures plus close-ups of the racks, work areas, office, sectional door, forklift, pallet truck and cart. Iterated on the wall rib UVs (they were horizontal on the side walls), tool-board depth, QC air-drop/sign collision, portal columns and forklift body rounding.

## Notes for the lead

- The hall roof and walls have `castShadow = false` on purpose: the sun shadow camera is only ±2.6 m around the cell, and a shadow-casting roof at 7 m would black out the whole cell. They still receive shadows and the roof is fully modelled for the Blender export.
- No `LAYOUT` or `10-logic.js` changes were needed. Floor-marking positions use the task's cabinet/tray coordinates.
- The fixed `hall` and `iso` cameras look down at the cell, so the office block, right wall, sectional door, roof and high-bays sit outside those frames; they are present and checked with orbit close-ups. Only app/UI camera changes could bring them into the default frame.
- No source files outside `src/js/31-hall.js` were changed. The generated `index.html` is left uncommitted, as in the other module branches.
