const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),assert=require('assert/strict'),os=require('os'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'index.js'),'utf8');let route;
const saves=new Map(),expenses=new Map();let inserts=0,merchantCalls=0;
const client={query:async(sql,p=[])=>{
 if(sql.includes('SELECT * FROM oak_phone_saves'))return {rows:saves.has(p[0])?[saves.get(p[0])]:[]};
 if(sql.includes('SELECT * FROM expenses WHERE'))return {rows:expenses.has(p[0])?[expenses.get(p[0])]:[]};
 if(sql.includes('insert into expenses(')){inserts++;const row={id:'expense-'+inserts,amount:p[3]};expenses.set(row.id,row);return {rows:[row]};}
 if(sql.includes('INSERT INTO oak_phone_saves'))saves.set(p[0],{request_hash:p[1],expense_id:p[2]});return {rows:[]};
 },release(){}};
const context={app:{post:(p,f)=>route=f},crypto,process:{env:{OAK_SYNC_ENABLED:'1'}},pool:{connect:async()=>client},findOrCreateMerchantId:async()=>{merchantCalls++;return 'merchant'}};
vm.runInNewContext(source.slice(source.indexOf("app.post('/expenses',"),source.indexOf('// Combine reviewed payment images')),context);
async function save(key,amount=25){const req={body:{user_id:'payer',amount,merchant:'Shop'},get:()=>key};let code=200,body;const res={status(n){code=n;return this},json(v){body=v;return this}};await route(req,res);return {code,body};}
(async()=>{assert.equal((await save('receipt-1')).code,201);assert.equal((await save('receipt-1')).code,200);assert.equal(inserts,1);assert.equal(merchantCalls,1);assert.equal((await save('receipt-1',26)).code,409);expenses.clear();assert.equal((await save('receipt-1')).code,410);assert.equal((await save('bad token!')).code,400);context.process.env.OAK_SYNC_ENABLED='0';assert.equal((await save('receipt-2')).code,503);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'oak-retain-'));fs.writeFileSync(path.join(temp,'receipt'),'image');const ctx={process:{env:{OAK_SYNC_ENABLED:'1'}},path,fs,uploadDir:temp,pool:{query:async()=>({rows:[{count:0}]})},console};vm.runInNewContext(source.slice(source.indexOf('async function removeStoredImageIfUnused'),source.indexOf('function assertStoredAttachment')),ctx);await ctx.removeStoredImageIfUnused('receipt');assert.ok(fs.existsSync(path.join(temp,'receipt')));ctx.process.env.OAK_SYNC_ENABLED='0';await ctx.removeStoredImageIfUnused('receipt');assert.ok(!fs.existsSync(path.join(temp,'receipt')));fs.rmSync(temp,{recursive:true});
console.log('PASS: retry returns same expense, changed payload rejected, deleted receipt not recreated, invalid token rejected, disabled-mode safety, sync attachment retention.');})().catch(e=>{console.error(e);process.exitCode=1});
