import { encodeFunctionData, getAddress, isAddress, zeroAddress, type Address, type Hash, type Hex } from 'viem';
import type { Contract, Runtime } from './config';
import type { Snapshot } from './model';
export type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
};
declare global { interface Window { ethereum?: Provider } }
export type Verified = { vault: Contract; imd: Contract; comp: Contract; oracle: Contract; deployer: Address; imdDecimals: number; compDecimals: number };
export async function verifyDeployment(runtime: Runtime): Promise<Verified> {
  const { client, contracts } = runtime;
  if (await client.getChainId() !== runtime.manifest.chainId) throw new Error('RPC chain mismatch.');
  const vault = contracts.CDPVault;
  const read = (contract: Contract, functionName: string) => client.readContract({ ...contract, functionName });
  await Promise.all(Object.values(contracts).map(async contract => {
    const code = await client.getCode({ address: contract.address });
    if (!code || code === '0x') throw new Error('A deployment contract has no code.');
  }));
  const [imdAddress, compAddress, oracleAddress] = await Promise.all(['imdToken', 'compToken', 'oracle'].map(name => read(vault, name))) as Address[];
  if (getAddress(imdAddress) !== contracts.MockIMD.address || !isAddress(compAddress) || compAddress === zeroAddress || !isAddress(oracleAddress) || oracleAddress === zeroAddress) throw new Error('Vault contract links do not match deployment.');
  const comp = { address: getAddress(compAddress), abi: runtime.compAbi };
  const oracle = { address: getAddress(oracleAddress), abi: runtime.oracleAbi };
  for (const contract of [comp, oracle]) { const code = await client.getCode({ address: contract.address }); if (!code || code === '0x') throw new Error('A linked contract has no code.'); }
  const [compVault, oracleVault, deployer, imdDecimals, compDecimals, imdSymbol, compSymbol, minimum] = await Promise.all([
    read(comp, 'vault'), read(oracle, 'vault'), read(oracle, 'deployer'), read(contracts.MockIMD, 'decimals'), read(comp, 'decimals'), read(contracts.MockIMD, 'symbol'), read(comp, 'symbol'), read(vault, 'MIN_COLLATERAL_RATIO'),
  ]);
  if (getAddress(compVault as Address) !== vault.address || getAddress(oracleVault as Address) !== vault.address || !isAddress(deployer as string) || imdDecimals !== 18 || compDecimals !== 18 || imdSymbol !== 'IMD' || compSymbol !== 'COMP' || minimum !== 150n) throw new Error('Unexpected contract configuration.');
  return { vault, imd: contracts.MockIMD, comp, oracle, deployer: getAddress(deployer as Address), imdDecimals, compDecimals };
}
export async function readSnapshot(runtime: Runtime, verified: Verified, account: Address): Promise<Snapshot> {
  const block = await runtime.client.getBlockNumber({ cacheTime: 0 });
  const read = (contract: Contract, functionName: string, args: unknown[]) => runtime.client.readContract({ ...contract, functionName, args, blockNumber: block });
  const [imd, comp, rights, position, allowance, ratio] = await Promise.all([
    read(verified.imd, 'balanceOf', [account]), read(verified.comp, 'balanceOf', [account]), read(verified.oracle, 'mintingRights', [account]), read(verified.vault, 'positions', [account]), read(verified.imd, 'allowance', [account, verified.vault.address]), read(verified.vault, 'collateralRatio', [account]),
  ]) as [bigint, bigint, bigint, [bigint, bigint], bigint, bigint];
  return { imd, comp, rights, collateral: position[0], debt: position[1], allowance, ratio, block, updatedAt: Date.now() };
}
export async function switchNetwork(provider: Provider, runtime: Runtime) {
  const chainId = `0x${runtime.manifest.chainId.toString(16)}`;
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] }); }
  catch (error) {
    const e = error as { code?: number; message?: string; data?: { originalError?: { code?: number } } };
    if (!(e.code === 4902 || e.data?.originalError?.code === 4902 || /unknown chain|unrecognized chain|not added/i.test(e.message ?? '')) || !runtime.manifest.walletAddChain) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [runtime.manifest.walletAddChain] });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  }
}
export async function assertWallet(provider: Provider, runtime: Runtime, account: Address) {
  const [chainId, accounts] = await Promise.all([provider.request({ method: 'eth_chainId' }), provider.request({ method: 'eth_accounts' })]);
  if (Number(chainId) !== runtime.manifest.chainId || (accounts as string[])[0]?.toLowerCase() !== account.toLowerCase()) throw new Error('Wallet network or account changed.');
}
export async function sendAction(runtime: Runtime, provider: Provider, account: Address, contract: Contract, functionName: string, args: unknown[]): Promise<Hash> {
  await assertWallet(provider, runtime, account);
  await runtime.client.simulateContract({ ...contract, functionName, args, account });
  await assertWallet(provider, runtime, account);
  const data = encodeFunctionData({ abi: contract.abi, functionName, args });
  return await provider.request({ method: 'eth_sendTransaction', params: [{ from: account, to: contract.address, data: data as Hex }] }) as Hash;
}
