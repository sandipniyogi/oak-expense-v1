import test from 'node:test';import assert from 'node:assert/strict';import {expenseTables,separateModuleTables,assertExpenseSyncScope} from '../src/expense-sync-scope.mjs';
test('exact module allowlist preserves the five-table merge contract',async()=>{
 const calls=[];await assertExpenseSyncScope({query:async(sql,params)=>{calls.push({sql,params});return {rows:[]};}});
 assert.deepEqual(expenseTables,['users','categories','merchants','expenses','oak_phone_saves']);assert.equal(separateModuleTables.length,33);
 assert.ok(calls[0].params[0].includes('keg_readings'));assert.ok(!expenseTables.includes('keg_readings'));
 assert.ok(calls.every(c=>!/^\s*(insert|update|delete|alter|drop)/i.test(c.sql)));assert.deepEqual(calls[1].params[0],expenseTables);
});
test('unknown table blocks rather than silently excluding it',async()=>{
 await assert.rejects(assertExpenseSyncScope({query:async()=>({rows:[{tablename:'unexpected'}]})}),/Untracked.*unexpected/);
});
test('cross-boundary foreign keys block sync in either direction',async()=>{
 for(const relation of [{source_table:'keg_readings',target_table:'expenses'},{source_table:'expenses',target_table:'oak_inv_products'}]){
  let i=0;await assert.rejects(assertExpenseSyncScope({query:async()=>({rows:++i===1?[]:[relation]})}),/excluded table boundary/);
 }
});
