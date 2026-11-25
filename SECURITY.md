# Security Policy

This is a static, browser-only digital twin of a small-factory assembly cell: one generated `index.html` with no backend, no
accounts, no cookies and no data sent anywhere. It loads three.js r186 (`three@0.186.1`) from the jsDelivr CDN at a
pinned version and web fonts from Google Fonts. The only thing it stores locally is a UI preference in `localStorage`.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | ✅ Current |

Single maintainer; only the latest release receives fixes.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.** Report it privately:
**[Report a vulnerability](https://github.com/sergiudanstan/mini-factory-cell/security/advisories/new)**
(Security → Advisories → Report a vulnerability).

| Stage | Target |
|---|---|
| Acknowledgement | within 3 business days |
| Triage | within 10 business days |
| Fix, or a documented decision not to fix | within 90 days |

These are best-effort targets from a single unpaid maintainer, not a contractual SLA.
There is no bug bounty; credit is offered in the advisory and changelog.

## Scope

In scope: script injection through the page (for example through the `?cad`, `?solo` and `?hall` URL parameters (read by `src/js/00-head.js` and `src/js/70-loop.js`)), the page loading code from any origin other than the pinned CDN URL, a committed `index.html` that does not match what `src/` builds, and anything in this repository's workflows that could publish a release not built from `main`.

Out of scope: vulnerabilities in three.js or the CDNs themselves (report upstream), and the accuracy of the simulation or its agreement with a paper or datasheet, which is a correctness bug: file it as a normal issue. `tools/` (screenshots, film recording, Blender export) runs on a developer machine only and is not part of the published page; `cad/t3.glb` is Epson-derived, see THIRD_PARTY_NOTICES.md.

## Supply chain

CI rebuilds `index.html` and checks it matches the commit, runs the logic tests and a headless page smoke test on every push, `npm audit` on the test tooling,
`pip-audit` on the hash-pinned CI toolchain, CodeQL, and `zizmor` on the workflows.
Actions are pinned to full commit SHAs and kept current by Dependabot. Releases attach a
source archive with Sigstore build provenance:

```
gh attestation verify mini-factory-cell-v0.1.0.tar.gz --repo sergiudanstan/mini-factory-cell
```
