import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keccak256, stringToHex } from 'viem';

export const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const root = resolve(webRoot, '..');
export const dist = join(root, 'dist');
export const inputs = join(webRoot, 'deployment');
export const handoff = JSON.parse(readFileSync(join(inputs, 'deployment.json'), 'utf8'));
export const network = JSON.parse(readFileSync(join(inputs, 'network.json'), 'utf8'));
export const abiNames = [...new Set([...handoff.contracts.map(contract => contract.name), 'CompToken', 'MockWorkOracle'])];
export const canonical = value => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
    : JSON.stringify(value);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const abiHash = abi => keccak256(stringToHex(canonical(abi))).slice(2);
export const assert = (condition, message) => { if (!condition) throw new Error(message); };
export const same = (left, right) => canonical(left) === canonical(right);
export const relativePath = path => typeof path === 'string' && /^[a-zA-Z0-9_./-]+$/.test(path) && !path.startsWith('/') && !path.split('/').some(part => !part || part === '.' || part === '..');

export function readAbi(name) {
  assert(/^[A-Za-z][A-Za-z0-9_]*$/.test(name), `Invalid contract name: ${name}`);
  const bytes = readFileSync(join(inputs, 'abi', `${name}.json`));
  const abi = JSON.parse(bytes.toString('utf8'));
  assert(Array.isArray(abi), `${name} ABI must be a raw JSON array`);
  // Repositories retain the deployed source. A source-only archive can still rebuild
  // from these exact pinned copies; archive provenance is documented in README.
  if (existsSync(join(root, '.git'))) {
    const original = execFileSync('git', ['show', `${handoff.sourceCommit}:docs/abi/${name}.json`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    assert(original.equals(bytes), `${name} ABI differs from pinned deployed source`);
  }
  const binding = handoff.contracts.find(contract => contract.name === name);
  if (binding) assert(abiHash(abi) === binding.abiHash, `${name} canonical Keccak ABI hash differs from deployment handoff`);
  return { abi, bytes };
}

export function validateInputs() {
  assert(handoff.version === 1 && Number.isSafeInteger(handoff.chainId), 'Invalid handoff version/chain');
  assert(/^[0-9a-f]{40}$/.test(handoff.sourceCommit), 'Invalid deployed source commit');
  assert(/^[0-9a-f]{64}$/.test(handoff.attestationHash), 'Invalid attestation hash');
  assert(typeof handoff.launchId === 'string' && handoff.launchId.length > 0, 'Missing launch ID');
  assert(Array.isArray(handoff.contracts) && handoff.contracts.length > 0, 'Missing contracts');
  assert(new Set(handoff.contracts.map(c => c.name)).size === handoff.contracts.length, 'Duplicate contract names');
  for (const contract of handoff.contracts) {
    assert(/^0x[0-9a-fA-F]{40}$/.test(contract.address), `Invalid address: ${contract.name}`);
    assert(/^[0-9a-f]{64}$/.test(contract.abiHash), `Invalid ABI hash: ${contract.name}`);
  }
  assert(network.network.chainId === handoff.chainId, 'Network and handoff chain IDs differ');
  assert(network.network.rpcUrls.length > 0 && network.network.rpcUrls.every(url => new URL(url).protocol === 'https:'), 'Missing HTTPS public RPC');
  if (network.walletAddChain) assert(Number(BigInt(network.walletAddChain.chainId)) === handoff.chainId, 'Wallet network chain ID differs');
  // When worker inputs are present, the durable build inputs must still match them.
  for (const filename of ['deployment.json', 'network.json']) {
    const supplied = join(root, '.imd', 'reads', filename);
    if (existsSync(supplied)) assert(same(JSON.parse(readFileSync(supplied, 'utf8')), JSON.parse(readFileSync(join(inputs, filename), 'utf8'))), `Durable ${filename} differs from supplied input`);
  }
  for (const name of abiNames) readAbi(name);
}

export function listFiles(directory = dist, prefix = '') {
  return readdirSync(directory).sort().flatMap(name => {
    const path = prefix ? `${prefix}/${name}` : name;
    const file = join(directory, name);
    const stat = lstatSync(file);
    assert(!stat.isSymbolicLink(), `Export contains a symlink: ${path}`);
    if (stat.isDirectory()) return listFiles(file, path);
    assert(stat.isFile(), `Export contains a non-file: ${path}`);
    assert(relativePath(path), `Unsafe export path: ${path}`);
    return [path];
  });
}

export function expectedManifest(assets) {
  return {
    version: 1,
    launchId: handoff.launchId,
    chainId: handoff.chainId,
    sourceCommit: handoff.sourceCommit,
    attestationHash: handoff.attestationHash,
    contracts: handoff.contracts.map(({ name, address, abiHash: hash }) => ({ name, address, abiHash: hash, abiPath: `abi/${name}.json` })),
    assets,
    network: network.network,
    ...(network.walletAddChain ? { walletAddChain: network.walletAddChain } : {}),
  };
}
