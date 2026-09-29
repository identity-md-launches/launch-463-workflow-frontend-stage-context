import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { ADMIN, USER, ROOT, MockChain, serveExport, launchBrowser, expect, parseEther } from './harness';

const report:any={version:1,executedAt:new Date().toISOString(),mode:'Production static export at gateway subpath; fully mocked public RPC and injected EIP-1193 wallet',tests:[],viewports:[],accessibility:[],screenshots:[],errors:[],limitations:['No transaction was broadcast to Sepolia; wallet confirmations, RPC state and receipts were simulated.','No hardware/mobile wallet, WalletConnect, screen reader or native browser zoom testing.','Automated accessibility checks do not certify full WCAG conformance.','The 180-second unknown-confirmation timeout and chain reorganizations were not exercised.']};

test('production browser interaction validation',{timeout:240_000},async t=>{
  const server=await serveExport();
  const browser=await launchBrowser();
  report.browser=browser.version();
  report.deploymentManifestSha256=createHash('sha256').update(await readFile(join(ROOT,'dist/imd-deployment.json'))).digest('hex');
  const setup=async(options:{wallet?:boolean;connected?:boolean;admin?:boolean;tamperAbi?:boolean;prepare?:(chain:MockChain)=>void}={})=>{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const page=await context.newPage();
    page.setDefaultTimeout(10_000);
    const chain=await new MockChain().init();
    if(options.admin)chain.account=ADMIN;
    if(options.connected)chain.connected=true;
    options.prepare?.(chain);
    await chain.install(page,{wallet:options.wallet});
    if(options.tamperAbi)await page.route('**/abi/MockIMD.json',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
    const errors:string[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`);});
    page.on('requestfailed',r=>errors.push(`request: ${r.url()} ${r.failure()?.errorText}`));
    await page.goto(server.url);
    return {context,page,chain,errors};
  };
  const connect=async(page:Page)=>{
    await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();
    await expect(page.getByTestId('balance-imd')).toHaveText(/\d/);
  };
  const select=async(page:Page,name:string)=>{await page.getByRole('group',{name:'Vault action'}).getByRole('button',{name,exact:true}).focus();await page.keyboard.press('Enter');};
  const amount=async(page:Page,value:string)=>page.getByLabel(/^Amount \((IMD|COMP)\)$/).fill(value);
  const execute=(page:Page)=>page.getByTestId('execute-action');
  const submit=async(page:Page)=>{await execute(page).focus();await page.keyboard.press('Enter');};
  async function check(name:string,fn:()=>Promise<void>) {
    await t.test(name,{timeout:60_000},async()=>{
      const start=Date.now();
      try{await fn();report.tests.push({name,status:'passed',durationMs:Date.now()-start});}
      catch(error){report.tests.push({name,status:'failed',error:String(error),durationMs:Date.now()-start});throw error;}
    });
  }
  try {
    await check('disconnected primary controls and missing-wallet feedback',async()=>{
      const {context,page,chain}=await setup({wallet:false});
      try{
        for(const name of ['Deposit IMD','Mint COMP','Repay COMP','Withdraw IMD'])await expect(page.getByRole('button',{name,exact:true}).first()).toBeVisible();
        await expect(execute(page)).toHaveCount(0);
        await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();
        await expect(page.getByText(/install.*wallet|no.*wallet|browser wallet/i).first()).toBeVisible();
        assert.equal(chain.sends.length,0);
      }finally{await context.close();}
    });
    await check('unknown wallet chain offers exact add-chain parameters and then connects',async()=>{
      const {context,page,chain}=await setup({prepare:c=>{c.chain='0x1';c.unknownChain=true;}});
      try{
        await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();
        await expect(page.getByRole('button',{name:'Switch to Sepolia',exact:true})).toBeVisible();
        await expect(execute(page)).toHaveCount(0);
        await page.getByRole('button',{name:'Switch to Sepolia',exact:true}).click();
        await expect(page.getByTestId('balance-imd')).toHaveText(/1,000/);
        assert.deepEqual(chain.networkAdds,[chain.manifest.walletAddChain]);
        assert.equal(chain.chain,'0xaa36a7');
        assert.equal(chain.sends.length,0);
      }finally{await context.close();}
    });
    await check('keyboard-activated approval, deposit, mint, repay and withdraw loop updates visible balances and rights',async()=>{
      const {context,page,chain,errors}=await setup();
      try{
        await connect(page);
        await expect(page.getByTestId('balance-imd')).toHaveText(/1,000/);
        await expect(page.getByTestId('balance-rights')).toHaveText(/500/);
        await expect(page.getByRole('heading',{name:/grant minting rights/i})).toHaveCount(0);
        await amount(page,'300');
        await expect(execute(page)).toHaveText(/Approve IMD/);
        await submit(page);
        await expect(execute(page)).toHaveText(/Deposit IMD/);
        await expect(execute(page)).toBeEnabled();
        assert.equal(chain.sends[0].name,'approve');
        assert.equal(chain.sends[0].args[1],parseEther('300'));
        assert.equal(String(chain.sends[0].args[0]).toLowerCase(),chain.vault.toLowerCase());
        await submit(page);
        await expect(page.getByTestId('position-collateral')).toHaveText(/300/);
        await expect(page.getByTestId('balance-imd')).toHaveText(/700/);
        await select(page,'Mint COMP');await amount(page,'100');await submit(page);
        await expect(page.getByTestId('position-debt')).toHaveText(/100/);
        await expect(page.getByTestId('balance-comp')).toHaveText(/100/);
        await expect(page.getByTestId('balance-rights')).toHaveText(/400/);
        await expect(page.getByTestId('position-ratio')).toHaveText(/300%/);
        await select(page,'Repay COMP');await amount(page,'100');
        await expect(execute(page)).toHaveText(/Repay COMP/);await submit(page);
        await expect(page.getByTestId('position-debt')).toHaveText(/^0(?:\s|[A-Z]|$)/);
        await expect(page.getByTestId('balance-comp')).toHaveText(/^0(?:\s|[A-Z]|$)/);
        await expect(page.getByTestId('balance-rights')).toHaveText(/400/);
        await select(page,'Withdraw IMD');await amount(page,'300');await submit(page);
        await expect(page.getByTestId('position-collateral')).toHaveText(/^0(?:\s|[A-Z]|$)/);
        await expect(page.getByTestId('balance-imd')).toHaveText(/1,000/);
        assert.deepEqual(chain.sends.map(s=>s.name),['approve','depositCollateral','mintCOMP','repayCOMP','withdrawCollateral']);
        assert.equal(chain.rights,parseEther('400'));
        assert.deepEqual(chain.unexpected,[]);assert.deepEqual(errors,[]);
      }finally{await context.close();}
    });
    await check('invalid inputs and unsafe position changes cannot request transactions',async()=>{
      const {context,page,chain}=await setup({prepare:c=>{c.collateral=parseEther('300');c.debt=parseEther('100');c.comp=parseEther('100');c.rights=parseEther('50');}});
      try{
        await connect(page);
        for(const invalid of ['0','-1','1e3','0.0000000000000000001','1001']){await amount(page,invalid);if(await execute(page).isEnabled()){await submit(page);await expect(page.locator('#amount-error')).not.toBeEmpty();}else{await expect(execute(page)).toBeDisabled();}assert.equal(chain.sends.length,0);}
        await select(page,'Mint COMP');await amount(page,'51');await expect(execute(page)).toBeDisabled();await expect(page.getByText(/Insufficient minting rights/)).toBeVisible();
        await select(page,'Withdraw IMD');await amount(page,'151');await expect(execute(page)).toBeDisabled();await expect(page.getByText(/below 150%/)).toBeVisible();
        await select(page,'Repay COMP');await amount(page,'101');await expect(execute(page)).toBeDisabled();
        assert.equal(chain.sends.length,0);
      }finally{await context.close();}
    });
    await check('health state displays green, amber and red at exact CR boundaries',async()=>{
      const {context,page,chain}=await setup({prepare:c=>{c.collateral=parseEther('170');c.debt=parseEther('100');}});
      try{
        await connect(page);
        for(const [collateral,label,tone] of [['170','Healthy','healthy'],['169','Near minimum','caution'],['150','Near minimum','caution'],['149','At risk','danger']]){
          chain.collateral=parseEther(collateral);
          await page.getByRole('button',{name:/refresh/i}).click();
          await expect(page.getByTestId('position-ratio')).toHaveText(new RegExp(`${collateral}%`));
          await expect(page.getByText(label,{exact:true})).toBeVisible();
          await expect(page.getByTestId('health-status')).toHaveClass(new RegExp(tone));
        }
        chain.collateral=parseEther('180');
        await expect(page.getByTestId('position-ratio')).toHaveText(/180%/,{timeout:8_000});
      }finally{await context.close();}
    });
    await check('grantRights appears for on-chain deployer only and increases rights',async()=>{
      const {context,page,chain}=await setup({admin:true});
      try{
        await connect(page);
        await expect(page.getByRole('heading',{name:/grant minting rights/i})).toBeVisible();
        await page.getByLabel('Recipient address',{exact:true}).fill('0x0000000000000000000000000000000000000000');
        await page.getByLabel(/rights.*amount|amount.*rights/i).fill('25');
        await page.getByRole('button',{name:'Grant rights',exact:true}).click();
        await expect(page.locator('#admin-error')).toContainText(/nonzero|valid.*address/i);
        assert.equal(chain.grants.length,0);
        await page.getByLabel('Recipient address',{exact:true}).fill(ADMIN);
        await page.getByLabel('Rights amount (COMP)',{exact:true}).fill('0');
        await page.getByRole('button',{name:'Grant rights',exact:true}).click();
        await expect(page.getByLabel('Rights amount (COMP)',{exact:true})).toBeFocused();
        await expect(page.getByLabel('Rights amount (COMP)',{exact:true})).toHaveAttribute('aria-invalid','true');
        assert.equal(chain.grants.length,0);
        await page.getByLabel(/rights.*amount|amount.*rights/i).fill('25');
        await page.getByRole('button',{name:'Grant rights',exact:true}).click();
        await expect(page.getByTestId('balance-rights')).toHaveText(/525/);
        assert.equal(chain.grants.length,1);
        chain.account=USER;
        await page.evaluate(user=>(window as any).__testEmit('accountsChanged',[user]),USER);
        await expect(page.getByRole('heading',{name:/grant minting rights/i})).toHaveCount(0);
      }finally{await context.close();}
    });
    await check('wallet rejection and simulation revert are visible and preserve retry controls',async()=>{
      const {context,page,chain}=await setup({prepare:c=>{c.allowance=parseEther('100');}});
      try{
        await connect(page);await amount(page,'10');chain.rejectNext=true;await submit(page);
        await expect(page.getByText(/Request rejected in your wallet/)).toBeVisible();
        await expect(execute(page)).toBeEnabled();assert.equal(chain.sends.length,0);
        chain.revertSimulation=true;await submit(page);
        await expect(page.getByText(/position must remain at or above 150%/)).toBeVisible();assert.equal(chain.sends.length,0);
        chain.revertSimulation=false;await submit(page);await expect(page.getByTestId('position-collateral')).toHaveText(/10/);
      }finally{await context.close();}
    });
    await check('pending receipts prevent duplicate actions and failed receipts do not report success',async()=>{
      const {context,page,chain}=await setup({prepare:c=>{c.allowance=parseEther('100');c.holdReceipt=true;}});
      try{
        await connect(page);await amount(page,'10');await submit(page);
        await expect(execute(page)).toBeDisabled();
        await expect.poll(()=>chain.sends.length).toBe(1);
        await expect(page.getByText(/confirming|pending|waiting for confirmation/i).first()).toBeVisible();
        assert.equal(chain.collateral,0n);
        chain.holdReceipt=false;
        await expect(page.getByTestId('position-collateral')).toHaveText(/10/,{timeout:15_000});
        await amount(page,'5');chain.revertReceipt=true;await submit(page);
        await expect(page.getByText(/revert|failed on.chain|transaction failed/i).first()).toBeVisible();
        assert.equal(chain.collateral,parseEther('10'));
        await expect(execute(page)).toBeEnabled();
      }finally{await context.close();}
    });
    await check('cancelled and replaced transactions avoid false success; repricing completes once',async()=>{
      for(const kind of ['cancelled','replaced','repriced'] as const){
        const {context,page,chain}=await setup({prepare:c=>{c.allowance=parseEther('100');c.replaceNext=kind;}});
        try{
          await connect(page);await amount(page,'10');await submit(page);
          if(kind==='repriced'){
            await expect(page.getByTestId('position-collateral')).toHaveText(/10/,{timeout:15_000});
            await expect(page.locator('.transaction-status')).toContainText('Deposit IMD confirmed');
            assert.equal(chain.collateral,parseEther('10'));
          }else{
            await expect(page.locator('.transaction-status')).toContainText(`Transaction ${kind} in your wallet`,{timeout:15_000});
            await expect(page.locator('.transaction-status')).not.toContainText('confirmed');
            assert.equal(chain.collateral,0n);
          }
          await expect(execute(page)).toBeEnabled();
          await expect(page.getByRole('link',{name:'View transaction'})).toHaveAttribute('href',`${chain.manifest.network.explorer}/tx/${chain.replacement!.hash}`);
        }finally{await context.close();}
      }
    });
    await check('read failure disables writes until live state recovers',async()=>{
      const {context,page,chain}=await setup({prepare:c=>{c.allowance=parseEther('100');}});
      try{
        await connect(page);await amount(page,'10');await expect(execute(page)).toBeEnabled();
        chain.failReads=true;await page.getByRole('button',{name:/refresh/i}).click();
        await expect(execute(page)).toBeDisabled();
        await expect(page.getByText('Live balances could not be refreshed. Transactions are paused. Check your connection and retry.')).toBeVisible();
        chain.failReads=false;await page.getByRole('button',{name:/refresh/i}).click();
        await expect(execute(page)).toBeEnabled();assert.equal(chain.sends.length,0);
      }finally{await context.close();}
    });
    await check('late older reads cannot overwrite a newly confirmed position',async()=>{
      const {context,page,chain}=await setup({prepare:c=>{c.allowance=parseEther('100');c.collateral=parseEther('300');}});
      try{
        await connect(page);chain.holdNextPosition=true;
        await page.getByRole('button',{name:'Refresh balances',exact:true}).click();
        await expect.poll(()=>!!chain.releasePosition).toBe(true);
        await amount(page,'10');await submit(page);
        await expect(page.getByTestId('position-collateral')).toHaveText(/310/);
        chain.releasePosition!();
        await page.waitForTimeout(250);
        await expect(page.getByTestId('position-collateral')).toHaveText(/310/);
        assert.equal(chain.collateral,parseEther('310'));
      }finally{chain.releasePosition?.();await context.close();}
    });
    await check('missing deployed code prevents transaction eligibility',async()=>{
      const {context,page,chain}=await setup({prepare:c=>{c.emptyCode=true;}});
      try{
        await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();
        await expect(execute(page)).toBeDisabled();
        await expect(page.getByText(/verification|verify|deployment/i).first()).toBeVisible();assert.equal(chain.sends.length,0);
      }finally{await context.close();}
    });
    await check('tampered runtime ABI blocks verification and all signing',async()=>{
      const {context,page,chain}=await setup({tamperAbi:true});
      try{
        await page.getByRole('button',{name:'Connect wallet',exact:true}).first().click();
        await expect(page.getByRole('alert').filter({hasText:'Deployment verification is unavailable'})).toBeVisible();
        await expect(execute(page)).toBeDisabled();
        assert.equal(chain.sends.length,0);assert.equal(chain.methods.includes('eth_getCode'),false);
      }finally{await context.close();}
    });
    await check('exact balance disclosure retains one-wei precision and large values reflow at 320px',async()=>{
      const value='123456789012345678901234567890.123456789012345678';
      const {context,page}=await setup({prepare:c=>{c.imd=parseEther(value);c.comp=1n;c.collateral=parseEther(value);c.debt=1n;}});
      try{
        await page.setViewportSize({width:320,height:844});await connect(page);
        await page.getByText('View exact balances',{exact:true}).click();
        await expect(page.locator('.exact-balances')).toContainText(`${value} IMD`);
        await expect(page.locator('.exact-balances')).toContainText('0.000000000000000001 COMP');
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
        assert.equal(overflow,false);
      }finally{await context.close();}
    });
    await check('responsive export, accessibility, keyboard focus and media preferences',async()=>{
      const {context,page,errors}=await setup({prepare:c=>{c.collateral=parseEther('300');c.debt=parseEther('100');c.comp=parseEther('100');c.rights=parseEther('400');}});
      try{
        await connect(page);
        await mkdir(join(ROOT,'web/tests/evidence'),{recursive:true});
        for(const width of [320,390,768,1440]){
          await page.setViewportSize({width,height:width<500?844:1000});
          const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
          assert.ok(overflow.scroll<=overflow.client,`${width}px horizontal overflow: ${JSON.stringify(overflow)}`);
          report.viewports.push({width,height:width<500?844:1000,horizontalOverflow:false});
          if(width===390 || width===1440){
            const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
            report.accessibility.push({width,violations:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),passes:axe.passes.length,incomplete:axe.incomplete.map(i=>i.id)});
            assert.equal(axe.violations.length,0,JSON.stringify(axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));
            const path=`web/tests/evidence/${width===390?'mobile':'desktop'}.png`;
            await page.screenshot({path:join(ROOT,path),fullPage:true});report.screenshots.push(path);
          }
        }
        report.controlContrast=[];
        for(const selector of ['.amount-field','.action-selector button[aria-pressed=false]']){
          const colors=await page.locator(selector).first().evaluate(el=>{
            const style=getComputedStyle(el);let ancestor:Element|null=el;let background='';
            while(ancestor){background=getComputedStyle(ancestor).backgroundColor;if(background!=='rgba(0, 0, 0, 0)' && background!=='transparent')break;ancestor=ancestor.parentElement;}
            return {border:style.borderTopColor,background};
          });
          const luminance=(color:string)=>{const channels=color.match(/[0-9.]+/g)!.slice(0,3).map(Number).map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
          const a=luminance(colors.border),b=luminance(colors.background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
          report.controlContrast.push({selector,...colors,ratio:Number(ratio.toFixed(2))});
          assert.ok(ratio>=3,`${selector} boundary contrast ${ratio.toFixed(2)} is below 3:1`);
        }
        await page.reload();await page.keyboard.press('Tab');
        const focus=await page.evaluate(()=>{const el=document.activeElement as HTMLElement;const s=getComputedStyle(el);return {tag:el.tagName,text:el.textContent,outline:s.outlineStyle,width:s.outlineWidth};});
        assert.notEqual(focus.tag,'BODY');assert.notEqual(focus.outline,'none');report.keyboard=focus;
        await page.keyboard.press('Enter');
        await page.emulateMedia({reducedMotion:'reduce'});
        report.reducedMotion=await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
        await page.emulateMedia({forcedColors:'active'});
        report.forcedColors=await page.evaluate(()=>matchMedia('(forced-colors: active)').matches);
        await expect(page.getByRole('button',{name:'Connect wallet',exact:true}).first()).toBeVisible();
        assert.deepEqual(errors,[]);report.errors=errors;
      }finally{await context.close();}
    });
  }finally{
    report.summary={passed:report.tests.filter((r:any)=>r.status==='passed').length,failed:report.tests.filter((r:any)=>r.status==='failed').length};
    await mkdir(join(ROOT,'docs/evidence'),{recursive:true});
    await writeFile(join(ROOT,'docs/evidence/interaction-results.json'),`${JSON.stringify(report,null,2)}\n`);
    await browser.close();await server.close();
  }
});
