# Mini Factory Cell

A browser digital twin of one assembly cell in a small factory hall. Three vibratory bowl feeders supply the housing, spring and cap of a push-button. A delta robot loads the parts onto an 8-station indexing dial. A servo press snaps each cap and tests the spring force, a camera checks the cap, a pneumatic unit removes failed parts, and an Epson T3-B401S SCARA palletises good parts into 4 × 6 trays.

**Live:** https://sergiudanstan.github.io/mini-factory-cell/

The public page is one `index.html`. three.js r186 loads from a CDN.

## What is in this build

- **Deterministic program.** Every pose is a pure function of time. The schedule has interlocks, so the dial indexes only when every tool has left its nest.
- **Equipment.** Weiss-class cam indexer with a modified-sine law, a 1130-class delta and the Epson T3-B401S, all sized from published data.
- **Process.**
  - Bowl feeders with linear-track queues and escapements.
  - Force–travel test at S4 and vision at S5.
  - Two planned rejects: a weak spring and an unlatched cap.
  - Tray palletising and tray exchange.
- **What-if.** Change the dial index time, the delta speed or the feeder rates, and the cycle, interlocks and clearances are recomputed.

## Checks

```sh
node tools/build.mjs           # concatenate src/ into index.html
node tests/run.mjs             # schedule, hand-overs, mutexes, IK, joint limits, clearance, process
node tests/run.mjs --perturb   # weakens the dial interlock: the mutex checks must fail
```

## Layout

`src/page.html` is the shell. `tools/build.mjs` concatenates `src/js/*.js` in lexical order into one module. `index.html` is generated, so do not edit it by hand. The specification and the module contracts are in [docs/SPEC.md](docs/SPEC.md).

Epson and T3 are trademarks of Seiko Epson Corporation. RNA and Weiss are trademarks of their owners. The equipment here is modelled from public catalogue data; it is not their CAD.
