import test from 'node:test';
import assert from 'node:assert/strict';
import { maxUint256, parseEther } from 'viem';
import { actionError, health, limits, parseAmount, projected, type Snapshot } from '../src/model';
const snapshot=(values:Partial<Snapshot>={}):Snapshot=>({imd:parseEther('100'),comp:parseEther('10'),rights:parseEther('50'),allowance:0n,collateral:parseEther('30'),debt:parseEther('10'),ratio:300n,block:1n,updatedAt:0,...values});

test('exact amount parsing rejects invalid, zero, negative, scientific, excessive precision and uint overflow',()=>{
  for(const value of ['', '0', '0.0','-1','1e18','NaN','Infinity','1,000','1.0000000000000000001',String(maxUint256+1n)]) assert.equal(parseAmount(value,18),undefined,value);
  assert.equal(parseAmount('0.000000000000000001',18),1n);
  assert.equal(parseAmount(' .5 ',18),parseEther('0.5'));
  assert.equal(parseAmount(String(maxUint256),0),maxUint256);
});

test('CR health boundaries use exact bigint arithmetic',()=>{
  assert.deepEqual(health({collateral:0n,debt:0n}),{label:'No debt',tone:'healthy',ratio:'—'});
  assert.equal(health({collateral:170n,debt:100n}).tone,'healthy');
  assert.equal(health({collateral:169n,debt:100n}).tone,'caution');
  assert.equal(health({collateral:150n,debt:100n}).tone,'caution');
  assert.equal(health({collateral:149n,debt:100n}).tone,'danger');
});

test('mint and withdraw maxima honor 150% using one-wei rounding and consumed rights',()=>{
  assert.equal(limits(snapshot({collateral:5n,debt:0n,rights:99n})).mint,3n);
  assert.equal(limits(snapshot({collateral:5n,debt:3n})).withdraw,0n);
  assert.equal(limits(snapshot({collateral:6n,debt:3n})).withdraw,1n);
  assert.equal(limits(snapshot({rights:1n})).mint,1n);
  assert.equal(limits(snapshot({collateral:1n,debt:100n})).mint,0n);
  assert.equal(limits(snapshot({comp:1n})).repay,1n);
});

test('projected full loop and eligibility expose changed collateral/debt before signature',()=>{
  let position={collateral:0n,debt:0n};
  position=projected(position,'deposit',parseEther('300'));
  position=projected(position,'mint',parseEther('100'));
  assert.equal(health(position).ratio,'300%');
  position=projected(position,'repay',parseEther('100'));
  position=projected(position,'withdraw',parseEther('300'));
  assert.deepEqual(position,{collateral:0n,debt:0n});
  assert.match(actionError('mint',parseEther('51'),snapshot(),18)!,/minting rights/);
  assert.match(actionError('withdraw',parseEther('16'),snapshot(),18)!,/below 150%/);
  assert.match(actionError('repay',parseEther('11'),snapshot(),18)!,/exceeds/);
  assert.equal(actionError('mint',parseEther('10'),snapshot(),18),undefined);
});
