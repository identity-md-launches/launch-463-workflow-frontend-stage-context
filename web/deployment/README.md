# Deployment build inputs

`deployment.json` and `network.json` are unchanged public copies of the worker's supplied handoff and network table. They contain no signing keys or private RPC credentials. `abi/*.json` are byte-for-byte copies from `docs/abi/<Contract>.json` at the handoff's deployed `sourceCommit`, obtained with `git show`. Their implementation export method is documented in the original `docs/ABI.md` and `tools/export_abi.py`.

The three handoff contract ABI hashes are checked using Keccak-256 of compact JSON with recursively sorted object keys and original array order. CompToken and MockWorkOracle were created by the vault constructor and therefore are not separate handoff contract entries. Their ABIs are also copied from the same pinned implementation; their runtime addresses come only from the vault's `compToken()` and `oracle()` reads.

`npm run build` runs Vite before `scripts/export.mjs` copies the ABIs and generates `dist/imd-deployment.json`. `scripts/verify.mjs` then validates the exact allowed manifest keys, handoff values, unchanged network blocks, complete asset inventory, SHA-256 hashes, ABI bindings, static paths and publication size limits. A Git checkout additionally verifies every stored ABI byte against the deployed commit. A source archive without `.git` rebuilds using the committed ABI copies.

The browser reads `dist/imd-deployment.json` and its referenced ABI assets at runtime. These build inputs are not a separate bundled address map. After any export change, run the build again to regenerate asset hashes. The manifest deliberately excludes its own hash.
