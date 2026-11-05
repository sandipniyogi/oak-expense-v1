import {test} from 'node:test';
import assert from 'node:assert/strict';
import {settlement,cents} from '../src/company-funds-model.mjs';
import {movementPreview,describeBalance} from '../../web/app/company-funds/balance.mjs';
const users=[{id:'a',name:'Test partner',role:'partner'}];
const expense={id:'e',amount:'3000',currency:'CNY',funding_source:'personal',day:'2026-11-01',user_id:'a',snapshot_user_id:'a',snapshot_cents:300000};
const summary=settlement({users,expenses:[expense],entries:[],month:'2026-11'});
const form={partner_id:'a',kind:'reimbursement',amount:'3500',occurred_on:'2026-11-02'};
test('payment preview shows both directions correctly when balance crosses zero',()=>{
 const p=movementPreview(summary,form);assert.equal(p.beforeAmounts.company_owes_cents,300000);assert.equal(p.afterAmounts.company_owes_cents,0);assert.equal(p.afterAmounts.individual_owes_cents,50000);
});
test('preview equals the authoritative report for every existing movement kind',()=>{
 for(const kind of Object.keys(summary.movement_balance_effects)){
  const f={...form,kind};const p=movementPreview(summary,f);
  const saved=settlement({users,expenses:[expense],entries:[{kind,amount_cents:cents(f.amount),occurred_on:f.occurred_on,partner_id:'a'}],month:'2026-11'}).partners[0];
  assert.equal(p.after,saved.closing_cents,kind);assert.equal(p.afterAmounts.company_owes_cents,saved.company_owes_cents,kind);assert.equal(p.afterAmounts.individual_owes_cents,saved.individual_owes_cents,kind);
 }
});
test('preview rejects invalid money, dates and stale/missing report rules',()=>{
 for(const amount of ['0','-1','1e3','1.001','','NaN'])assert.equal(movementPreview(summary,{...form,amount}),null);
 assert.equal(movementPreview(summary,{...form,occurred_on:'2026-02-30'}),null);
 assert.equal(movementPreview(summary,{...form,partner_id:'unknown'}),null);
 assert.equal(movementPreview({...summary,movement_balance_effects:undefined},form),null);
});
test('future movement explains why selected month will not change',()=>{
 assert.equal(movementPreview(summary,{...form,occurred_on:'2026-12-01'}).included,false);
});
test('prior-month payment preview matches carry-forward recalculation',()=>{
 const f={...form,occurred_on:'2026-10-31'};const p=movementPreview(summary,f);assert.equal(p.changesOpening,true);
 const saved=settlement({users,expenses:[expense],entries:[{kind:f.kind,amount_cents:cents(f.amount),occurred_on:f.occurred_on,partner_id:f.partner_id}],month:'2026-11'});assert.equal(p.after,saved.partners[0].closing_cents);
});
test('provisional review warning propagates to preview',()=>{
 assert.equal(movementPreview({...summary,provisional:true},form).provisional,true);
});
test('directional display stays nonnegative on either side and at zero',()=>{
 for(const n of [-1,0,1,-50000,300000]){const d=describeBalance(n);assert.ok(d.company_owes_cents>=0&&d.individual_owes_cents>=0);assert.equal(d.company_owes_cents-d.individual_owes_cents,n)}
});
