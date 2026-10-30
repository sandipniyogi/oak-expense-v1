import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import {pagination} from '../src/expense-pagination.mjs';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');const handler=source.slice(source.indexOf("app.get('/expenses',"),source.indexOf('// Update a saved expense'));
const id='00000000-0000-4000-8000-000000000001';
test('review locates an older expense on correct saved page',async()=>{
 let fn,body;const calls=[];const pool={query:async(sql,params)=>{calls.push({sql,params});return sql.includes('select position')?{rows:[{position:126}]}:sql.includes('count(*)')?{rows:[{total:126}]}:{rows:[{id}]};}};
 vm.runInNewContext(handler,{pagination,pool,app:{get:(_,f)=>fn=f}});await fn({query:{page:'1',page_size:'25',focus_id:id}},{json:x=>body=x,status(){return this;}});
 assert.equal(body.page,6);assert.equal(body.rows[0].id,id);assert.deepEqual(Array.from(calls[1].params),[25,125]);assert.deepEqual(Array.from(calls[0].params),[id]);
});
test('missing expense is reported without loading unrelated records',async()=>{
 let fn,code,body;vm.runInNewContext(handler,{pagination,pool:{query:async()=>({rows:[]})},app:{get:(_,f)=>fn=f}});await fn({query:{page:'1',focus_id:id}},{json:x=>body=x,status:n=>{code=n;return {json:x=>body=x};}});assert.equal(code,404);assert.match(body.error,/no longer/);
});
