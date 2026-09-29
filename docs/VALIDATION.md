# Frontend validation

Validated on 2026-09-29. Implementation and validation are complete for the bounded frontend task. Repository staging/commit is blocked by the worker's read-only `.git`; source, lockfile and static export are present and ready for the publisher's submission step. No site publication or contract deployment was attempted.

## Delivered scope

- Source and frontend configuration: `web/` (React, TypeScript, Vite, viem).
- Production static export: `dist/index.html`, local assets, five pinned implementation ABI arrays, and `dist/imd-deployment.json`.
- Documentation: `web/README.md`, `docs/DESIGN.md`, `docs/INTERFACE_REVIEW.md`, provenance/license notices and validation evidence.
- Four complete user actions, exact-amount IMD approval, live balances/rights/position, projected and live CR, health thresholds, and on-chain-deployer-only grantRights.

The root `DESIGN.md` requirement conflicts with the explicit overriding write budget. Its complete content is supplied under `docs/DESIGN.md`. No contract source, existing ABI export, Foundry configuration, root configuration, root lockfile, `.github/`, `lib/`, or Git submodule was modified. The only new ignore file is explicitly authorized `web/.gitignore`, which excludes nested frontend dependency/cache directories. Browser-tool incidental output was moved into disposable `test/scratch/`; it is not part of delivery.

## Commands and outcomes

| Check | Outcome |
| --- | --- |
| `npm install --prefix web --cache /tmp/comp-npm-cache --no-audit --no-fund` | Passed; source package manifest and npm lockfile retained. A first attempt using the default home cache failed read-only; using a temporary cache resolved it. |
| `npm --prefix web run typecheck` | Passed (`tsc --noEmit`). Also rerun as part of the final build. |
| `npm --prefix web run build` | Passed after final source fixes; relative Vite export, final manifest generation, then integrity verification. |
| `npm --prefix web run verify` | Passed: exact handoff fields/contracts/network; canonical ABI Keccak hashes; original pinned ABI bytes; complete SHA-256 asset inventory; safe paths and budget limits. |
| `npm --prefix web test` | Passed, exit 0: 15 browser scenarios + 9 model/protocol cases; Node reports 25 passing results including the containing browser suite, 0 failures. |
| `node web/scripts/check-chain.mjs` | Passed read-only live chain verification at block 11809155. No transaction requested or broadcast. |
| `git add -- web dist docs` | Blocked by environment: `Unable to create .../.git/index.lock: Read-only file system`. No commit claimed. |

Vite reports one advisory for the approximately 528 KB uncompressed application chunk. The entire export is 582,836 bytes including the manifest, so it is well within the assignment's download and submission budgets. No dependency archive, source map, npm registry mirror, cache or `node_modules` is included. A complete current-source snapshot (128 files, 2,611,928 raw bytes at measurement) was committed only in disposable `test/scratch/` for packaging validation. Its standalone Git bundle verified successfully and measured 1,044,281 bytes, below 8,388,608 bytes. This is a size audit of the complete source/export tree, not a commit in the protected repository or a submission artifact; no extra bundle is shipped.

## Deployment and asset integrity

The frontend fetches the exported `imd-deployment.json` at runtime and obtains its deployment addresses, chain, public RPCs, and referenced ABIs from it. Final manifest SHA-256:

```text
38de1619b861f3043d0bd1d4959cca1c1f6c697b37272e28d5efad1fde2fe16e
```

The browser interaction report independently binds to this hash. The manifest contains 10 hashed asset entries, including index.html, all five ABIs, and every other export file; it excludes itself. Its top-level keys exactly follow the required schema. Handoff contract entries remain the exact LaunchToken, MockIMD and CDPVault set. Derived CompToken/MockWorkOracle ABI files are included as assets, and their addresses are read from the vault at runtime.

Build tooling validates the unchanged copied handoff/network against the supplied inputs while available, and obtains ABI bytes from the deployed source commit `1fc863f3880a7541308f51d16f76c39185e07137`. The three attested ABI hashes match canonical Keccak. Public network configuration and wallet-add-chain data are unchanged. Existing deployed source remains untouched.

[Live chain evidence](evidence/live-chain.json) records Sepolia chain ID, code length/hash at all five contracts, derived addresses, reciprocal vault links, both mock deployers, token decimals/symbols/supplies and the 150% minimum. Both IMD and COMP supply were zero at the sampled block; funded-wallet scenarios use explicit test fixtures. This evidence checks reads and linkage, not live transaction behavior or contract security certification.

## Interaction validation

[Machine-readable results](evidence/interaction-results.json) record Chromium 145.0.7632.6 against the final production export at `/gateway/comp/`, isolated RPC mocks and an injected EIP-1193 wallet. The suite exercises:

- All four primary controls, disconnected and missing-wallet feedback.
- Wrong chain, 4902 unknown-chain fallback with exact add-chain parameters, and immediate state refresh.
- Keyboard-activated approve → deposit → mint → repay → withdraw; confirmed balances, decreasing rights, no rights restoration, no COMP approval, exact approval target/amount.
- Invalid/zero/negative/exponential/overprecision/overflow input; insufficient balances, rights and collateral; one-wei boundary arithmetic.
- Healthy 170%, amber 169%/150%, red 149%, debt-free status and polling updates.
- On-chain-deployer-only grant form, correct invalid-field focus, granting rights, and hiding the panel on account change.
- Wallet rejection, simulation failure before signing, failed receipt, pending duplicate prevention, cancellation/replacement/repricing and final explorer hashes.
- A selected-account change during simulation, including when the former account remains authorized as a secondary account.
- RPC failure pauses writes; late older reads cannot replace a newer confirmed position.
- Missing deployed code and tampered ABI block transactions.
- Exact one-wei balance disclosure, large-value reflow and static-subpath loading.

Source/behavior review found and corrected stale read ordering, cancellation/replacement success messages, the selected-account guard, and delayed refresh after network switch. Regression scenarios now cover each. Failed initial assertions caused by fixture selectors/receipt block progression were corrected in the test harness; the final report includes only the actual final run and all outcomes.

## Browser and interface review

All six pinned Better Interface domains were reviewed during implementation and after correction. [The consolidated review](INTERFACE_REVIEW.md) records source locations, severity, fixes and honest subcheck limitations. Corrections include stronger control boundaries, visible mobile Disconnect, separate admin field validation, accessible exact values and compact balance alignment.

The final automated browser check found no horizontal overflow at 320×844, 390×844, 768×1000 and 1440×1000. Axe scans reported 0 violations at 390 and 1440 widths. Console, page and unexpected resource errors were empty. Reduced-motion and forced-colors settings were exercised; native semantics and keyboard activation remain usable.

Saved mocked connected-state screenshots were opened and visually inspected:

- [Desktop](../web/tests/evidence/desktop.png)
- [Mobile](../web/tests/evidence/mobile.png)

A separate browser-tool session inspected the final export using a temporary foreground Python preview at `/preview/`, then closed the browser and preview. It checked live RPC deployment verification, all local resource responses, the disconnected screen, missing-wallet feedback, 320/390/768/1440 overflow and a visibly focused skip link. [Live desktop](evidence/live-desktop.png) and [live 320px mobile](evidence/live-mobile-320.png) show the disconnected state. [Browser-computed color measurements](evidence/rendered-pairs.json) report:

| Actual pair | WCAG contrast |
| --- | --- |
| Main text / page | 16.63:1 |
| Muted text / action surface | 8.21:1 |
| Amount control boundary / inside | 4.93:1 |
| Amount control boundary / outside | 4.54:1 |
| Primary label / primary fill | 12.48:1 |

These are measured opaque pairs, not a whole-site accessibility certification.

## Explicit limitations

No funded Sepolia action, actual wallet signature, hardware/mobile wallet, WalletConnect, physical device, screen-reader session, non-Chromium rendering, browser-native 200% zoom, localization/RTL, chain reorganization, or 180-second unknown-confirmation timeout was tested. Publication/CID/naming and control-plane checks have not run and are downstream work. The disconnected browser session used real read-only public RPCs; all transaction behavior was mocked.

The page intentionally has no USD estimate, market swap/quote/liquidity flow, initialization control, or live social-image URL. Those are outside the approved vault workflow or lack a supplied source. Rights are test credits, and 1 IMD = 1 COMP is fixed accounting. These limits are visible in the app and README.
