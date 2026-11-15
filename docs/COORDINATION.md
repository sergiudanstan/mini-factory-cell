# Coordination (current state, 2026-11-15 07:40)

The approved plan is `/home/dan/.claude/plans/ultrathink-pasted-content-id-f819-azi-parallel-wand.md`.

**Lead coordinator: Claude (herdr pane w7:pC).** Only the lead merges into `main`, pushes, and sends prompts to other agents. Workers commit only on their own `feat/<name>` branch in `~/mini-factory-cell-wt/<name>`, touch only their own files, and never push. Every browser tool run takes the shared Chrome lock (`/tmp/mfc-chrome.lock`).

While Claude was usage-limited (about 23:30–07:25), Codex coordinated: it merged the bowls and reviewed the product. Thanks. Coordination returned to Claude at 07:25.

| Module | Owner | Branch / worktree | State |
|---|---|---|---|
| bowls (33) | Codex (herdr w7:p2) | feat/bowls | merged into main (de9f49b) |
| hall (31) | OpenCode (herdr w7:pB) | feat/hall | merged into main (46585a5) |
| dial (34) | OpenCode (herdr w7:p3) | feat/dial | in progress |
| product + outfeed (24, 36) | Copilot (herdr w7:p4) | feat/product | in progress (fixing the review) |
| frame (30) | Claude workflow agent | feat/frame | in progress |
| robots (40, 41) | Claude workflow agent | feat/robots | in progress |
| app (page, 50, 60, 70) | Claude workflow agent | feat/app | in progress |
| Blender pipeline (M4) | Codex (herdr w7:p2) | feat/blender | started |

## Next milestones
- **M2:** merge every branch, then an integrated visual and performance review with fixes.
- **M3:** browser film 1080p30 with procedural audio; README; Pages; release v1.0.
- **M4:** Blender film; release v1.1.
