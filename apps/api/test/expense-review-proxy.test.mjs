import test from 'node:test';
import assert from 'node:assert/strict';
import {expenseReviewHandler} from '../src/expense-review-proxy.mjs';
const categories=[{id:'food',name:'Food & Garnish'}];
function res(){return {code:200,body:null,status(n){this.code=n;return this;},json(d){this.body=d;return this;}};}
test('AI is opt-in; disabled request never queries or contacts model',async()=>{
 const out=res();await expenseReviewHandler({pool:{query(){throw Error('must not query');}},env:{}})({},out);assert.equal(out.code,503);
});
test('uses server categories, minimizes submitted OCR and never writes database',async()=>{
 const queries=[];let sent;const out=res();
 await expenseReviewHandler({pool:{query:async(sql)=>{queries.push(sql);return {rows:categories};}},env:{OAK_EXPENSE_AI_ENABLED:'1'},request:async(url,options)=>{sent={url,body:JSON.parse(options.body)};return new Response(JSON.stringify({ok:true,category:{id:'food',name:'invented label'},warnings:[],model:'local',reason:'Ingredients'}));}})({body:{expense:{amount:'20',description:'Ingredients'},categories:[{id:'fake'}],ocr:{lines:['receipt'],image_path:'private',transaction_id:'private'}}},out);
 assert.equal(queries.length,1);assert.ok(queries.every(sql=>sql.startsWith('select ')));assert.deepEqual(sent.body.categories,categories);assert.equal(sent.body.ocr.image_path,undefined);assert.equal(sent.body.ocr.transaction_id,undefined);assert.equal(out.body.category.name,'Food & Garnish');assert.equal(out.body.human_confirmation_required,true);
});
test('unavailable AI gives generic manual fallback without internal details',async()=>{
 const out=res();await expenseReviewHandler({pool:{query:async()=>({rows:categories})},env:{OAK_EXPENSE_AI_ENABLED:'1'},request:async()=>{throw Error('internal credentials');}})({body:{}},out);
 assert.equal(out.code,503);assert.match(out.body.error,/manual review/);assert.ok(!out.body.error.includes('credentials'));
});
test('unknown category cannot escape proxy validation',async()=>{
 const out=res();await expenseReviewHandler({pool:{query:async()=>({rows:categories})},env:{OAK_EXPENSE_AI_ENABLED:'1'},request:async()=>new Response(JSON.stringify({ok:true,category:{id:'fake'},warnings:[]}))})({body:{}},out);assert.equal(out.body.category,null);
});
