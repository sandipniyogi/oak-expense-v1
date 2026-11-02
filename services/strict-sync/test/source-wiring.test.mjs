import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../..');
test('every Express service installs the server guard before routes',()=>{for(const f of ['apps/api','services/inventory-api','services/keg-api','services/social-api','services/oak-ai']){const s=fs.readFileSync(path.join(root,f,'src/index.js'),'utf8');assert.ok(s.indexOf('app.use(gateMiddleware());')>0);assert.ok(s.indexOf('app.use(gateMiddleware());')<s.search(/app\.(post|get|put|patch|delete)\(/))}});
test('CLI bridge mutations cannot bypass strict staging mode',()=>{const s=fs.readFileSync(path.join(root,'apps/api/src/automation-bridge.mjs'),'utf8');assert.match(s,/OAK_STRICT_SYNC==='1'&&\['init','apply','file_put'\]/)});
test('social startup and timer writes are disabled in strict mode',()=>{const s=fs.readFileSync(path.join(root,'services/social-api/src/index.js'),'utf8');assert.ok(s.includes('if(!strictEnabled())await initDb();'));assert.ok(s.includes('async function agentTick() {\n  if(strictEnabled())return;'))});
