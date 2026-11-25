# Contributing

Contributions are welcome. This is a single-maintainer project, so please open an issue
before starting anything substantial.

**Security problems do not belong in issues.** Follow [SECURITY.md](SECURITY.md).

## Branches, pull requests and releases

- `main` is the only long-lived branch and is protected: changes land through a pull
  request with the required checks green, commits on `main` are signed, and force-pushes
  are refused. Pull requests are squash-merged; GitHub deletes the branch on merge.
- Branch names: `<type>/<topic>` (`feat/`, `fix/`, `docs/`, `chore/`, `release/`);
  agents use `agent/<name>/<topic>`.
- A release is a pull request that bumps `version` in `package.json` and moves
  `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) to a dated version. After it merges, a
  signed `vX.Y.Z` tag on that commit triggers `release.yml`, which refuses to run if the
  tag, `package.json` and the changelog disagree. Tags are never moved or deleted.

## Running it locally

```bash
node tools/build.mjs     # or: npm run build; regenerates index.html from src/
npm test                  # build + logic checks
npm run perturb           # the checks must catch a deliberately weakened interlock
npm run smoke             # headless page smoke test (needs Google Chrome)
python3 -m http.server    # then open http://localhost:8000/
```

`index.html` is generated from `src/` by `tools/build.mjs`; CI rebuilds it and fails if the committed file differs, so rebuild and commit it together with any change under `src/`.

Use `PW_CHANNEL=chromium` if you installed Playwright's own Chromium instead of Chrome.
