import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { abiHash, abiNames, assert, dist, expectedManifest, handoff, listFiles, readAbi, relativePath, same, sha256, validateInputs } from './integrity.mjs';

validateInputs();
const manifest = JSON.parse(readFileSync(join(dist, 'imd-deployment.json'), 'utf8'));
assert(Array.isArray(manifest.assets), 'Missing asset inventory');
assert(same(manifest, expectedManifest(manifest.assets)), 'Manifest top-level keys, contract bindings or network differ from handoff');
assert(manifest.assets.length <= 128, 'Asset count exceeds 128');
assert(new Set(manifest.assets.map(asset => asset.path)).size === manifest.assets.length, 'Duplicate manifest assets');
const actualFiles = listFiles().filter(path => path !== 'imd-deployment.json');
assert(same(actualFiles, manifest.assets.map(asset => asset.path).sort()), 'Asset inventory is incomplete or contains nonexistent files');
assert(actualFiles.includes('index.html'), 'Static entrypoint is missing');
let size = statSync(join(dist, 'imd-deployment.json')).size;
for (const asset of manifest.assets) {
  assert(same(Object.keys(asset).sort(), ['path', 'sha256']), `Unexpected asset keys: ${asset.path}`);
  assert(relativePath(asset.path) && asset.path !== 'imd-deployment.json', 'Asset path must be relative and cannot include manifest');
  assert(/^[0-9a-f]{64}$/.test(asset.sha256), `Invalid SHA-256: ${asset.path}`);
  const bytes = readFileSync(join(dist, asset.path));
  assert(bytes.length <= 8 * 1024 * 1024, `Asset exceeds 8 MiB: ${asset.path}`);
  assert(sha256(bytes) === asset.sha256, `Asset hash mismatch: ${asset.path}`);
  size += bytes.length;
}
assert(size < 28 * 1024 * 1024, 'Export must leave room in 64 MiB dual-fetch publication response budget');
for (const name of abiNames) {
  const exported = readFileSync(join(dist, 'abi', `${name}.json`));
  assert(exported.equals(readAbi(name).bytes), `Exported ${name} ABI differs from pinned source`);
  const binding = handoff.contracts.find(contract => contract.name === name);
  if (binding) assert(abiHash(JSON.parse(exported.toString('utf8'))) === binding.abiHash, `${name} ABI binding failed`);
}
const html = readFileSync(join(dist, 'index.html'), 'utf8');
assert(!/(?:src|href)=["']\/(?!\/)/.test(html), 'Static entrypoint contains a root-absolute resource path');
console.log(`Verified handoff, network, pinned ABIs and all ${manifest.assets.length} assets (${size.toLocaleString()} exported bytes).`);
