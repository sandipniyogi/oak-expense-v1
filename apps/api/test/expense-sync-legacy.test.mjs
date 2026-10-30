import test from 'node:test';import assert from 'node:assert/strict';
import {expenseTables,separateModuleTables,assertExpenseSyncScope} from '../src/expense-sync-scope.mjs';
const names=['inventory_shisha_bowls','inventory_shisha_bowl_items','inventory_products','inventory_stations','inventory_readings','inventory_recipes','inventory_recipe_items','inventory_sales','inventory_stock_movements','inventory_product_packs','inventory_purchase_receipts','inventory_purchase_lines'];
test('exact legacy tables are excluded while expense merge remains five tables',()=>{
 assert.equal(separateModuleTables.length,33);assert.equal(new Set(separateModuleTables).size,33);assert.equal(expenseTables.length,5);
 for(const name of names){assert.ok(separateModuleTables.includes(name));assert.ok(!expenseTables.includes(name));}
});
test('legacy compatibility retains unknown-table protection',async()=>{
 await assert.rejects(assertExpenseSyncScope({query:async()=>({rows:[{tablename:'inventory_unreviewed'}]})}),/inventory_unreviewed/);
});
test('legacy foreign key to synchronized expense tables still blocks',async()=>{
 let n=0;await assert.rejects(assertExpenseSyncScope({query:async()=>({rows:++n===1?[]:[{source_table:'inventory_sales',target_table:'expenses'}]})}),/excluded table boundary/);
});
test('scope policy is read-only and sends exact legacy names to the metadata query',async()=>{
 const calls=[];await assertExpenseSyncScope({query:async(sql,params)=>{calls.push({sql,params});return {rows:[]};}});
 assert.equal(calls.length,2);for(const name of names)assert.ok(calls[0].params[0].includes(name));
 for(const c of calls)assert.match(c.sql,/^\s*select/i);
});
