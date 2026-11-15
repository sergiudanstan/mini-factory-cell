## How to work (same for every module task)

1. Work ONLY in your git worktree `~/mini-factory-cell-wt/<name>` (branch `feat/<name>`). Never edit `~/mini-factory-cell` (that is the lead's checkout).
2. Read first: `docs/SPEC.md` (all of it), your file's current stub, `src/js/22-geom.js` (helpers: `mesh box vcyl rod placeRod rbox extrudeXY extrudeXZ lathe tubeAlong profileBeam addBolt labelPlane moduleRoot`), `src/js/21-materials.js` (`M`, `procTex`), `src/js/23-layout.js` (`LAYOUT`), and the logic API at the top of `src/js/10-logic.js`.
3. Touch ONLY the files listed in your task. Do not change the API names listed for your module. Prefix every other module-scope name with your module prefix.
4. Build and check often:
   ```sh
   node tools/build.mjs                       # must print "index.html built from N fragments"
   node tests/run.mjs | tail -2               # must stay "all checks passed" (you do not touch the logic)
   node tools/shots.mjs --port <port> --view <views> --t 2.5,12,30 --out _shots/<name>      # 0 console errors required
   node tools/shots.mjs --port <port> --solo <module> --view <views> --t 12 --out _shots/<name>-solo
   node tools/stats.mjs --port <port> --solo <module>                                      # draw calls within budget
   node tools/shots.mjs --port <port> --cam x,y,z --target x,y,z --t 12 --clean --out _shots/<name>-macro   # close-up, cell frame (z up)
   ```
   Always check your parts in close-up (camera 0.1–0.3 m away): most defects only show there.
   Only one Chrome at a time on this machine (about 3 GB RAM free): run the tools one after another, never in parallel.
   If you can look at images, open your PNGs and judge them against the realism checklist like a picky industrial engineer, then iterate.
5. Commit on your branch only: `git add <your files> docs/tasks/<name>.report.md && git commit -m "<Module>: <what> (M1)"`. Do NOT push, do NOT merge, do NOT rebase onto main unless the lead asks.
6. Write `docs/tasks/<name>.report.md`: what you built (bullet list), draw calls and triangles from stats.mjs, console errors (must be 0), known gaps or requests for the lead (for example a LAYOUT number that does not fit).
7. When finished, reply with exactly one line: `DONE <name>`. If you are blocked, reply `BLOCKED <name>: <reason>`.
