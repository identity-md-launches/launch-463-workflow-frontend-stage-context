import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { chromium, type Browser, type Page, expect } from '@playwright/test';
import { decodeFunctionData, encodeFunctionResult, encodeErrorResult, parseEther, maxUint256, type Abi, type Address, type Hex } from 'viem';

export const ROOT = resolve(import.meta.dirname, '../..');
export const USER = '0x0000000000000000000000000000000000000300' as Address;
export const ADMIN = '0x0000000000000000000000000000000000000400' as Address;
export const COMP = '0x0000000000000000000000000000000000000100' as Address;
export const ORACLE = '0x0000000000000000000000000000000000000200' as Address;
const BLOCK = `0x${'ab'.repeat(32)}`;
const ZERO_HASH = `0x${'00'.repeat(32)}`;
export { expect, parseEther };

export async function serveExport() {
  const exportRoot = join(ROOT, 'dist');
  const server: Server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, 'http://localhost');
      if (!url.pathname.startsWith('/gateway/comp/')) { res.writeHead(404).end(); return; }
      const file = resolve(exportRoot, decodeURIComponent(url.pathname.slice('/gateway/comp/'.length)) || 'index.html');
      if (!file.startsWith(`${exportRoot}/`)) { res.writeHead(403).end(); return; }
      const content = await readFile(file);
      const type = ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[extname(file)] || 'application/octet-stream';
      res.writeHead(200, {'content-type': type, 'cache-control':'no-store'}).end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as {port:number}).port;
  return { url:`http://127.0.0.1:${port}/gateway/comp/`, close: () => new Promise<void>((done) => server.close(() => done())) };
}

export async function launchBrowser(): Promise<Browser> {
  const options = {headless: true, args:['--no-sandbox']};
  try { return await chromium.launch(options); }
  catch (error) {
    const preinstalled = '/home/imd-worker/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
    try { return await chromium.launch({...options, executablePath:preinstalled}); }
    catch { throw error; }
  }
}

type Transaction = {to:Address, from:Address, data:Hex};
type RpcPayload = {id?:number, method:string, params?:any[]};
export class MockChain {
  readonly unit = parseEther;
  readonly methods: string[] = [];
  readonly sends: {name:string, args:readonly unknown[], to:string}[] = [];
  readonly unexpected: string[] = [];
  readonly receipts = new Map<string, {transaction:Transaction, applied:boolean, reverted:boolean}>();
  manifest: any;
  abis: Record<string,Abi> = {};
  names: Record<string,string> = {};
  chain = '0xaa36a7';
  account: Address = USER;
  connected = false;
  unknownChain = false;
  rejectNext = false;
  revertSimulation = false;
  revertReceipt = false;
  holdReceipt = false;
  failReads = false;
  emptyCode = false;
  collateral = 0n;
  debt = 0n;
  imd = parseEther('1000');
  comp = 0n;
  rights = parseEther('500');
  allowance = 0n;
  grants: {account:string,amount:bigint}[] = [];
  networkAdds: any[] = [];
  counter = 0;
  blockNumber = 0x100;
  holdNextPosition = false;
  releasePosition?: () => void;
  replaceNext?: 'cancelled' | 'replaced' | 'repriced';
  replacement?: {original:string,hash:string,transaction:Transaction,kind:'cancelled'|'replaced'|'repriced'};

  get vault(): Address { return this.manifest.contracts.find((c:any) => c.name === 'CDPVault').address; }
  get imdAddress(): Address { return this.manifest.contracts.find((c:any) => c.name === 'MockIMD').address; }
  async init() {
    this.manifest = JSON.parse(await readFile(join(ROOT,'dist/imd-deployment.json'),'utf8'));
    for (const name of ['LaunchToken','MockIMD','CDPVault','CompToken','MockWorkOracle']) {
      this.abis[name] = JSON.parse(await readFile(join(ROOT,`docs/abi/${name}.json`),'utf8'));
    }
    for (const contract of this.manifest.contracts) this.names[contract.address.toLowerCase()] = contract.name;
    this.names[COMP.toLowerCase()] = 'CompToken'; this.names[ORACLE.toLowerCase()] = 'MockWorkOracle';
    return this;
  }
  decode(tx:Transaction) {
    const name = this.names[tx.to.toLowerCase()];
    if (!name) throw new Error(`Unknown test contract ${tx.to}`);
    const abi = this.abis[name];
    return {contract:name, abi, ...decodeFunctionData({abi, data:tx.data})};
  }
  read(tx:Transaction): Hex {
    const {contract, abi, functionName, args = []} = this.decode(tx);
    const results: Record<string,unknown> = {
      compToken: COMP, oracle:ORACLE, imdToken:this.imdAddress, vault:this.vault, deployer:ADMIN,
      decimals:18, symbol:contract === 'CompToken' ? 'COMP' : contract === 'MockIMD' ? 'IMD' : 'CPL',
      name:contract === 'CompToken' ? 'Compute Money' : 'Identity MD',
      positions:[this.collateral,this.debt], allowance:this.allowance,
      mintingRights:this.rights, totalSupply:this.comp,
      collateralRatio:this.debt === 0n ? maxUint256 : this.collateral*100n/this.debt,
      MIN_COLLATERAL_RATIO:150n, LIQUIDATION_BONUS_PERCENT:10n,
      balanceOf:contract === 'CompToken' ? this.comp : this.imd,
    };
    if (functionName in results) return encodeFunctionResult({abi,functionName,result:results[functionName]});
    if (['approve','depositCollateral','mintCOMP','repayCOMP','withdrawCollateral','grantRights'].includes(functionName)) {
      if (this.revertSimulation) {
        throw {code:3, message:'execution reverted: UnsafeCollateralRatio',data:encodeErrorResult({abi:this.abis.CDPVault,errorName:'UnsafeCollateralRatio'})};
      }
      const amount = args[0] as bigint;
      if (functionName === 'mintCOMP' && (amount > this.rights || this.collateral*100n < (this.debt+amount)*150n)) throw {code:3,message:'execution reverted: UnsafeCollateralRatio'};
      return functionName === 'approve' ? encodeFunctionResult({abi,functionName,result:true}) : '0x';
    }
    throw new Error(`Unhandled mock read ${contract}.${functionName}`);
  }
  apply(tx:Transaction) {
    const {functionName, args = []} = this.decode(tx);
    const amount = args[0] as bigint;
    switch(functionName) {
      case 'approve':this.allowance=args[1] as bigint;break;
      case 'depositCollateral':this.collateral+=amount;this.imd-=amount;this.allowance-=amount;break;
      case 'mintCOMP':this.debt+=amount;this.comp+=amount;this.rights-=amount;break;
      case 'repayCOMP':this.debt-=amount;this.comp-=amount;break;
      case 'withdrawCollateral':this.collateral-=amount;this.imd+=amount;break;
      case 'grantRights':this.grants.push({account:args[0] as string,amount:args[1] as bigint});if((args[0] as string).toLowerCase()===this.account.toLowerCase())this.rights+=args[1] as bigint;break;
      default:throw new Error(`Unhandled mock mutation ${functionName}`);
    }
  }
  rpcTransaction(hash:string, tx:Transaction, pending=false) {
    return {...tx,hash,input:tx.data,value:'0x0',nonce:'0x0',gas:'0x30d40',gasPrice:'0x3b9aca00',blockHash:pending?null:BLOCK,blockNumber:pending?null:'0x100',transactionIndex:pending?null:'0x0',v:'0x1',r:ZERO_HASH,s:ZERO_HASH,type:'0x2',chainId:'0xaa36a7'};
  }
  async request({method,params=[]}:RpcPayload): Promise<any> {
    this.methods.push(method);
    if (this.failReads && !['eth_accounts','eth_requestAccounts','eth_chainId','wallet_switchEthereumChain','wallet_addEthereumChain'].includes(method)) throw {code:-32000,message:'RPC unavailable in test'};
    switch (method) {
      case 'eth_accounts':return this.connected ? [this.account] : [];
      case 'eth_requestAccounts':if(this.rejectNext){this.rejectNext=false;throw {code:4001,message:'User rejected the request.'};} this.connected=true;return [this.account];
      case 'eth_chainId':return this.chain;
      case 'wallet_switchEthereumChain':if(this.unknownChain)throw {code:4902,message:'Unrecognized chain.'};this.chain=params[0].chainId;return null;
      case 'wallet_addEthereumChain':this.networkAdds.push(params[0]);this.unknownChain=false;return null;
      case 'eth_getCode':return this.emptyCode ? '0x' : '0x6001600055';
      case 'eth_call': {
        const result=this.read(params[0]);
        if(this.holdNextPosition && this.decode(params[0]).functionName==='positions'){
          this.holdNextPosition=false;
          await new Promise<void>(resolve=>{this.releasePosition=resolve;});
        }
        return result;
      }
      case 'eth_estimateGas':return '0x30d40';
      case 'eth_gasPrice':return '0x3b9aca00';
      case 'eth_maxPriorityFeePerGas':return '0x3b9aca00';
      case 'eth_getTransactionCount':return '0x0';
      case 'eth_blockNumber':return `0x${(++this.blockNumber).toString(16)}`;
      case 'eth_getBalance':return '0xde0b6b3a7640000';
      case 'eth_sendTransaction': {
        if (this.rejectNext) {this.rejectNext=false;throw {code:4001,message:'User rejected the request.'};}
        const tx=params[0];const decoded=this.decode(tx);
        this.sends.push({name:decoded.functionName,args:decoded.args ?? [],to:tx.to});
        const hash=`0x${(++this.counter).toString(16).padStart(64,'0')}`;
        this.receipts.set(hash,{transaction:tx,applied:false,reverted:this.revertReceipt});this.revertReceipt=false;
        if(this.replaceNext){
          const kind=this.replaceNext;this.replaceNext=undefined;
          const replacementHash=`0x${(++this.counter).toString(16).padStart(64,'0')}`;
          const transaction=kind==='repriced'?tx:{...tx,to:kind==='cancelled'?tx.from:ADMIN,data:'0x'};
          this.replacement={original:hash,hash:replacementHash,transaction,kind};
          this.receipts.set(replacementHash,{transaction:tx,applied:false,reverted:false});
        }
        return hash;
      }
      case 'eth_getTransactionReceipt': {
        const entry=this.receipts.get(params[0]);if(!entry || this.holdReceipt || this.replacement?.original===params[0])return null;
        if(!entry.applied){if(!entry.reverted && !(this.replacement?.hash===params[0] && this.replacement.kind!=='repriced'))this.apply(entry.transaction);entry.applied=true;}
        return {transactionHash:params[0],transactionIndex:'0x0',blockHash:BLOCK,blockNumber:'0x100',from:entry.transaction.from,to:entry.transaction.to,cumulativeGasUsed:'0x186a0',gasUsed:'0x186a0',contractAddress:null,logs:[],logsBloom:`0x${'00'.repeat(256)}`,status:entry.reverted?'0x0':'0x1',effectiveGasPrice:'0x3b9aca00',type:'0x2'};
      }
      case 'eth_getTransactionByHash': {
        const entry=this.receipts.get(params[0]);return entry?this.rpcTransaction(params[0],entry.transaction,this.replacement?.original===params[0]):null;
      }
      case 'eth_getBlockByNumber':return {number:'0x100',hash:BLOCK,parentHash:ZERO_HASH,timestamp:'0x65000000',gasLimit:'0x1c9c380',gasUsed:'0x186a0',baseFeePerGas:'0x3b9aca00',difficulty:'0x0',extraData:'0x',logsBloom:`0x${'00'.repeat(256)}`,miner:USER,mixHash:ZERO_HASH,nonce:'0x0000000000000000',receiptsRoot:ZERO_HASH,sha3Uncles:ZERO_HASH,stateRoot:ZERO_HASH,transactionsRoot:ZERO_HASH,size:'0x100',totalDifficulty:'0x0',transactions:this.replacement?[this.rpcTransaction(this.replacement.hash,this.replacement.transaction)]:[],uncles:[]};
      default:this.unexpected.push(method);throw new Error(`Unhandled mock RPC ${method}`);
    }
  }
  async install(page:Page,{wallet=true}:{wallet?:boolean}={}) {
    await page.route('https://**',async route=>{
      const request=route.request();
      if(!this.manifest.network.rpcUrls.some((url:string)=>request.url().startsWith(url))) { await route.abort('blockedbyclient');return; }
      if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});return;}
      const input=request.postDataJSON();
      const answer=async (p:RpcPayload)=>{try{return {jsonrpc:'2.0',id:p.id,result:p.method === 'eth_chainId' ? `0x${this.manifest.chainId.toString(16)}` : await this.request(p)};}catch(error:any){return {jsonrpc:'2.0',id:p.id,error:{code:error.code ?? -32000,message:error.message ?? String(error),data:error.data}};}};
      const output=Array.isArray(input)?await Promise.all(input.map(answer)):await answer(input);
      await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(output)});
    });
    if (!wallet)return;
    await page.exposeBinding('__testWalletRequest', async (_source,payload:RpcPayload)=>{try{return {result:await this.request(payload)};}catch(error:any){return {error:{code:error.code ?? -32000,message:error.message ?? String(error),data:error.data}};}});
    await page.addInitScript({content: `(() => {
      const listeners = new Map();
      window.ethereum = {
        isMetaMask: true,
        request: async (payload) => {
          const reply = await window.__testWalletRequest(payload);
          if (reply.error) throw Object.assign(new Error(reply.error.message), reply.error);
          if (payload.method === 'wallet_switchEthereumChain') for (const fn of listeners.get('chainChanged') || []) fn(payload.params[0].chainId);
          return reply.result;
        },
        on: (event, fn) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); },
        removeListener: (event, fn) => listeners.get(event)?.delete(fn),
      };
      window.__testEmit = (event, value) => { for (const fn of listeners.get(event) || []) fn(value); };
    })();`});
  }
}
