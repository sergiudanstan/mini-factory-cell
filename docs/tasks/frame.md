# Task: frame (machine base, guarding, doors, light curtain, delta portal, stack light, HMI, E-stops, FRL, cabinet, cable trays) · port 8785

**Files:** `src/js/30-frame.js` only. **Prefix:** `frame`. **Module root:** `frame`.

**Fixed API:**
- `const FRAME = (() => { … return { root, guards, lamps, hmiScreen } })()`
- `const hmiScreen = FRAME.hmiScreen`
- `setGuards(on)`
- `setStack(state)` with states run, hold, alarm and call.

The praline-cell-pro frame is a good quality reference for joints, brackets, doors, the HMI and the stack light. Its file is `_ref/praline/30-frame.js` in the lead checkout `/home/dan/mini-factory-cell/_ref/praline/`; read it, but our layout is different.

## Build (numbers from `LAYOUT`)
- **Machine base** (`LAYOUT.base`, top plate top at z = 0):
  - Welded frame of 80 × 80 tubes in RAL 7016 (`M.ral7016`), on levelling feet with rubber pads.
  - Ground steel top plate, 25 mm (`M.ground`), with a few tapped-hole patterns and dowel holes as subtle details.
  - Sheet-metal side panels in RAL 7035 with two hinged doors, handles, a vent grille and a small warning label.
  - A cut-out or skirt where the tray shuttle passes.
- **Guard** (`LAYOUT.guard`):
  - Natural-anodised 40 × 40 slot profiles (`profileBeam`, instanced) for the posts at `postsX` and `postsY`, top and bottom rails, and corner brackets with M8 bolts (`addBolt`).
  - 6 mm PC panels (`M.pcClear` clone, opacity about 0.16) with black seal edges. Bottom gap `gap` = 150 mm above the floor. Height to `top` (2.0 m above the floor).
  - Every panel, door leaf and the light curtain go into `FRAME.guards`, which `setGuards` toggles; the posts stay.
- **Doors** (`LAYOUT.doors`):
  - A front double door, x −1.25…−0.45 on y = −1.10, and a back door, x 0.35…1.05 on y = 1.45.
  - Each has a profile frame, PC infill, two hinges, a bow handle and a yellow guard-locking interlock (Euchner MGB style: a handle module plus a locking module). All static (closed).
- **Light curtain** (`LAYOUT.curtain`): two yellow columns (emitter and receiver) framing an opening x −0.20…0.20 in the front guard, a small shelf in front of the reject bin, a blue reset button and a "safety light curtain" sign.
- **Openings and tunnels** (`LAYOUT.openings`): a framed tunnel for the tray shuttle in the left guard (y = `TRAY.cy`, z 0.10–0.30), and three framed chute openings for the hoppers (left, back, right) at the given heights.
- **Delta portal** (`LAYOUT.portal`, `M.ral7016`):
  - Four 100 × 100 steel posts on base plates with 4 anchor bolts each.
  - Main beams along x at y = −0.15 and 1.25 (z 1.355–1.475), cross beams along y at x = ±0.22.
  - Bolted mount plate (`plate`, aluminium) under the cross beams; its underside must be exactly `DELTA.mount`.
  - Knee braces at the corners, and a yellow "overhead robot" warning label.
- **Tower light** on the front-right post (`LAYOUT.stack`): base, pole, four Ø60 tiers (red, amber, green, blue, using `M.lampRed`/`lampAmber`/`lampGreen`/`lampBlue`, which `setStack` drives through `emissiveIntensity`), and a buzzer cap.
- **HMI** (`LAYOUT.hmi`):
  - A 15 in panel on a swing arm from the front-left post, outside the guard, facing the operator.
  - The screen canvas is `hmiScreen` (512 × 384, painted by the loop).
  - An E-stop and two buttons under the screen.
- **E-stops:** on the HMI, next to each door, and at the cabinet.
- **FRL** (`LAYOUT.frl`): Festo/SMC-style filter, regulator with gauge, lockable red/yellow shut-off and soft-start on the right guard outside, with blue PU tubing into the machine base.
- **Electrical cabinet** (`LAYOUT.cabinet`, Rittal TS8 style, RAL 7035): door with handle, side cooling unit, black plinth, cable entry on top, a warning label. It stands outside the back-right of the guard.
- **Cable trays:** perforated galvanised tray (`M.galv`) from the cabinet over the guard top to the delta portal and down to the machine base, with a few cable bundles.

## Budget
- ≤ 160 draw calls for `frame`. Profiles and bolts are instanced already, so merge the rest per material.
- No three.js lights.

## Views to check
`iso`, `front`, `hall`, `scara`, `delta`, plus `--solo frame`.

Times: 2.5 and 12.
