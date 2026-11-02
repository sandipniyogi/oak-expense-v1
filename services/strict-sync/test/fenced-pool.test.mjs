import test from 'node:test';
import assert from 'node:assert/strict';
import {fencedPool,fencedClient} from '../src/fenced-pool.mjs';
import {withOperation,closeOperation} from '../src/transaction-context.mjs';
const makeClaim=()=>({id:'01234567-1234-1234-1234-012345678901',peer:'mac',mode:'application',generation:'7'});
function fake(){const events=[];let releases=0;const client={async query(text,values){events.push([text,values]);if(text==='FAIL')throw Error('query failed');return {rows:[{ok:true}]}},release(){releases++}};return {events,client,get releases(){return releases},pool:{async connect(){return client}}};}
const settle=()=>new Promise(r=>setImmediate(r));
test('without operation, a pool query runs in a read-only transaction',async()=>{const f=fake();await fencedPool(f.pool,{peer:'mac'}).query('SELECT 1');await settle();assert.deepEqual(f.events.map(x=>x[0]),['BEGIN','SET TRANSACTION READ ONLY','SELECT 1','COMMIT']);assert.equal(f.releases,1)});
test('operation context is installed locally on the same connection',async()=>{const f=fake(),claim=makeClaim();await withOperation(claim,()=>fencedPool(f.pool,{peer:'mac'}).query('UPDATE expenses SET amount=$1',[12]));assert.deepEqual(f.events[1][1],[claim.id,'7','application']);assert.equal(f.events.at(-1)[0],'COMMIT')});
test('error rolls back before releasing connection',async()=>{const f=fake();await assert.rejects(fencedPool(f.pool,{peer:'mac'}).query('FAIL'));await settle();assert.equal(f.events.at(-1)[0],'ROLLBACK');assert.equal(f.releases,1)});
test('manual transactions keep the same claim until COMMIT',async()=>{const f=fake();await withOperation(makeClaim(),async()=>{const c=await fencedPool(f.pool,{peer:'mac'}).connect();await c.query('BEGIN');await c.query('UPDATE x SET y=1');await c.query('COMMIT');c.release()});await settle();assert.equal(f.events.filter(e=>e[0].startsWith('SELECT set_config')).length,1);assert.equal(f.releases,1)});
test('release of an unfinished transaction rolls back first',async()=>{const f=fake(),c=fencedClient(f.client,null);await c.query('BEGIN');c.release();await settle();assert.equal(f.events.at(-1)[0],'ROLLBACK');assert.equal(f.releases,1)});
test('late async queries cannot use a closed request context',async()=>{const f=fake(),claim=makeClaim();await withOperation(claim,async()=>{closeOperation(claim);await assert.rejects(fencedPool(f.pool,{peer:'mac'}).query('UPDATE x SET y=1'),/closed/)});assert.equal(f.events.length,0)});
test('multiple statements and session escape commands fail closed',async()=>{for(const sql of ['SELECT 1; DELETE FROM x','SET TRANSACTION READ WRITE','/* nested /* c */ c */ COMMIT','PREPARE TRANSACTION \'x\'']){const f=fake();await assert.rejects(fencedPool(f.pool,{peer:'mac'}).query(sql));assert.equal(f.events.length,0)}});
test('rollback remains possible after request closes',async()=>{const f=fake(),claim=makeClaim(),c=fencedClient(f.client,claim);await c.query('BEGIN');closeOperation(claim);await c.query('ROLLBACK');c.release();await settle();assert.equal(f.events.at(-1)[0],'ROLLBACK')});
test('callbacks are rejected instead of bypassing the wrapper',async()=>{const f=fake();await assert.rejects(fencedPool(f.pool,{peer:'mac'}).query('SELECT 1',()=>{}),/Promise/);assert.equal(f.events.length,0)});
test('disabled mode returns the original pool',()=>{const f=fake();assert.equal(fencedPool(f.pool,{enabled:false}),f.pool)});

test('a permit cannot be used with a pool bound to the other peer',async()=>{const f=fake();await withOperation(makeClaim(),()=>assert.rejects(fencedPool(f.pool,{peer:'vps'}).query('UPDATE x SET y=1'),/peer binding/));assert.equal(f.events.length,0)});
