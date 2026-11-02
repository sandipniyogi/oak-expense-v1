import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createApp,hashPassword} from '../server.mjs';
test('strict restaurant permits browsing/login, blocks direct content writes and startup seeding',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oak-restaurant-strict-'));const previous=process.env.OAK_STRICT_SYNC;
 let app;
 try{
  delete process.env.OAK_STRICT_SYNC;
  app=createApp({dataDir:dir,passwordHash:hashPassword('staging-test-password'),secure:false});
  const before=app.db.prepare('SELECT * FROM menu ORDER BY id').all();
  await app.close();app=null;
  process.env.OAK_STRICT_SYNC='1';
  app=createApp({dataDir:dir,passwordHash:hashPassword('staging-test-password'),secure:false,menuCatalog:true});
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');const url='http://127.0.0.1:'+app.server.address().port;
  assert.deepEqual(app.db.prepare('SELECT * FROM menu ORDER BY id').all(),before);
  assert.equal((await fetch(url+'/api/content')).status,200);
  assert.equal((await fetch(url+'/strict-sync/status')).status,503);
  assert.equal((await fetch(url+'/api/admin/menu',{method:'POST',body:'{}'})).status,423);
  const response=await fetch(url+'/api/admin/login',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'staging-test-password'})});
  assert.equal(response.status,200);
  assert.deepEqual(app.db.prepare('SELECT * FROM menu ORDER BY id').all(),before);
 }finally{
  if(app)await app.close();if(previous===undefined)delete process.env.OAK_STRICT_SYNC;else process.env.OAK_STRICT_SYNC=previous;fs.rmSync(dir,{recursive:true,force:true});
 }
});
