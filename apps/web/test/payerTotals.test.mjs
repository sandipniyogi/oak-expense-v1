import test from 'node:test';import assert from 'node:assert/strict';import {payerTotals} from '../app/payerTotals.mjs';
test('payer totals sum category decimals exactly and keep identities/currencies separate',()=>{
 const g=(user,currency,total)=>({user_id:user,paid_by:'Same name',currency,total_amount:total,transaction_count:1});
 const totals=payerTotals([g('a','CNY','0.10'),g('a','CNY','0.20'),g('b','CNY','10.00'),g('a','USD','5.00')]);
 assert.equal(totals.length,3);assert.equal(totals[0].total_amount,'0.30');assert.equal(totals[0].count,2);assert.deepEqual(payerTotals([]),[]);
});
