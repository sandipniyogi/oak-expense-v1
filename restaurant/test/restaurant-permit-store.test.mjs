import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import http from 'node:http';import {once} from 'node:events';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {installBarrier,controller} from '../scripts/sqlite-write-barrier.mjs';import {permitStore} from '../scripts/restaurant-permit-store.mjs';
import {FencedCoordinator} from '../scripts/strict-sync-runtime/fenced-coordinator.mjs';import {createServer} from '../scripts/strict-sync-runtime/server.mjs';import {gateMiddleware} from '../scripts/strict-sync-runtime/guard.mjs';import {operationContext} from '../scripts/strict-sync-runtime/transaction-context.mjs';
const png=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'oak-restaurant-permit-'));const db=new DatabaseSync(path.join(root,'test.sqlite'));db.exec("PRAGMA journal_mode=WAL;CREATE TABLE test_menu(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO test_menu VALUES(1,'original');CREATE TABLE test_upload_receipts(id TEXT PRIMARY KEY,name TEXT,hash TEXT)");installBarrier(db,['test_menu','test_upload_receipts']);return {root,db,control:controller(db),close(){db.close();fs.rmSync(root,{recursive:true,force:true})}}}
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port}
async function close(server){await new Promise(r=>{server.close(r);server.closeAllConnections()})}
async function settled(c){for(let i=0;i<200&&c.state.active;i++)await new Promise(r=>setTimeout(r,10));assert.equal(c.state.active,null)}
test('actual coordinator and HTTP guard authorize a SQLite upload, then freeze',async()=>{
 const mac=fixture(),vps=fixture(),peers={mac,vps};let gate,app;const online={mac:true,vps:true};
 try{
  const pair={async freeze(){for(const f of Object.values(peers))f.control.freeze()},async begin(id,mode){const result={};for(const [peer,f]of Object.entries(peers)){const claim=f.control.begin(mode);f.db.prepare('UPDATE oak_test_fence SET operation=?').run(id);result[peer]={...claim,id,peer}}return result}};
  const provider={rehearsal:true,async inspect(nonce){return {nonce,approved:'a'.repeat(40),complete:true,...Object.fromEntries(Object.entries(peers).map(([peer,f])=>[peer,{online:online[peer],commit:'a'.repeat(40),digest:JSON.stringify(f.db.prepare('SELECT * FROM test_menu').all())}]))}},async sync(){/* Initial identical disposable fixtures only. No replication adapter. */}};
  const c=new FencedCoordinator({stateFile:path.join(mac.root,'coordinator.json'),provider,databases:pair});const tokens={mac:'m'.repeat(48),vps:'v'.repeat(48)};gate=createServer({coordinator:c,tokens});const gateURL=await listen(gate);
  const store=permitStore({db:mac.db,root:path.join(mac.root,'files'),peer:'mac'});const guard=gateMiddleware({env:{OAK_STRICT_SYNC:'1',OAK_STRICT_REHEARSAL:'1',OAK_STRICT_PEER:'mac',OAK_STRICT_GATE_URL:gateURL,OAK_STRICT_GATE_TOKEN:tokens.mac}});
  app=http.createServer(async(req,res)=>{req.path='/upload';res.status=n=>{res.statusCode=n;return res};res.json=x=>res.end(JSON.stringify(x));await guard(req,res,()=>{try{const saved=store.upload(operationContext.getStore(),png);res.json(saved)}catch{res.status(423).json({locked:true})}})});const appURL=await listen(app);
  assert.equal((await fetch(appURL,{method:'POST'})).status,423);await c.sync();online.vps=false;assert.equal((await fetch(appURL,{method:'POST'})).status,423);online.vps=true;await c.sync();
  const response=await fetch(appURL,{method:'POST'});assert.equal(response.status,200);const saved=await response.json();await settled(c);
  assert.deepEqual(fs.readFileSync(path.join(mac.root,'files/media',saved.name)),png);assert.equal(mac.db.prepare('SELECT count(*) AS n FROM test_upload_receipts').get().n,1);
  for(const f of Object.values(peers))assert.equal(f.db.prepare('SELECT frozen FROM oak_test_fence').get().frozen,1);
  assert.equal((await fetch(appURL,{method:'POST'})).status,423);console.log('PASS: HTTP/coordinator/SQLite/file receipt path; offline fixture blocks and completion relocks both');
 }finally{if(app)await close(app);if(gate)await close(gate);mac.close();vps.close()}
});
test('menu writes, rollback and wrong peer claims',()=>{const f=fixture();try{const store=permitStore({db:f.db,root:path.join(f.root,'files'),peer:'mac'});const claim={...f.control.begin(),peer:'mac'};assert.throws(()=>store.mutate({...claim,peer:'vps'},()=>{}),/Wrong/);store.mutate(claim,db=>db.prepare("UPDATE test_menu SET name='saved'").run());assert.throws(()=>store.mutate(claim,db=>{db.prepare("UPDATE test_menu SET name='bad'").run();throw Error('validation failure')}),/validation/);assert.equal(f.db.prepare('SELECT name FROM test_menu').get().name,'saved');f.control.freeze();assert.throws(()=>store.mutate(claim,db=>db.prepare('DELETE FROM test_menu').run()),/STRICT_SYNC/)}finally{f.close()}});
// Real child process exits without cleanup: SQLite rolls back its open transaction.
for(const point of ['intent','file','commit'])test('crash recovery at '+point,()=>{
 const f=fixture();try{
  const claim={...f.control.begin(),peer:'mac'};
  const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--crash-child',f.root,JSON.stringify(claim),point],{encoding:'utf8'});assert.equal(result.status,73,result.stderr);
  f.control.freeze();const store=permitStore({db:f.db,root:path.join(f.root,'files'),peer:'mac'});const report=store.recover();assert.equal(report.length,1);assert.equal(report[0].status,point==='commit'?'committed':point==='file'?'quarantined':'no-new-file');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM test_upload_receipts').get().n,point==='commit'?1:0);assert.equal(fs.readdirSync(path.join(f.root,'files/pending')).length,0);assert.deepEqual(store.recover(),[]);console.log('PASS: actual process crash at '+point+' recovered without unlocking or losing committed media');
 }finally{f.close()}
});
if(process.argv[2]==='--crash-child'){
 const root=process.argv[3],claim=JSON.parse(process.argv[4]),point=process.argv[5];const db=new DatabaseSync(path.join(root,'test.sqlite'));
 permitStore({db,root:path.join(root,'files'),peer:'mac',checkpoint:where=>{if(where===point)process.exit(73)}}).upload(claim,png);process.exit(74);
}
test('missing committed media retains recovery journal and blocks later writes',()=>{
 const f=fixture();try{const claim={...f.control.begin(),peer:'mac'};let saved;
 const store=permitStore({db:f.db,root:path.join(f.root,'files'),peer:'mac',checkpoint:point=>{if(point==='commit')throw Error('lost completion')}});
 assert.throws(()=>store.upload(claim,png),/lost completion/);saved=f.db.prepare('SELECT name FROM test_upload_receipts').get();fs.unlinkSync(path.join(f.root,'files/media',saved.name));f.control.freeze();
 assert.throws(()=>store.recover(),/manual repair/);assert.equal(fs.readdirSync(path.join(f.root,'files/pending')).length,1);const next={...f.control.begin(),peer:'mac'};assert.throws(()=>store.upload(next,png),/Recovery required/);
 }finally{f.close()}
});
