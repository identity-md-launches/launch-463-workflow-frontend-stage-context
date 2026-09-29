import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAbi } from 'viem';
import { assertWallet, sendAction, switchNetwork, type Provider } from '../src/protocol';
import type { Runtime } from '../src/config';
const account='0x0000000000000000000000000000000000000300';
const contract={address:'0x0000000000000000000000000000000000000500' as const,abi:parseAbi(['function depositCollateral(uint256 amount)'])};
const addChain={chainId:'0xaa36a7',chainName:'Sepolia',rpcUrls:['https://example.invalid'],nativeCurrency:{name:'Sepolia Ether',symbol:'ETH',decimals:18},blockExplorerUrls:['https://example.invalid']};
const runtime={manifest:{chainId:11155111,walletAddChain:addChain}} as unknown as Runtime;

test('unknown wallet chain adds the exact configured chain and retries switching',async()=>{
  const calls:{method:string;params?:unknown[]}[]=[];
  const provider:Provider={request:async args=>{calls.push(args);if(calls.length===1)throw {code:4902};return null;}};
  await switchNetwork(provider,runtime);
  assert.deepEqual(calls,[
    {method:'wallet_switchEthereumChain',params:[{chainId:'0xaa36a7'}]},
    {method:'wallet_addEthereumChain',params:[addChain]},
    {method:'wallet_switchEthereumChain',params:[{chainId:'0xaa36a7'}]},
  ]);
});

test('rejected chain switch does not request chain addition',async()=>{
  const methods:string[]=[];
  await assert.rejects(switchNetwork({request:async args=>{methods.push(args.method);throw {code:4001};}},runtime));
  assert.deepEqual(methods,['wallet_switchEthereumChain']);
});

test('a disconnected, nonselected or wrong-chain account cannot begin transaction simulation',async()=>{
  const noSimulation={...runtime,client:{simulateContract:async()=>{throw new Error('simulation must not execute');}}} as unknown as Runtime;
  for(const [chain,accounts] of [['0x1',[account]],['0xaa36a7',[]],['0xaa36a7',['0x0000000000000000000000000000000000000400',account]]]) {
    let sends=0;
    const provider:Provider={request:async ({method})=>{if(method==='eth_sendTransaction')sends++;return method==='eth_chainId'?chain:accounts;}};
    await assert.rejects(sendAction(noSimulation,provider,account,contract,'depositCollateral',[1n]),/network or account changed/);
    assert.equal(sends,0);
  }
});

test('wallet account changes during simulation prevent a signature request',async()=>{
  let accounts:string[]=[account];let sends=0;
  const provider:Provider={request:async({method})=>{if(method==='eth_sendTransaction')sends++;return method==='eth_chainId'?'0xaa36a7':accounts;}};
  const changing={...runtime,client:{simulateContract:async()=>{accounts=[];}}} as unknown as Runtime;
  await assert.rejects(sendAction(changing,provider,account,contract,'depositCollateral',[1n]),/network or account changed/);
  assert.equal(sends,0);
});

test('simulation failure surfaces before eth_sendTransaction',async()=>{
  let sends=0;
  const provider:Provider={request:async({method})=>{if(method==='eth_sendTransaction')sends++;return method==='eth_chainId'?'0xaa36a7':[account];}};
  const failing={...runtime,client:{simulateContract:async()=>{throw new Error('UnsafeCollateralRatio');}}} as unknown as Runtime;
  await assert.rejects(sendAction(failing,provider,account,contract,'depositCollateral',[1n]),/UnsafeCollateralRatio/);
  assert.equal(sends,0);
  await assertWallet(provider,runtime,account);
});
