# Frame — M1

## Built

- **Machine base** from `LAYOUT.base`: six 80 × 80 welded RAL 7016 legs on levelling feet (rubber pad, zinc spindle, hex nut, load plate), welded top/bottom perimeter rails and centre cross member, leg-head gussets, 25 mm ground-steel top plate with tapped/dowel-hole patterns, RAL 7035 side/back skins and two hinged front doors with D-handles, hinges, a louvred vent grille and the PB-01 / moving-parts labels. A tray-shuttle skirt/pass-through lip is included on the left side.
- **Guard** from `LAYOUT.guard`: twelve unique 40 × 40 natural-anodised posts with foot plates and floor anchors, top and bottom rails, deduplicated corner brackets with two M8 button-head bolts each, black post caps, 6 mm PC panels (opacity 0.18) with black seals, a front double door and a back single door (profile frames, PC infill, two hinges, bow handles, yellow Euchner-MGB-style handle modules, black locking modules with red status LEDs), four E-stops, and the light curtain with two yellow columns, receiver/emitter lenses, status LEDs, blue reset button, supported shelf and safety sign.
- **Openings**: framed tray-shuttle tunnel in the left guard and three framed hopper-chute openings left/back/right at the `LAYOUT.openings` heights, with flanges, black seals and clear inner apertures.
- **Delta portal** from `LAYOUT.portal`: four 100 × 100 RAL 7016 posts on 220 × 220 base plates with four anchor bolts each, main beams at y = −0.15 / 1.25, cross beams at x = ±0.22, knee braces, bolted aluminium mount plate whose underside is exactly `DELTA.mount` = 1.33, and the yellow "OVERHEAD ROBOT / DELTA CELL" warning label.
- **Tower light** on the front-right post: zinc base, black pole, four Ø60 tiers (red top, amber, green, blue bottom), separator rings and buzzer cap. `FRAME.lamps` exposes the four driven materials; `setStack("run" | "hold" | "alarm" | "call")` lights green/amber/red/blue.
- **HMI** on the front-left post: 15 in-class black panel on an articulated two-segment swing arm with knuckles, clamp and cable; `hmiScreen` is the 512 × 384 canvas and canvas texture painted by the loop. Tilted/yawed screen, E-stop, green start and white reset below the screen.
- **FRL** outside the right guard at `LAYOUT.frl`: supported RAL 7035 filter/regulator body, transparent bowl and drain, pressure gauge with canvas dial, lockable red/yellow shut-off, soft-start valve, and blue PU supply/return tubing routed under the guard bottom into the base.
- **Electrical cabinet** at `LAYOUT.cabinet`: Rittal-TS8-style RAL 7035 body on a black plinth, recessed door with dark reveal, hinges, handle and lock, warning label, document pocket and CONTROL label, cabinet E-stop/main switch, side cooling unit with fan grille, top gland plate with three glands, and floor anchors.
- **Cable trays**: galvanised ladder tray from the cabinet top, over the guard top and to the delta portal, a vertical run beside the portal post, supports, four cable bundles and a base-top gland plate with glands.
- All static geometry is merged per material and parent; profiles and M8 bolts stay in the shared instanced pools. Guard panels, door leaves, door frames, door hardware, interlocks, light-curtain columns/shelf/sign/reset are all in `FRAME.guards`, so `setGuards(false)` removes them and leaves the posts/rails, base, portal, cabinet, HMI and tower light. No three.js lights are added; all textures are procedural canvas textures.

## Validation

- `node tools/build.mjs`: 17 fragments, built successfully.
- `node tests/run.mjs`: `all checks passed` (59.17 s, 2.188 s cycle, 25 good / 2 rejected).
- `node tools/stats.mjs --port 8785 --solo frame --budget --size 1920x1080 --hq on`: **93 draw calls / 160**, **173,906 triangles**; GL all-pass 189 calls / 347,361 triangles. Full scene: 539 calls / 783,066 triangles. Status: ok, all modules within budget.
- 1920 × 1080 HQ screenshots with 0 console errors: `_shots/frame-final/` (`iso`, `front`, `hall`, `scara`, `delta` at 2.5 and 12 s) and `_shots/frame-final-solo/` (`iso`, `front` at 12 s). FPS 60.0 (60 Hz tool cap), HQ watchdog did not trip.
- Close-up inspections with guards on and off covered the base doors, guard doors and interlocks, light curtain and shelf, FRL, cabinet, chute collars, tray tunnel, tower light, portal plate and cable trays. The Guards switch was exercised: all guard panels/doors/curtain disappear while posts, base, portal, HMI, tower and cabinet stay.
- `setStack` was verified in the paused `hold` state (amber tier lit); the run/alarm/call branches share the same simple intensity switch.

## Notes for the lead

- **Back door / guard post conflict:** `LAYOUT.doors` back span is x 0.35…1.05, but `LAYOUT.guard.postsX` has a post at x = 0.45 inside that span. I kept the post as the hinge jamb, built a fixed 0.35…0.43 jamb strip and the door leaf 0.47…1.05. If the door is meant to be the full 0.70 m, either move the back door x0 to 0.47 or move/remove the 0.45 post in `23-layout.js`.
- **Hopper chute openings vs posts:** the A and C chute openings (w = 0.16, centres y = 0.649 and 0.662) overlap the guard post at y = 0.70 by about 40 mm. The collars are framed to the specified openings and the post acts as the right jamb; the actual 76 mm chutes pass clear apart from a few millimetres at the edge. Moving those `LAYOUT.openings` centres to ≈0.63 or the posts away from y = 0.70 would remove the conflict.
- The tower-light materials are local clones of `M.lampRed/amber/green/blue`, not the shared objects: the T3 CAD material table also uses `M.lampAmber` for an indicator, and driving the stack light through the shared material would flash that indicator. `FRAME.lamps` still exposes the four driven materials for `setStack`.
- Guard PC opacity is 0.18 (spec: about 0.16); the panels are deliberately clear so the cell remains legible from the hall/iso cameras, with black seals making the panel edges readable in close-up.
- No `23-layout.js` or `10-logic.js` changes were made. The generated `index.html` is intentionally not committed; rebuild after merging.
