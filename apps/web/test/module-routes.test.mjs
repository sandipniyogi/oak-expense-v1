import test from 'node:test';import assert from 'node:assert/strict';import config from '../next.config.mjs';import fs from 'node:fs';
test('all modules have distinct same-origin routes to fixed Docker services',async()=>{
 const routes=(await config.rewrites()).beforeFiles;assert.equal(routes.length,4);assert.equal(new Set(routes.map(r=>r.source)).size,4);
 assert.ok(routes.some(r=>r.source==='/module-api/keg/:path*'&&r.destination==='http://keg-api:4200/:path*'));
 assert.ok(routes.some(r=>r.source==='/module-api/inventory/:path*'&&r.destination==='http://inventory-api:4200/:path*'));
 for(const r of routes)assert.doesNotMatch(r.destination,/localhost/);
});
test('browser module pages have no hardcoded local API addresses',()=>{
 const files=['kegs/page.js','inventory/page.js','inventory/admin/page.js','inventory/receive/page.js','inventory/operations/page.js','inventory/labels/page.js','inventory/labels/[id]/page.js','inventory/scan/page.js','social/_components/socialApi.js'];
 for(const file of files)assert.doesNotMatch(fs.readFileSync(new URL('../app/'+file,import.meta.url),'utf8'),/localhost:(4200|4300|4400|4401|4500)/,file);
});
