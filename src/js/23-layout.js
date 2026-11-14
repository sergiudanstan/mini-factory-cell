// ================================================================ shared 3D layout (metres, z up, base top z = 0, origin = dial centre)
// Read-only for every module task. Anything the program logic needs (stations, pick nests, robots, tray, tooling) lives in
// 10-logic.js; LAYOUT adds the geometry that only the 3D model needs, derived from those constants where possible.
const LAYOUT = (() => {
  const floor = FLOOR;
  // ---- vibratory bowl feeders (RNA-style). Z = discharge height above the mounting surface (drive + base plate + bowl).
  // The bowl outlet is tangent to the linear track, so the bowl centre sits beside the track end at the track radius.
  const spec = {
    A: { model: "ZSB-N 400-30-160", type: "cylindrical", rim: 0.440, h: 0.160, track: 0.030, pitch: 0.050, turns: 3.2, dir: "cw",
         drive: { model: "SRC-N 400-2", d: 0.440, h: 0.228 }, plate: { d: 0.485, h: 0.030 }, Z: 0.403, lining: "bead-blasted 304" },
    B: { model: "ZSB-N 250-30-110", type: "cylindrical", rim: 0.288, h: 0.110, track: 0.030, exitTrack: 0.012, pitch: 0.035, turns: 3.1, dir: "cw",
         drive: { model: "SRC-N 250-2", d: 0.290, h: 0.215 }, plate: { d: 0.332, h: 0.025 }, Z: 0.350, lining: "bead-blasted 304, anti-tangle tooling" },
    C: { model: "TAG-N 250-32-130", type: "stepped", rim: 0.400, h: 0.122, track: 0.032, pitch: 0.042, turns: 2.9, dir: "ccw",
         drive: { model: "SRC-N 250-2", d: 0.290, h: 0.215 }, plate: { d: 0.332, h: 0.025 }, Z: 0.340, lining: "cast aluminium, black PU coated" },
  };
  const bowls = FEED.map((f) => {
    const b = spec[f.id], outletZ = PICK.z + 0.0003;                      // bowl exit 0.3 mm above the linear track
    const outlet = [f.x + f.ux * f.track, f.y + f.uy * f.track];
    const rTrack = b.rim / 2 - b.track / 2 - 0.003;                       // track centreline radius at the exit
    const n = b.dir === "cw" ? [-f.uy, f.ux] : [f.uy, -f.ux];            // rotate u by +90° (cw bowl) or -90° (ccw bowl)
    const c = [outlet[0] + n[0] * rTrack, outlet[1] + n[1] * rTrack];
    const mount = outletZ - b.Z;                                          // top of the stand top plate
    const exitAng = Math.atan2(outlet[1] - c[1], outlet[0] - c[0]);       // where the helix leaves the bowl (rad)
    return { ...b, id: f.id, f: f.i, c, cx: c[0], cy: c[1], rTrack, outlet, outletZ, exitAng, mount,
      stand: { model: "UG 400 cast pedestal", colour: "RAL 6011", z0: floor, z1: mount - 0.021, top: 0.380 },
      topPlate: { z0: mount - 0.021, z1: mount, d: 0.380 },
      rimZ: outletZ + 0.006, bottomZ: outletZ - b.h + 0.010,
      cover: { model: "HK-S (round, acoustic)", r: b.rim / 2 + 0.055, z0: mount + 0.02, z1: outletZ + 0.10, lid: "PC, hinged half open" },
      // linear feeder (RNA SLL 400-400) under the track: drive 430 x 84 x 103, infeed overhang 1/3, discharge 2/3
      linear: { model: "SLL 400-400", len: 0.430, w: 0.084, h: 0.103, s0: 0.060, s1: 0.490, trackH: 0.025, zTop: PICK.z,
                cover: "PC 2 mm, 1 mm over the parts", column: { model: "UTL 2", z0: floor, z1: PICK.z - 0.025 - 0.103 } },
      pickNest: { x: f.x, y: f.y, z: PICK.z, block: [0.060, 0.050, 0.040], fibre: "through-beam M3 at the nest, queue-full 120 mm upstream" },
      hopper: { model: "BVL 15 vibratory hopper", side: f.id === "A" ? -1 : f.id === "C" ? 1 : 0 },
    };
  });
  // hopper positions outside the guard, chutes discharging over each bowl
  const guard = { x0: -1.35, x1: 1.35, y0: -1.10, y1: 1.45, top: floor + 2.0, gap: 0.15, post: 0.040, panelT: 0.006,
                  postsX: [-1.35, -0.45, 0.45, 1.35], postsY: [-1.10, -0.20, 0.70, 1.45] };
  bowls[0].hopper.p = [guard.x0 - 0.38, bowls[0].cy, 0.46];
  bowls[1].hopper.p = [bowls[1].cx, guard.y1 + 0.38, 0.46];
  bowls[2].hopper.p = [guard.x1 + 0.38, bowls[2].cy, 0.46];
  bowls.forEach((b) => { b.hopper.chute = [b.hopper.p, [b.cx + (b.cx - b.hopper.p[0]) * 0.1, b.cy + (b.cy - b.hopper.p[1]) * 0.1, b.rimZ + 0.10]]; });

  return {
    floor,
    // welded steel machine base (RAL 7016 frame, RAL 7035 panels), ground steel top plate 25 mm, top at z = 0
    base: { x0: -0.82, x1: 0.50, y0: -0.86, y1: 0.42, plate: 0.025, tube: 0.080, foot: 0.10, legsX: [-0.78, -0.16, 0.46], legsY: [-0.82, 0.38] },
    // Weiss TC220T-class indexer under the dial (stationary centre carries the tooling column)
    indexer: { w: 0.260, d: 0.260, z0: 0.0, z1: 0.165, flangeR: 0.110, motor: { r: 0.060, len: 0.290, axis: "-x", z: 0.080 } },
    anvil: { s: 4, r: 0.030, z0: 0.0, z1: DIAL.top - DIAL.t - 0.0002 },     // hardened anvil under the S4 nest
    // steel portal for the delta (floor-standing, independent of the machine base), mount plate underside = DELTA.mount
    portal: { posts: [[-0.95, -0.15], [0.95, -0.15], [-0.95, 1.25], [0.95, 1.25]], post: 0.100, beam: [0.080, 0.120],
              beamY: [-0.15, 1.25], crossX: [-0.22, 0.22], z0: DELTA.mount + 0.025, z1: DELTA.mount + 0.145,
              plate: { x: DELTA.cx, y: DELTA.cy, w: 0.50, d: 0.50, z0: DELTA.mount, z1: DELTA.mount + 0.025 }, colour: "RAL 7016" },
    delta: { baseZ: [DELTA.zb + 0.02, DELTA.mount], driveR: 0.045, rodR: 0.010, rodHalf: 0.045, ball: 0.012 },
    t3: { x: SCARA.x, y: SCARA.y, face: SCARA.face, riser: T3G.riser, plate: 0.220, pattern: 0.120 },
    bowls,
    guard,
    doors: [
      { side: "front", x0: -1.25, x1: -0.45, double: true },               // operator double door, guard-locking interlock
      { side: "back", x0: 0.35, x1: 1.05, double: false },                 // maintenance door behind the bowls
    ],
    curtain: { side: "front", x0: -0.20, x1: 0.20, z0: 0.00, z1: 0.45, note: "reject bin access, 14 mm light curtain" },
    openings: [
      { side: "left", y: TRAY.cy, w: 0.30, z0: 0.10, z1: 0.30, what: "tray shuttle tunnel" },
      ...bowls.map((b) => ({ side: b.id === "A" ? "left" : b.id === "B" ? "back" : "right", along: b.id === "B" ? b.cx : b.cy, w: 0.16, z0: b.rimZ + 0.04, z1: b.rimZ + 0.20, what: `hopper chute ${b.id}` })),
    ],
    tray: { ...TRAY, shuttle: { y: TRAY.cy, x0: TRAY.cx + TRAY.out + TRAY.push - 0.20, x1: TRAY.cx + 0.16, z: TRAY.top - TRAY.t - 0.03 },
            magazine: { x: TRAY.cx + TRAY.out, y: TRAY.cy, stack: 6 }, fullTable: { x: TRAY.cx + TRAY.out + TRAY.push, y: TRAY.cy } },
    bin: BIN,
    stack: { x: 1.35, y: -1.10, tiers: ["red", "amber", "green", "blue"] },  // tower light on the front-right post
    hmi: { x: -1.35, y: -1.10, z: 0.70, size: "15 in", arm: "swing arm from the front-left post" },
    cabinet: { x: 1.78, y: 1.62, w: 0.80, d: 0.50, h: 2.00, plinth: 0.10, colour: "RAL 7035", cooler: "side" },
    frl: { x: 1.42, y: -0.55, z: 0.20, note: "FRL with lockable shut-off, 6 bar, blue PU tubing" },
    hall: { x0: -11, x1: 13, y0: -7, y1: 7, h: 7.0, note: "steel portal frames, sandwich-panel walls, skylights, LED high-bays" },
  };
})();
