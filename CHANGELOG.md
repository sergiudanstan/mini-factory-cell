# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-11-26

### Removed
- `docs/COORDINATION.md` and `docs/tasks/`: agent working notes from how the twin was built (they contained local paths of the author's machine). Nothing in the build, tests or CI used them.

## [0.1.0] - 2026-11-25

First tagged release of a small-factory assembly cell digital twin: three vibratory bowl feeders, a delta robot, an 8-station dial and an Epson T3-B401S SCARA, as published at
https://sergiudanstan.github.io/mini-factory-cell/.

### Added
- Headless page smoke test (`npm run smoke`): loads `index.html` in Chrome and fails on any page error, failed request, console error or missing WebGL canvas.
- CI that rebuilds `index.html` from `src/` and fails if the committed file differs, runs the logic checks (`tests/run.mjs`: schedule, hand-overs, mutexes, inverse kinematics, joint limits, clearance, process), the perturbation check (`npm run perturb`) and the headless page smoke test, and audits dependencies and workflows.
- Python syntax check of the Blender and CAD helper scripts in CI.
- CodeQL, OpenSSF Scorecard and a tag-triggered release workflow with build provenance; Dependabot for actions and npm.
- `SECURITY.md`, `CONTRIBUTING.md` and this changelog.

### Changed
- `playwright-core` (test tooling only) pinned exactly at 1.65.0.

[Unreleased]: https://github.com/sergiudanstan/mini-factory-cell/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/sergiudanstan/mini-factory-cell/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/sergiudanstan/mini-factory-cell/releases/tag/v0.1.0
