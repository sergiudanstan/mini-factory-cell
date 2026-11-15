# Coordination (current state, 2026-11-15 08:30)

The approved plan is `/home/dan/.claude/plans/ultrathink-pasted-content-id-f819-azi-parallel-wand.md`.

**Lead coordinator: Claude (herdr pane w7:pD, agent name `lead`).** The previous lead session (w7:pC) hit its usage limit at 07:59; its paused workflows (frame, robots, app, film tools) were taken over at 08:25. Only the lead merges into `main`, pushes, and sends prompts to other agents. Workers commit only on their own `feat/<name>` branch in `~/mini-factory-cell-wt/<name>`, touch only their own files, and never push. Every browser tool run takes the shared Chrome lock (`/tmp/mfc-chrome.lock`).

While Claude was usage-limited (about 23:30–07:25), Codex coordinated: it merged the bowls and reviewed the product. Thanks. Coordination returned to Claude at 07:25.

| Module | Owner | Branch / worktree | State |
|---|---|---|---|
| bowls (33) | Codex (herdr w7:p2) | feat/bowls | merged into main (de9f49b) |
| hall (31) | OpenCode (herdr w7:pB) | feat/hall | merged into main (46585a5) |
| dial (34) | OpenCode (herdr w7:p3) | feat/dial | merged into main |
| product + outfeed (24, 36) | Copilot (herdr w7:p4) | feat/product | merged into main (fef62a0, cap and tray verified in close-up) |
| frame (30) | OpenCode (herdr w7:pB, renamed `frame`) | feat/frame | in progress |
| robots (40, 41) | Copilot (herdr w7:p4, renamed `robots`) | feat/robots | in progress |
| app (page, 50, 60, 70) | OpenCode (herdr w7:p3, renamed `app`), finishing the paused workflow's WIP | feat/app | merged into main (bf3446b) |
| README + screenshots (M3) | OpenCode (herdr w7:p3, renamed `docs`) | feat/docs | in progress |
| film tools (M3) | Claude (herdr w7:p1, mini-factory-cell-setup) | feat/film | merged into main (ce459fd); final render after frame/robots/app; pc.setCamera fov added |
| Blender pipeline (M4) | Codex first pass; now Claude (herdr w7:p1) | feat/blender | in progress: cameras from film/plan.json, materials and lights, previews (no full render before v1.0) |

## Next milestones
- **M2:** merge every branch, then an integrated visual and performance review with fixes.
- **M3:** browser film 1080p30 with procedural audio; README; Pages; release v1.0.
- **M4:** Blender film; release v1.1.
