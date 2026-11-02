import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';import {once} from 'node:events';
import {createApp,hashPassword} from '../server.mjs';import {installBarrier,controller} from '../scripts/sqlite-write-barrier.mjs';import {permitStore} from '../scripts/restaurant-permit-store.mjs';
import {FencedCoordinator} from '../scripts/strict-sync-runtime/fenced-coordinator.mjs';import {createServer} from '../scripts/strict-sync-runtime/server.mjs';
const password='isolated-test-password',png=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port}
async function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'oak-actual-handler-'));const prior={...process.env};let app,gate,adminMac,adminVps,seed;
 try{
  delete process.env.OAK_STRICT_SYNC;const mac=path.join(root,'mac'),vps=path.join(root,'vps');fs.mkdirSync(vps);
  seed=createApp({origin:'',dataDir:mac,passwordHash:hashPassword(password),secure:false});
  seed.db.exec('CREATE TABLE test_upload_receipts(id TEXT PRIMARY KEY,name TEXT,hash TEXT)');installBarrier(seed.db,['test_upload_receipts']);
  for(const table of ['menu','events','settings'])for(const action of ['INSERT','UPDATE','DELETE']){
   const template=seed.db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").get('fence_test_upload_receipts_'+action).sql;
   seed.db.exec(template.replaceAll('test_upload_receipts',table));
  }
  await seed.close();seed=null;fs.copyFileSync(path.join(mac,'restaurant.sqlite'),path.join(vps,'restaurant.sqlite'));
  adminMac=new DatabaseSync(path.join(mac,'restaurant.sqlite'));adminVps=new DatabaseSync(path.join(vps,'restaurant.sqlite'));const peers={mac:adminMac,vps:adminVps},controls={mac:controller(adminMac),vps:controller(adminVps)};
  const pair={async freeze(){for(const c of Object.values(controls))c.freeze()},async begin(id,mode){const claims={};for(const [peer,c]of Object.entries(controls)){const claim=c.begin(mode);peers[peer].prepare('UPDATE oak_test_fence SET operation=?').run(id);claims[peer]={...claim,id,peer}}return claims}};
  const online={mac:true,vps:true};const snapshot=db=>JSON.stringify(['menu','events','settings','test_upload_receipts'].map(t=>db.prepare('SELECT * FROM '+t+' ORDER BY 1').all()));
  const provider={rehearsal:true,async sync(){/* Only initial identical fixtures. No replication. */},async inspect(nonce){return {nonce,approved:'a'.repeat(40),complete:true,...Object.fromEntries(Object.entries(peers).map(([peer,db])=>[peer,{online:online[peer],commit:'a'.repeat(40),digest:snapshot(db)}]))}}};
  const c=new FencedCoordinator({provider,databases:pair,stateFile:path.join(root,'coordinator.json')});gate=createServer({coordinator:c,tokens:{mac:'m'.repeat(48),vps:'v'.repeat(48)}});const gateURL=await listen(gate);
  Object.assign(process.env,{OAK_STRICT_SYNC:'1',OAK_STRICT_REHEARSAL:'1',OAK_STRICT_PEER:'mac',OAK_STRICT_GATE_URL:gateURL,OAK_STRICT_GATE_TOKEN:'m'.repeat(48)});
  app=createApp({origin:'',dataDir:mac,passwordHash:hashPassword(password),secure:false,environment:'strict-rehearsal',permitAdapterFactory:({db,dataDir})=>permitStore({db,root:dataDir,peer:'mac',mediaDirectory:'uploads'})});const url=await listen(app.server);
  const login=await fetch(url+'/api/admin/login',{method:'POST',headers:{Origin:url},body:JSON.stringify({username:'admin',password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0],{csrf}=await login.json();
  async function request(route,method='POST',body={},auth=true){const headers={Origin:url};if(auth)Object.assign(headers,{Cookie:cookie,'x-csrf-token':csrf});return fetch(url+route,{method,headers,body:Buffer.isBuffer(body)?body:JSON.stringify(body)})}
  async function done(){for(let i=0;i<200&&c.state.active;i++)await new Promise(r=>setTimeout(r,10));assert.equal(c.state.active,null);assert.equal(adminMac.prepare('SELECT frozen FROM oak_test_fence').get().frozen,1)}
  await fn({app,c,online,request,done,url,mac,adminMac});
 }finally{
  if(app)await app.close();if(seed)await seed.close();if(gate)await new Promise(r=>{gate.close(r);gate.closeAllConnections()});adminMac?.close();adminVps?.close();fs.rmSync(root,{recursive:true,force:true});
  for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior);
 }
}
test('actual menu save is atomic with audit and completion relocks',()=>fixture(async({app,c,request,done})=>{
 await c.sync();const response=await request('/api/admin/menu','POST',{category:'food',name:'Permit dish',price:'25.50'});assert.equal(response.status,201,await response.clone().text());const {id}=await response.json();await done();assert.equal(app.db.prepare('SELECT price_cents FROM menu WHERE id=?').get(id).price_cents,2550);assert.equal(app.db.prepare("SELECT count(*) AS n FROM audit WHERE record_id=?").get(id).n,1);assert.equal((await request('/api/admin/menu','POST',{category:'food',name:'Blocked'})).status,423);
}));
test('actual settings handler uses SQLite permit',()=>fixture(async({app,c,request,done})=>{await c.sync();assert.equal((await request('/api/admin/settings','PUT',{announcement:'Checked settings'})).status,200);await done();assert.equal(JSON.parse(app.db.prepare('SELECT data FROM settings').get().data).announcement,'Checked settings')}));
test('actual event handler uses SQLite permit',()=>fixture(async({app,c,request,done})=>{await c.sync();const response=await request('/api/admin/events','POST',{title:'Checked event',start_at:'2026-12-01T12:00:00Z'});assert.equal(response.status,201);await done();assert.ok(app.db.prepare("SELECT id FROM events WHERE title='Checked event'").get())}));
test('actual delete handler uses SQLite permit',()=>fixture(async({app,c,request,done})=>{const id=app.db.prepare('SELECT id FROM menu LIMIT 1').get().id;await c.sync();assert.equal((await request('/api/admin/menu/'+id,'DELETE')).status,200);await done();assert.equal(app.db.prepare('SELECT id FROM menu WHERE id=?').get(id),undefined)}));
test('actual upload handler commits file, receipt and audit',()=>fixture(async({app,c,request,done,url,mac})=>{await c.sync();const response=await request('/api/admin/upload','POST',png);assert.equal(response.status,201,await response.clone().text());const {url:media}=await response.json();await done();assert.deepEqual(Buffer.from(await(await fetch(url+media)).arrayBuffer()),png);assert.equal(app.db.prepare('SELECT count(*) AS n FROM test_upload_receipts').get().n,1);assert.equal(app.db.prepare("SELECT count(*) AS n FROM audit WHERE action='image.upload'").get().n,1);assert.equal(fs.readdirSync(path.join(mac,'pending')).length,0)}));
test('audit failure rolls back actual menu mutation',()=>fixture(async({app,c,request,done})=>{const before=app.db.prepare('SELECT count(*) AS n FROM menu').get().n;app.db.exec("CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit WHEN NEW.action='menu.save' BEGIN SELECT RAISE(ABORT,'test audit failure');END");await c.sync();assert.equal((await request('/api/admin/menu','POST',{category:'food',name:'Rolled back'})).status,400);await done();assert.equal(app.db.prepare('SELECT count(*) AS n FROM menu').get().n,before)}));
test('offline peer blocks actual handler before files change',()=>fixture(async({c,online,request,mac})=>{await c.sync();online.vps=false;assert.equal((await request('/api/admin/upload','POST',png)).status,423);assert.equal(fs.readdirSync(path.join(mac,'uploads')).length,0)}));
test('unauthenticated handler cannot save despite available permit',()=>fixture(async({app,c,request,done})=>{await c.sync();const before=app.db.prepare('SELECT count(*) AS n FROM menu').get().n;assert.equal((await request('/api/admin/menu','POST',{category:'food',name:'Denied'},false)).status,401);await done();assert.equal(app.db.prepare('SELECT count(*) AS n FROM menu').get().n,before)}));
test('adapter injection is refused outside explicit strict rehearsal',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'oak-injection-denied-'));try{assert.throws(()=>createApp({origin:'',dataDir:root,passwordHash:hashPassword(password),permitAdapterFactory:()=>({})}),/restricted to strict rehearsal/)}finally{fs.rmSync(root,{recursive:true,force:true})}});
