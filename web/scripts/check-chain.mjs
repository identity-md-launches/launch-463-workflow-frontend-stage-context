import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, getAddress, http, keccak256, zeroAddress } from 'viem';
import { abiHash, assert, handoff, network, readAbi, root, validateInputs } from './integrity.mjs';

// This checker only uses public JSON-RPC reads. It never accepts a signer or sends a transaction.
validateInputs();
const startedAt = new Date().toISOString();
const attempts = [];
let evidence;
for (const rpcUrl of network.network.rpcUrls) {
  try {
    const client = createPublicClient({ transport: http(rpcUrl, { timeout: 15000, retryCount: 0 }), batch: { multicall: false } });
    const chainId = await client.getChainId();
    assert(chainId === handoff.chainId, `RPC chain ${chainId} differs from handoff ${handoff.chainId}`);
    const block = await client.getBlock();
    assert(block.number !== null, 'RPC did not return a mined block');
    const read = (contract, functionName) => client.readContract({ ...contract, functionName, blockNumber: block.number });
    const contracts = Object.fromEntries(handoff.contracts.map(contract => [contract.name, { address: getAddress(contract.address), abi: readAbi(contract.name).abi }]));
    assert(contracts.CDPVault && contracts.MockIMD && contracts.LaunchToken, 'Expected vault, collateral and launch token in handoff');
    const [imdAddress, compAddress, oracleAddress] = await Promise.all(['imdToken', 'compToken', 'oracle'].map(name => read(contracts.CDPVault, name)));
    assert(getAddress(imdAddress) === contracts.MockIMD.address, 'Vault collateral address differs from handoff');
    assert(getAddress(compAddress) !== zeroAddress && getAddress(oracleAddress) !== zeroAddress, 'Vault returned an uninitialized link');
    contracts.CompToken = { address: getAddress(compAddress), abi: readAbi('CompToken').abi };
    contracts.MockWorkOracle = { address: getAddress(oracleAddress), abi: readAbi('MockWorkOracle').abi };
    const contractEvidence = await Promise.all(Object.entries(contracts).map(async ([name, contract]) => {
      const code = await client.getCode({ address: contract.address, blockNumber: block.number });
      assert(code && code !== '0x', `${name} has no deployed code`);
      const entry = {
        name, address: contract.address,
        addressSource: handoff.contracts.some(item => item.name === name) ? 'deployment handoff' : `CDPVault.${name === 'CompToken' ? 'compToken' : 'oracle'}()`,
        codeBytes: (code.length - 2) / 2,
        codeKeccak256: keccak256(code).slice(2),
        abiCanonicalKeccak256: abiHash(contract.abi),
      };
      if (['LaunchToken', 'MockIMD', 'CompToken'].includes(name)) {
        const [symbol, decimals, totalSupply] = await Promise.all(['symbol', 'decimals', 'totalSupply'].map(method => read(contract, method)));
        const expectedSymbol = name === 'LaunchToken' ? handoff.manifest.token.symbol : name === 'MockIMD' ? 'IMD' : 'COMP';
        assert(symbol === expectedSymbol, `${name} returned unexpected symbol`);
        assert(decimals === 18, `${name} returned unexpected decimals`);
        Object.assign(entry, { symbol, decimals, totalSupplyMinorUnits: totalSupply.toString() });
      }
      if (name === 'CompToken' || name === 'MockWorkOracle') {
        const vault = getAddress(await read(contract, 'vault'));
        assert(vault === contracts.CDPVault.address, `${name} reciprocal vault link differs`);
        Object.assign(entry, { vault });
      }
      if (name === 'MockIMD' || name === 'MockWorkOracle') Object.assign(entry, { deployer: getAddress(await read(contract, 'deployer')) });
      return entry;
    }));
    const minimumCollateralRatio = await read(contracts.CDPVault, 'MIN_COLLATERAL_RATIO');
    assert(minimumCollateralRatio === 150n, 'Vault returned unexpected minimum collateral ratio');
    const imdDeployer = contractEvidence.find(contract => contract.name === 'MockIMD').deployer;
    const oracleDeployer = contractEvidence.find(contract => contract.name === 'MockWorkOracle').deployer;
    assert(imdDeployer === oracleDeployer, 'MockIMD and oracle deployer getters differ');
    attempts.push({ rpcUrl, result: 'passed' });
    evidence = {
      result: 'passed', startedAt, completedAt: new Date().toISOString(),
      command: 'cd web && node scripts/check-chain.mjs',
      readOnly: true, transactionsBroadcast: 0,
      launchId: handoff.launchId, sourceCommit: handoff.sourceCommit, attestationHash: handoff.attestationHash,
      rpcUrl, chainId,
      blockNumber: block.number.toString(), blockHash: block.hash,
      blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      allContractReadsPinnedToBlock: true,
      vaultLinks: { imdToken: getAddress(imdAddress), compToken: getAddress(compAddress), oracle: getAddress(oracleAddress) },
      minimumCollateralRatio: minimumCollateralRatio.toString(),
      deployerGettersAgree: true,
      contracts: contractEvidence,
      rpcAttempts: attempts,
      limitations: [
        'Read-only verification does not establish successful wallet prompts, funded transactions or future RPC availability.',
        'Nonempty runtime code and reciprocal links were checked; no creation/runtime bytecode equivalence claim is made.',
        'CompToken and MockWorkOracle addresses are derived from the attested vault; their ABI copies are pinned to the deployed source commit and are not separate attested handoff contract entries.',
      ],
    };
    break;
  } catch (error) {
    attempts.push({ rpcUrl, result: 'failed', error: error.shortMessage ?? error.message });
  }
}
assert(evidence, `No configured RPC passed verification: ${JSON.stringify(attempts)}`);
const directory = join(root, 'docs', 'evidence');
mkdirSync(directory, { recursive: true });
writeFileSync(join(directory, 'live-chain.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Verified ${evidence.contracts.length} contracts at Sepolia block ${evidence.blockNumber}; wrote docs/evidence/live-chain.json. No transactions sent.`);
