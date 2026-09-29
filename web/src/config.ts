import { createPublicClient, defineChain, fallback, getAddress, http, isAddress, keccak256, stringToHex, type Abi, type Address } from 'viem';
export type Deployment = {
  version: 1; launchId: string; chainId: number; sourceCommit: string; attestationHash: string;
  contracts: { name: string; address: Address; abiHash: string; abiPath: string }[];
  assets: { path: string; sha256: string }[];
  network: { chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string; nativeCurrency: { name: string; symbol: string; decimals: number }; faucets: string[] };
  walletAddChain?: { chainId: string; chainName: string; rpcUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls: string[] };
};
export type Contract = { address: Address; abi: Abi };
export type Runtime = Awaited<ReturnType<typeof loadRuntime>>;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
async function json(path: string) {
  const response = await fetch(new URL(path, document.baseURI), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}
function safePath(path: string) { return /^[a-zA-Z0-9_./-]+$/.test(path) && !path.startsWith('/') && !path.split('/').includes('..'); }
export async function loadRuntime() {
  const manifest = await json('imd-deployment.json') as Deployment;
  if (manifest.version !== 1 || !manifest.network || manifest.chainId !== manifest.network.chainId || !manifest.network.testnet || !manifest.contracts?.length || !manifest.network.rpcUrls.length) throw new Error('Invalid deployment configuration.');
  const chain = defineChain({ id: manifest.chainId, name: manifest.network.name, nativeCurrency: manifest.network.nativeCurrency, rpcUrls: { default: { http: manifest.network.rpcUrls } }, testnet: manifest.network.testnet });
  const client = createPublicClient({ chain, transport: fallback(manifest.network.rpcUrls.map(url => http(url, { timeout: 8000, retryCount: 0 })), { retryCount: 0 }), batch: { multicall: false } });
  async function loadAbi(path: string, expected?: string): Promise<Abi> {
    if (!safePath(path)) throw new Error('Invalid ABI path.');
    const response = await fetch(new URL(path, document.baseURI));
    if (!response.ok) throw new Error('Could not load contract ABI.');
    const bytes = await response.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (manifest.assets.find(asset => asset.path === path)?.sha256 !== digest) throw new Error('ABI asset integrity check failed.');
    const abi = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(abi)) throw new Error('Contract ABI must be an array.');
    if (expected && keccak256(stringToHex(canonical(abi))).slice(2) !== expected) throw new Error('ABI binding check failed.');
    return abi as Abi;
  }
  const contracts: Record<string, Contract> = {};
  await Promise.all(manifest.contracts.map(async c => {
    if (!isAddress(c.address)) throw new Error('Invalid deployment address.');
    contracts[c.name] = { address: getAddress(c.address), abi: await loadAbi(c.abiPath, c.abiHash) };
  }));
  if (!contracts.CDPVault || !contracts.MockIMD) throw new Error('Vault deployment is incomplete.');
  const [compAbi, oracleAbi] = await Promise.all([loadAbi('abi/CompToken.json'), loadAbi('abi/MockWorkOracle.json')]);
  return { manifest, chain, client, contracts, compAbi, oracleAbi };
}
