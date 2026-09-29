import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { abiNames, dist, expectedManifest, listFiles, readAbi, sha256, validateInputs } from './integrity.mjs';

validateInputs();
mkdirSync(join(dist, 'abi'), { recursive: true });
for (const name of abiNames) writeFileSync(join(dist, 'abi', `${name}.json`), readAbi(name).bytes);
const assets = listFiles().filter(path => path !== 'imd-deployment.json').map(path => ({ path, sha256: sha256(readFileSync(join(dist, path))) }));
writeFileSync(join(dist, 'imd-deployment.json'), `${JSON.stringify(expectedManifest(assets), null, 2)}\n`);
console.log(`Exported ${abiNames.length} pinned ABIs and deployment manifest with ${assets.length} hashed assets.`);
