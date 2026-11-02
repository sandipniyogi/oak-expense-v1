// Invoked ONLY inside the staging API container against two disposable databases.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {once} from 'node:events';
import {fencedPool} from '../src/fenced-pool.mjs';
import {PostgresPair} from '../src/postgres-pair.mjs';
import {FencedCoordinator} from '../src/fenced-coordinator.mjs';
import {createServer} from '../src/server.mjs';
import {gateMiddleware} from '../src/guard.mjs';
const require=createRequire('/app/package.json');const {Pool}=require('pg');
const ids={mac:process.env.OAK_TEST_DB_MAC,vps:process.env.OAK_TEST_DB_VPS};
for(const name of Object.values(ids))if(!/^oak_pair_test_[a-f0-9]{16}_(mac|vps)$/.test(name||''))throw Error('Disposable test database name required');
const pools={},apps={},servers=[];let lastPeer='mac';const online={mac:true,vps:true};const commits={mac:'a'.repeat(40),vps:'a'.repeat(40)};
const base=new URL(process.env.DATABASE_URL);if(!['db','oak-expense-staging-db-1'].includes(base.hostname)||base.protocol!=='postgresql:'&&base.protocol!=='postgres:')throw Error('Expected staging database DNS; stopped');
function connection(name){const u=new URL(base);u.pathname='/'+name;return u.toString()}
async function listen(server){servers.push(server);server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port}
async function wait(fn){const end=Date.now()+20000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,10))}throw Error('Timed out waiting for the coordinated write to finish')}
async function main(){
 for(const peer of ['mac','vps']){pools[peer]=new Pool({connectionString:connection(ids[peer]),max:3,connectionTimeoutMillis:3000});apps[peer]=fencedPool(new Pool({connectionString:connection(ids[peer]),max:3,connectionTimeoutMillis:3000}),{peer});}
 const pair=new PostgresPair(pools);
 await pools.mac.query('SELECT oak_guard.freeze()'); // exercise unequal peer generations
 const snapshots=async()=>Object.fromEntries(await Promise.all(['mac','vps'].map(async peer=>[peer,(await pools[peer].query('SELECT id,amount::text AS amount FROM expenses ORDER BY id')).rows])));
 const provider={rehearsal:true,async inspect(nonce){const s=await snapshots();return {nonce,approved:'a'.repeat(40),complete:true,mac:{online:online.mac,commit:commits.mac,digest:JSON.stringify(s.mac)},vps:{online:online.vps,commit:commits.vps,digest:JSON.stringify(s.vps)}}},async sync(claims){
  // Synthetic fixture replication ONLY, not a production reconciliation adapter.
  const other=lastPeer==='mac'?'vps':'mac';const source=(await snapshots())[lastPeer];
  const {withOperation}=await import('../src/transaction-context.mjs');
  await withOperation(claims[other],()=>apps[other].query('UPDATE expenses SET amount=$1 WHERE id=$2',[source[0].amount,source[0].id]));
 }};
 const c=new FencedCoordinator({stateFile:path.join(path.dirname(new URL(import.meta.url).pathname),'state.json'),provider,databases:pair});
 const tokens={mac:'m'.repeat(48),vps:'v'.repeat(48)};const gate=await listen(createServer({coordinator:c,tokens}));
 const urls={};
 for(const peer of ['mac','vps']){
  const guard=gateMiddleware({env:{OAK_STRICT_SYNC:'1',OAK_STRICT_REHEARSAL:'1',OAK_STRICT_PEER:peer,OAK_STRICT_GATE_URL:gate,OAK_STRICT_GATE_TOKEN:tokens[peer]}});
  urls[peer]=await listen(http.createServer(async(req,res)=>{
   req.path=new URL(req.url,'http://test').pathname;res.status=n=>{res.statusCode=n;return res};res.json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));return res};
   try{await guard(req,res,async()=>{
    if(req.method==='GET')return res.json((await apps[peer].query('SELECT id,amount FROM expenses')).rows);
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());
    await apps[peer].query('UPDATE expenses SET amount=$1 WHERE id=1',[body.amount]);lastPeer=peer;res.json({saved:true});
   })}catch{if(!res.headersSent)res.status(500).json({error:'Test operation failed'})}
  }));
 }
 const post=(peer,amount)=>fetch(urls[peer]+'/expenses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount})});
 assert.equal((await post('mac',11)).status,423);console.log('PASS: HTTP writes start locked');
 await c.sync();
 assert.equal((await post('mac',15)).status,200);await wait(()=>!c.state.active);
 assert.equal((await post('vps',16)).status,423);console.log('PASS: actual HTTP permit writes through the fenced pool, then relocks both peers');
 const before=await snapshots();assert.notDeepEqual(before.mac,before.vps);
 await c.sync();const after=await snapshots();assert.deepEqual(after.mac,after.vps);assert.equal(after.vps[0].amount,'15');console.log('PASS: synthetic update is replicated using a separate synchronization permit and reverified');
 assert.equal((await post('vps',17)).status,200);await wait(()=>!c.state.active);await c.sync();assert.deepEqual((await snapshots()).mac,(await snapshots()).vps);console.log('PASS: reverse-direction write uses the correct peer epoch and replicates');
 await assert.rejects(apps.mac.query('UPDATE expenses SET amount=99'),/read-only|STRICT_SYNC/);console.log('PASS: application code without a request permit cannot write');
 await assert.rejects(pools.vps.query('UPDATE expenses SET amount=99'),/STRICT_SYNC_WRITE_LOCKED/);console.log('PASS: direct SQL without a permit is blocked by the database too');
 online.vps=false;assert.equal((await post('mac',99)).status,423);const frozen=(await pools.mac.query('SELECT frozen FROM oak_guard.state WHERE id=1')).rows[0].frozen;assert.equal(frozen,true);console.log('PASS: peer-offline fixture blocks the next write and leaves application writes frozen');
 online.vps=true;await c.sync();commits.vps='b'.repeat(40);assert.equal((await post('mac',99)).status,423);console.log('PASS: approval mismatch fixture cannot authorize a write');
 commits.vps='a'.repeat(40);await c.sync();
 await pools.vps.end();assert.equal((await post('mac',99)).status,423);console.log('PASS: an unavailable administrative peer connection cannot produce a paired permit');
 console.log('PASS: combined HTTP/coordinator/pool/PostgreSQL test completed in disposable databases. No production synchronization was enabled.');
}
try{await main()}catch(e){console.error('Test failed:',e.message);process.exitCode=1}finally{
 for(const server of servers)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});
 for(const peer of ['mac','vps']){try{await apps[peer]?.end()}catch{}try{if(!pools[peer]?.ended)await pools[peer]?.end()}catch{}}
}
