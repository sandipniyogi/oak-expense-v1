import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {pagination} from '../src/expense-pagination.mjs';
test('pagination is opt-in and rejects invalid or excessive requests',()=>{
 assert.equal(pagination({}),null);assert.deepEqual(pagination({page:'5',page_size:'25'}),{page:5,page_size:25});
 for(const q of [{page:'0'},{page:'1.5'},{page:'-1'},{page_size:'10000'},{page:'99999999'}])assert.throws(()=>pagination(q));
});
test('saved expense handler returns page beyond first 100 with deterministic order and full count',async()=>{
 const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const handler=source.slice(source.indexOf("app.get('/expenses',"),source.indexOf('// Update a saved expense'));
 let fn;const queries=[];
 const pool={query:async(sql,params)=>{queries.push({sql,params});return sql.includes('count(*)')?{rows:[{total:126}]}:{rows:[{id:'older'}]};}};
 vm.runInNewContext(handler,{pagination,pool,app:{get:(_path,f)=>{fn=f;}}});
 let body;const res={json:x=>{body=x;},status(){return this;}};
 await fn({query:{page:'5',page_size:'25'}},res);
 assert.equal(body.total,126);assert.equal(body.page,5);assert.equal(body.rows[0].id,'older');assert.deepEqual(Array.from(queries[0].params),[25,100]);assert.match(queries[0].sql,/e.id desc/);
 await fn({query:{}},res);assert.ok(Array.isArray(body));
});
