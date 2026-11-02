import test from 'node:test';
import assert from 'node:assert/strict';
import {expenseTables,legacyExpenseTables,extendedExpenseTables,companyFundTables,expenseKeys,activeExpenseTables,assertExpenseSyncScope} from '../src/expense-sync-scope.mjs';
const legacy=['users','categories','merchants','expenses','oak_phone_saves'];
const funds=['oak_company_fund_entries','oak_company_expense_funding'];
function metadata(names){return {async query(sql,values){assert.match(sql,/^SELECT tablename/);assert.deepEqual(values,[extendedExpenseTables]);return {rows:names.map(tablename=>({tablename}))};}};}
test('historical five-table export stays exact',()=>assert.deepEqual(expenseTables,legacy));
test('explicit legacy export stays exact',()=>assert.deepEqual(legacyExpenseTables,legacy));
test('extended scope adds exactly the two reviewed company tables',()=>assert.deepEqual(extendedExpenseTables,[...legacy,...funds]));
test('company tables are explicit rather than a wildcard',()=>assert.deepEqual(companyFundTables,funds));
test('funding reviews use expense_id; all other keys use id',()=>{
 assert.equal(expenseKeys.oak_company_expense_funding,'expense_id');
 for(const t of extendedExpenseTables.filter(t=>t!=='oak_company_expense_funding'))assert.equal(expenseKeys[t],'id');
 assert.equal(Object.isFrozen(expenseKeys),true);
});
test('without migration the actual selected scope remains five tables',async()=>assert.deepEqual(await activeExpenseTables(metadata(legacy)),legacy));
test('with both new tables the actual selected scope is seven tables',async()=>assert.deepEqual(await activeExpenseTables(metadata([...legacy,...funds])),[...legacy,...funds]));
for(const one of funds)test('a partial migration containing only '+one+' is refused',async()=>assert.rejects(()=>activeExpenseTables(metadata([...legacy,one])),/Incomplete company-funds migration/));
test('missing required expense tables are refused',async()=>assert.rejects(()=>activeExpenseTables(metadata(legacy.slice(1))),/Required expense tables missing/));
test('schema policy includes extended tables and stays read-only',async()=>{
 let calls=0;
 await assertExpenseSyncScope({async query(sql,values){calls++;assert.match(sql,/^select/i);assert.doesNotMatch(sql,/\b(insert|update|delete|alter|create|drop)\b/i);assert.ok(funds.every(t=>values[0].includes(t)));return {rows:[]};}});
 assert.equal(calls,2);
});
test('unknown table protection is preserved',async()=>assert.rejects(()=>assertExpenseSyncScope({async query(){return {rows:[{tablename:'unexpected_payments'}]};}}),/Untracked database tables/));
test('cross-boundary foreign keys are still refused for company funds',async()=>{
 let calls=0;
 await assert.rejects(()=>assertExpenseSyncScope({async query(sql,values){calls++;assert.ok(values[0].includes(funds[0]));return {rows:calls===1?[]:[{source_table:'outside',target_table:funds[0]}]};}}),/crosses an excluded table boundary/);
});
