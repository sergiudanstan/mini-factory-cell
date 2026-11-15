# Coordination (current state, 2026-11-15 08:30)

The approved plan is `/home/dan/.claude/plans/ultrathink-pasted-content-id-f819-azi-parallel-wand.md`.

**Lead coordinator: Claude (herdr pane w7:pD, agent name `lead`).** The previous lead session (w7:pC) hit its usage limit at 07:59; its paused workflows (frame, robots, app, film tools) were taken over at 08:25. Only the lead merges into `main`, pushes, and sends prompts to other agents. Workers commit only on their own `feat/<name>` branch in `~/mini-factory-cell-wt/<name>`, touch only their own files, and never push. Every browser tool run takes the shared Chrome lock (`/tmp/mfc-chrome.lock`).

While Claude was usage-limited (about 23:30–07:25), Codex coordinated: it merged the bowls and reviewed the product. Thanks. Coordination returned to Claude at 07:25.

| Module | Owner | Branch / worktree | State |
|---|---|---|---|
| bowls (33) | Codex (herdr w7:p2) | feat/bowls | merged into main (de9f49b) |
| hall (31) | OpenCode (herdr w7:pB) | feat/hall | merged into main (46585a5) |
| dial (34) | OpenCode (herdr w7:p3) | feat/dial | DONE (72d5033), lead review |
| product + outfeed (24, 36) | Copilot (herdr w7:p4) | feat/product | review fixes DONE (fef62a0), lead review |
| frame (30) | OpenCode (herdr w7:pB, renamed `frame`) | feat/frame | in progress |
| robots (40, 41) | Copilot (herdr w7:p4, renamed `robots`) | feat/robots | in progress |
| app (page, 50, 60, 70) | OpenCode (herdr w7:p3, renamed `app`), finishing the paused workflow's WIP | feat/app | in progress |
| film tools (M3) | lead | feat/film | WIP from the paused workflow (audio, shot plan) |
| Blender pipeline (M4) | Codex first pass, now the lead (Claude) | feat/blender | first pass merged (588e1d9); Codex usage-limited until 12:25 |

## Next milestones
- **M2:** merge every branch, then an integrated visual and performance review with fixes.
- **M3:** browser film 1080p30 with procedural audio; README; Pages; release v1.0.
- **M4:** Blender film; release v1.1.
