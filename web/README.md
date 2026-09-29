# COMP frontend

A static Sepolia vault UI built with React, TypeScript, Vite and viem. The source is in `web/`; the committed hosting artifact is repository-root `dist/`. Serve `dist/` directly, including its deployment manifest and ABI files. No backend, private credentials, external fonts, registry mirror, or runtime package installation is needed to host it.

## Install, build and preview

Use Node.js 22 and npm. From the repository root:

```sh
npm ci --prefix web --cache /tmp/comp-npm-cache
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run preview -- --port 4188
```

`build` typechecks, exports relative Vite assets, copies the pinned implementation ABIs, creates `dist/imd-deployment.json` **after** the export, then verifies its exact handoff binding and every asset hash. Rebuild after any source/export change. `preview` serves the production export; `dev` first builds deployment artifacts and then runs Vite with hot reload. Development serves the same generated manifest/ABI files through its middleware. Use `npm --prefix web run dev` for this mode.

The worker used a temporary npm cache because its home directory is read-only. Neither dependencies nor caches are submitted. `web/.gitignore` is explicitly budgeted by the assignment and excludes dependencies/caches/reports at every nesting level under `web/`. No root ignore or build files were changed.

## Runtime configuration and provenance

`dist/imd-deployment.json` is the app's single runtime authority for chain, deployed addresses, ABI paths and public RPCs. `web/src/config.ts` fetches it relative to the current static hosting path and fetches its ABI JSON. It checks SHA-256 against the asset inventory and canonical Keccak for attested contract ABIs. The build inputs are the unchanged public handoff/network in `web/deployment/`; these are provenance/build inputs, not an additional runtime address map.

The source commit is `1fc863f3880a7541308f51d16f76c39185e07137`. Build tooling compares ABI bytes with `git show <sourceCommit>:docs/abi/<Contract>.json` when Git history is available and checks the three handoff ABI hashes. The exact handoff contract set is LaunchToken, MockIMD and CDPVault. CompToken and MockWorkOracle are constructed by the vault, so their addresses are read from `compToken()` and `oracle()`. Their implementation-derived ABIs are additional hashed assets; they are deliberately not invented handoff contract entries. The app verifies nonempty code and reciprocal vault links before enabling actions. The admin address comes from the oracle's `deployer()` getter.

The network and wallet-add-chain blocks are copied unchanged. Reads use the listed public RPCs with fallback; writes use only the visitor's injected Ethereum browser wallet. Wrong-chain wallets get one switch control; unknown-chain error 4902 triggers the exact configured `wallet_addEthereumChain` request followed by another switch. No WalletConnect project ID was supplied, so this delivery supports injected browser wallets only.

All internal assets use a relative base; the page uses hash anchors, requiring no server route rewrites. The deployed site URL/IPFS CID is not assigned in this worker. Absolute social-image metadata remains pending that URL. The supplied favicon and title are local product assets.

## Contract interactions

- **Deposit IMD:** exact-amount approval to CDPVault when required, confirmed and reread before a separately requested deposit.
- **Mint COMP:** constrained by remaining oracle rights and a resulting collateral ratio of at least 150%. Rights visibly decrement after confirmation.
- **Repay COMP:** vault burns COMP directly; no COMP allowance is required. Repayment never restores rights.
- **Withdraw IMD:** limited to collateral available above the 150% requirement, with exact integer rounding.
- **Grant rights:** available only when the connected account equals on-chain `MockWorkOracle.deployer()`. Recipient and amount are validated separately.

Before a wallet request, the app checks the currently selected account and chain, refreshes position state, validates limits, simulates the contract call, and checks account/chain again. Actions remain locked through receipt and refresh. Failed/rejected/cancelled/replaced transactions are distinguished; replacement explorer links follow the final hash. A receipt timeout leaves actions locked and offers “Check confirmation.” Polls refresh every five seconds while visible; stale responses cannot overwrite newer snapshots. Errors pause writes until reads recover.

Summary token values are shortened to four fractional digits. The native “View exact balances” disclosure exposes full precision. CR uses the contract's integer percentage convention; debt-free positions display “No debt.” Green means ≥170%, amber 150–169%, red <150%, each with text. The fixed testnet accounting price is 1 IMD = 1 COMP, not a USD price.

The CPL launch pool is not part of the approved vault workflow. This interface adds no swaps, quotes, liquidity, initialization or liquidation flow. No Uniswap addresses are hard-coded or used for collateral approvals: those approvals go to the verified CDPVault. The unchanged network block retains Uniswap reference data.

## Validation

```sh
npm --prefix web test
npm --prefix web run verify
npm --prefix web run check-chain
```

`test` includes exact-arithmetic and wallet guard tests plus a bounded Chromium run against the real production export at a gateway-style subpath. Public RPC, wallet requests and transaction receipts are mocked for state-changing scenarios. The runner owns and closes its temporary HTTP server and browser. Install a local Chromium with `cd web && npx playwright install chromium` if no supported browser is available; in restricted environments set `PLAYWRIGHT_BROWSERS_PATH` to a writable temporary directory. No test writes a real chain transaction.

`check-chain` performs only public reads and writes its timestamped evidence to `docs/evidence/live-chain.json`. It does not sign or request transactions. See `docs/VALIDATION.md`, `docs/INTERFACE_REVIEW.md`, `docs/DESIGN.md` and `docs/evidence/interaction-results.json` for actual results and limitations. Design guidance attribution is in `docs/THIRD_PARTY_NOTICES.md`.

Root `DESIGN.md` could not be emitted because the overriding path budget permits only `web/**`, `dist/**`, and `docs/**` (plus the explicit `web/.gitignore`). The complete design documentation is supplied at `docs/DESIGN.md`. Contracts, root configuration and dependency source remain unchanged. Publication, naming, IPFS pinning and control-plane checks are subsequent publisher work.
