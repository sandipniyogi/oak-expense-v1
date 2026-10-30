import test from 'node:test';import assert from 'node:assert/strict';
import {previousPeriod,spendingFindings,spendingReviewHandler} from '../src/spending-review.mjs';
const group=(total,currency='CNY')=>({category_id:'a',category:'Supplies',currency,total_amount:total});
const report=(groups,rows=[])=>({paid_by_category:groups,rows,filter:{},details_limited:false});
test('previous inclusive period crosses months and leap years accurately',()=>{
 assert.deepEqual(previousPeriod('2024-03-01','2024-03-02'),{from:'2024-02-28',to:'2024-02-29',days:2});
 for(const dates of [['',''],['2026-02-30','2026-03-01'],['2026-10-30','2026-10-01']])assert.throws(()=>previousPeriod(...dates));
});
test('category comparison uses exact decimals and separates currencies',()=>{
 const output=spendingFindings(report([group('0.10'),group('0.20'),group('5.00','USD')]),report([group('0.50')]));
 assert.equal(output.categories[0].current,'0.30');assert.equal(output.categories[0].change,'-0.20');assert.equal(output.categories[0].percent,-40);assert.equal(output.categories[1].percent,null);
});
test('quality flags link saved IDs and duplicates are only potential mistakes',()=>{
 const row={id:'one',amount:'5.00',expense_date:'2026-10-01',merchant:'Store',paid_by:'A',currency:'CNY'};
 const output=spendingFindings({...report([], [row,{...row,id:'two'}]),details_limited:true},report([]));
 assert.equal(output.flags.length,2);assert.ok(output.flags[0].reasons.some(x=>x.includes('purpose')));assert.ok(output.flags[1].reasons.some(x=>x.includes('Possible repeated')));assert.equal(output.details_limited,true);
});
test('handler calculates both periods server-side, preserves filters, and degrades if AI fails',async()=>{
 const calls=[];const handler=spendingReviewHandler({getReport:async q=>{calls.push(q);return report([group('3.00')]);},env:{OAK_EXPENSE_AI_ENABLED:'1'},request:async()=>{throw Error('secret internal detail');}});
 let output;await handler({body:{from:'2026-10-01',to:'2026-10-03',user_id:'payer',amount:'3.00',categories:['forged']}},{json:d=>output=d,status(){return this;}});
 assert.equal(calls.length,2);assert.equal(calls[1].from,'2026-09-28');assert.equal(calls[1].user_id,'payer');assert.equal(calls[1].amount,'3.00');assert.equal(calls[0].categories,undefined);assert.equal(output.ok,true);assert.equal(output.ai,null);assert.doesNotMatch(output.ai_status,/secret/);
});
