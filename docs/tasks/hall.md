# Task: hall (building, floor, light fixtures, props) · owner: OpenCode (herdr tB) · port 8784

**Files:** `src/js/31-hall.js` only. **Prefix:** `hall`.

**Fixed API:**
- `const HALL = (() => { … return { root, floor, floorMat, … } })()`.
- `const floorMat = HALL.floorMat;`.
- `function updateHall(t)`.

Keep `HALL.floor` as the single scene floor at z = `LAYOUT.floor`. With `?hall=0`, everything except the floor is hidden (the loop toggles every child of `HALL.root` except `HALL.floor`).

## Scene (`LAYOUT.hall`: x −11…13, y −7…7, height 7 m above the floor)

**Do not put anything inside the reserved cell zone x −2.4…2.7, y −1.7…2.5:** that holds the guard, the hoppers, the cabinet and the tray outfeed. Keep the camera corridor free: no tall objects in x −4…9, y −7…−1.7. The `hall` view camera stands at about (6.2, −7.4, 3.6 above the base) and looks at the cell.

- **Floor:**
  - Grey epoxy (keep `M.floor` / `epoxyMap`).
  - Yellow walkway lines 75–100 mm wide (`M.ral1023` or `tapeMap`) around the cell and along the aisles.
  - Black/yellow hatching in front of the electrical cabinet (x 1.78, y 1.62) and the tray outfeed (x about −2.0, y −0.6).
  - L-shaped corner marks for pallet spots.
- **Structure:**
  - Steel portal frames: HEA-like columns every 6 m along x on both long walls, painted RAL 7016 or light grey, with roof rafters and purlins.
  - Light-grey **sandwich-panel walls** with vertical ribs (a procedural rib texture or thin ribs merged into one mesh).
  - A plinth along the bottom of the walls.
  - Roof: dark underside, two **skylight strips** (emissive, slightly blue-white).
- **Lighting fixtures** (visual only; the lead owns the real lights): a grid of LED high-bay lamps (round, emissive warm-white 4000 K) at about 6.5 m.
- **Openings:**
  - A sectional door (horizontal panels, small windows) in the x = 13 wall.
  - A personnel door.
  - An **office block** in the back-right corner with an aluminium-framed window, blinds and a door.
- **Storage:**
  - Pallet racks along the back wall (blue uprights `M.ral5015`, orange beams `M.ral2004`, 3 levels).
  - EUR pallets 1200 × 800 × 144 with cartons (`M.cardboard`) and blue KLT bins (`M.kltBlue`).
  - Octabins or cartons of bulk parts near the hoppers (outside the reserved zone).
- **Work areas:**
  - QC table with a black granite plate, height gauge, stereo microscope and monitor.
  - Workbench with a perforated tool board.
  - Packing table with a scale and tape.
  - A hand pallet truck.
  - Optionally a small electric forklift parked.
- **Utilities:** a blue aluminium compressed-air ring main along the walls at about 4 m, with drops.
- **Signage:** red fire extinguishers with signs, green exit signs, a blue hearing-protection sign near the cell (open bowls run at 90–100 dB(A)).

## Animation (optional) in `updateHall(t)`
Something subtle and deterministic, for example a rotating amber beacon on the forklift, or nothing.

## Budget
- ≤ 150 draw calls for `hall`: merge static geometry per material, instance repeated items (pallets, cartons, KLT, lamps, rack parts).
- Do not add three.js lights.
- No external textures: use procedural canvas textures only (`procTex`).

## Views to check
`hall`, `iso`, plus `--solo hall`.

Time: 12.
