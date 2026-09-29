# Interface review and evidence

## Scope and assumptions

Reviewed the single-page COMP Sepolia vault, its production static export, four user actions, approval step, wallet states, live balances, oracle rights, health display, contract disclosure, and deployer-only grant form. The requested dark-only style and fixed testnet accounting price remain authoritative. There is no supplied USD feed, live hosting origin, localization, or WalletConnect project ID. The app therefore uses token units, an injected browser wallet, relative assets, and no invented USD values or social-image URL.

The pinned Better Interface workflow, all six domains' core principles/verification sections, relevant form/keyboard/contrast support, and documentation method were read during implementation. The pinned eth-frontend-ux adapter/reference were also reviewed. These inputs were treated as design data within the user's write budget. [DESIGN.md](DESIGN.md) documents the actual source; the root location requested elsewhere is prohibited by that overriding budget. Attribution and exact supplied license copies are retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Coverage

| Domain | Status | Checked evidence | Limits / not applicable |
| --- | --- | --- | --- |
| Accessibility | Checked | Native buttons/forms/details; one main landmark and h1; labels and linked errors; skip link; focus CSS; keyboard activation of the full mocked action loop; automated axe scans; reduced-motion and forced-color emulation | No screen-reader session, physical device test, or native browser zoom. No modal/focus trap is needed. Axe results do not establish complete accessibility compliance. |
| Layout | Checked | Logical spacing; balance/position/form reading order; wrapping address/value source rules; desktop/mobile screenshots independently viewed; no overflow at 320/390/768/1440 in browser checks | English-only. RTL mirror and translated/pseudo-localized content not tested. Responsive viewport checks do not establish native zoom behavior. |
| Writing | Checked | Deposit/Mint/Repay/Withdraw labels match selectors; separate approval explanation; no-approval burn repayment and nonrestored rights explained; recoverable wallet/RPC/revert errors; fixed 1:1 and test-credit assumptions | No USD valuation source. Absolute Open Graph image metadata remains pending a real publication origin. |
| Typography | Checked | System stacks, unitless line heights, heading hierarchy, tabular numeric values, input sizes, native exact-value disclosure; rendered wrapping checked in saved screenshots | Exact font face/weight depends on the platform. Browser evidence is Chromium on this worker, not a Safari/font-matrix test. |
| Colors | Checked | Semantic palette; health text plus color; one lime primary action; measured declared opaque pairs; browser-computed control boundaries rechecked after correction | APCA not measured. No light theme. Decorative translucent health strip is redundant with text and ratio; no independent graphical contrast claim is made for it. |
| UI details | Checked | Shared panel/control states; selected/hover/focus/disabled/loading/error states in source; pending receipt lock and recovery; local consistent SVGs; restrained motion/reduced-motion CSS | No animated overlays or theme transitions exist. Animations-panel playback at 10% speed was not performed. |

## Findings and corrections

Locations refer to the delivered source, where the correction can be inspected. Findings are consolidated by cause rather than repeated per component.

| Severity / domain | Location | Evidence and impact | Correction and recheck |
| --- | --- | --- | --- |
| Medium / colors | `web/src/styles.css:8`, `:22`, `:95`, `:117` | Initial control boundary `#39453c` against surface `#181c1a` measured 1.71:1 (and 1.86:1 against page/input `#101312`), below the 3:1 nontext control-boundary target. Input and neutral-action shapes were faint. | Added `--control-border: #77877b` for buttons and fields while preserving structural card borders. Declared final pairs measure 4.54:1 / 4.93:1; browser suite separately reads the actual opaque backgrounds and checks both boundaries ≥3:1. |
| Medium / writing, accessibility | `web/src/App.tsx:196`, `web/src/styles.css:129` | The initial connected mobile wallet control hid “Disconnect,” leaving an address as its only visible action cue in the inspected mobile screenshot. | Keep Disconnect visible beneath the address at narrow widths, with an explicit accessible name and title. Final mobile screenshot and source are rechecked. |
| Medium / accessibility | `web/src/App.tsx:176`, `:223` | Initial admin validation combined recipient and amount errors. A valid address with a zero amount focused/marked the recipient rather than the field requiring correction. | Separate `adminError` and `rightsError`, error associations and refs; focus the invalid field and clear its error when edited. Browser regression supplies valid recipient + zero rights and checks rights-input focus/invalid state. |
| Medium / typography, accessibility | `web/src/App.tsx:224`, `web/src/styles.css:132` | Summary balances shorten precision; an initial title attribute was the only access to full values, which is inadequate for touch/keyboard use. | Added native “View exact balances” details with selectable formatted values for both tokens, rights, collateral and debt. Browser regression covers one wei, long values, and narrow reflow. |
| Medium / UI state | `web/src/App.tsx:81`, `:95` | Unknown-chain/add-chain interaction initially cleared balances but waited until the next 5-second poll to restore them. This was reproduced by the browser test. | Wallet-chain change now triggers immediate refresh; browser chain-switch/add-chain regression is rerun. |
| Low / layout | `web/src/styles.css:129` | Initial compact balance rows separated labels and decorative markers awkwardly. | Mobile labels/markers now share a leading-edge row; corrected desktop/mobile screenshots inspected. |

Contract transaction checks additionally address account changes, stale/overlapping reads, simulation before signing, reverted receipts, replacement/cancellation receipts, and confirmation uncertainty. Those are behavioral checks rather than proof from a visual review; see the validation report and machine-readable interaction evidence.

## Contrast measurements

Ratios below were calculated using WCAG relative luminance from the exact source colors. Surfaces are opaque, with the relevant positions confirmed in screenshots. Browser-computed control-boundary ratios are recorded separately in the interaction JSON. The reference target is 4.5:1 for ordinary text and 3:1 for required nontext boundaries, not a blanket WCAG-conformance claim.

| Foreground / background | Ratio |
| --- | --- |
| Main text `#eef3ee` / surface `#181c1a` | 15.32:1 |
| Muted text `#aab6ae` / surface `#181c1a` | 8.21:1 |
| Primary label `#18220e` / lime `#c0ef80` | 12.48:1 |
| Focus `#c0ef80` / surface `#181c1a` | 13.03:1 |
| Placeholder `#829087` / input background `#101312` | 5.60:1 |
| Control border `#77877b` / surface `#181c1a` | 4.54:1 |
| Control border `#77877b` / input background `#101312` | 4.93:1 |
| Control border `#77877b` / raised surface `#1e2420` | 4.17:1 |

## Verification record

The production browser harness serves `dist/` at `/gateway/comp/` and supplies isolated wallet/RPC mocks. The final run at `2026-09-29T18:05:55.182Z` passed all 15 browser scenarios, with no recorded console/page/resource errors, no horizontal overflow at the four checked widths, and zero axe violations at 390px and 1440px. Nine additional model/protocol tests passed. Commands and per-scenario outcomes are in [VALIDATION.md](VALIDATION.md) and [evidence/interaction-results.json](evidence/interaction-results.json). The browser result binds the tested deployment manifest to SHA-256 `38de1619b861f3043d0bd1d4959cca1c1f6c697b37272e28d5efad1fde2fe16e`, independently matched against the export during this review. Screenshots are [desktop](../web/tests/evidence/desktop.png) and [mobile](../web/tests/evidence/mobile.png); both final images were independently opened and inspected after the corrections. These are mocked funded-wallet states, not live funded-chain results.

A separate browser inspection used the temporary foreground production preview at `/preview/`: [live desktop](evidence/live-desktop.png) and [live 320px mobile](evidence/live-mobile-320.png). Live read-only deployment verification completed; the session checked static/RPC resource responses, disconnected/missing-wallet behavior, visible skip-link focus, and overflow. [Rendered color pairs](evidence/rendered-pairs.json) confirm control boundaries, muted text, main text, and the primary button from browser-computed styles. Its precise results are recorded in the main validation document. No transaction was broadcast to validate the interface.

Reproduction commands used by the implementation/test workers are `npm --prefix web run typecheck`, `npm --prefix web run build`, `npm --prefix web test`, and the browser test command documented in `web/README.md`. A build success does not substitute for the browser or interaction evidence. Publication/CID/ENS checks are outside this worker's completion and are not represented as having run.

## Completion and limitations

Complete for the stated interface-review scope. All six domains were reviewed and applicable findings corrected; the final browser regression passed. This is a worker report, not independent network certification. Unperformed native zoom, screen-reader, physical-device, non-Chromium, actual funded-wallet transactions, the 180-second unknown-confirmation timeout, and chain-reorganization checks remain explicit limitations. No unresolved visual or interaction blocker was found in the independently inspected states after the listed corrections.
