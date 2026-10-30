// Not an HTTP endpoint. Invoked inside the API container over restricted SSH.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {expenseTables,assertExpenseSyncScope} from './expense-sync-scope.mjs';
const tables=expenseTables;
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
const root=path.resolve(process.env.UPLOAD_DIR||'/app/uploads');
function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v);}
function sha(v){return crypto.createHash('sha256').update(v).digest('hex');}
function safe(name){if(typeof name!=='string'||!name||name.length>255||name!==path.basename(name)||name==='.'||name==='..'||name.includes('\\')||name.includes('\0'))throw Error('Invalid attachment name');return path.join(root,name);}
function refs(rows){const names=new Set();for(const row of Object.values(rows.expenses||{})){if(!row)continue;if(row.image_path)names.add(row.image_path);for(const p of row.ocr_raw?.combined_payments||[])if(p.image_path)names.add(p.image_path);}return [...names].sort();}
async function snapshot(c){
 await assertExpenseSyncScope(c);
 const schema=(await c.query("select table_name,column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name=ANY($1) order by table_name,ordinal_position",[tables])).rows;
 const rows={};for(const t of tables){rows[t]=Object.create(null);for(const r of (await c.query(`SELECT to_jsonb(t) AS row FROM "${t}" t ORDER BY id`)).rows)rows[t][r.row.id]=r.row;}
 for(const tomb of (await c.query('SELECT table_name,row_id FROM oak_sync_tombstones ORDER BY table_name,row_id')).rows)if(tables.includes(tomb.table_name)&&!Object.hasOwn(rows[tomb.table_name],tomb.row_id))rows[tomb.table_name][tomb.row_id]=null;
 return {schema,rows,digest:sha(stable({schema,rows}))};
}
async function main(q){
 if(q.op==='digest')return {digest:sha(stable({schema:q.schema,rows:q.rows}))};
 if(q.op==='init'){await pool.query(fs.readFileSync(new URL('./automation-schema.sql',import.meta.url),'utf8'));return {ok:true};}
 if(q.op==='file_get'){const p=safe(q.name);if(!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink())throw Error('Not a regular attachment');const b=fs.readFileSync(p);if(b.length>32*1024*1024)throw Error('Attachment too large');return {sha256:sha(b),data:b.toString('base64')};}
 if(q.op==='file_put'){const p=safe(q.name);const b=Buffer.from(q.data||'','base64');if(b.length>32*1024*1024||sha(b)!==q.sha256)throw Error('Attachment checksum mismatch');if(fs.existsSync(p)){if(fs.lstatSync(p).isSymbolicLink()||!fs.lstatSync(p).isFile()||sha(fs.readFileSync(p))!==q.sha256)throw Error('Attachment filename collision');return {ok:true};}const tmp=p+'.oak-'+crypto.randomUUID();try{fs.writeFileSync(tmp,b,{flag:'wx',mode:0o600});fs.linkSync(tmp,p);}catch(e){if(e.code!=='EEXIST')throw e;if(fs.lstatSync(p).isSymbolicLink()||sha(fs.readFileSync(p))!==q.sha256)throw Error('Attachment filename collision');}finally{try{fs.unlinkSync(tmp)}catch{}}return {ok:true};}
 const c=await pool.connect();try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  if(q.op==='apply')await c.query('LOCK TABLE '+tables.map(t=>'"'+t+'"').join(',')+' IN EXCLUSIVE MODE');
  const before=await snapshot(c);
  if(q.op==='snapshot'){await c.query('COMMIT');return before;}
  if(q.op==='files'){
   const files=Object.create(null);for(const n of refs(before.rows)){const p=safe(n);if(!fs.existsSync(p))throw Error('Referenced attachment is missing: '+n);if(!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink())throw Error('Invalid attachment');files[n]=sha(fs.readFileSync(p));}await c.query('COMMIT');return files;
  }
  if(q.op!=='apply')throw Error('Unsupported operation');
  if(before.digest===q.targetDigest){await c.query('COMMIT');return {ok:true,replayed:true};}
  if(before.digest!==q.expectedDigest)throw Error('Concurrent change detected; no database changes applied');
  if(stable(before.schema)!==stable(q.schema))throw Error('Database schemas differ');
  for(const t of tables){if(!q.rows?.[t]||Array.isArray(q.rows[t]))throw Error('Invalid sync table');for(const [id,row] of Object.entries(q.rows[t]))if(row&&String(row.id)!==id)throw Error('Row ID mismatch');}
  for(const n of refs(q.rows)){const p=safe(n);if(!fs.existsSync(p)||!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink())throw Error('Target attachment missing');}
  for(const t of tables){
   const columns=before.schema.filter(x=>x.table_name===t).map(x=>x.column_name);
   const quoted=columns.map(x=>'"'+x.replaceAll('"','""')+'"');
   for(const [id,row] of Object.entries(q.rows[t])){
    if(row===null)continue;
    if(stable(row)===stable(before.rows[t][id]))continue;
    if(Object.keys(row).some(k=>!columns.includes(k)))throw Error('Unknown column');
    await c.query(`INSERT INTO "${t}" (${quoted.join(',')}) SELECT ${quoted.join(',')} FROM jsonb_populate_record(NULL::"${t}",$1::jsonb) ON CONFLICT(id) DO UPDATE SET `+columns.filter(x=>x!=='id').map(x=>'"'+x+'"=EXCLUDED."'+x+'"').join(','),[JSON.stringify(row)]);
   }
  }
  // Update references before deleting parents; children are deleted first.
  for(const t of [...tables].reverse())for(const [id,row] of Object.entries(q.rows[t]))if(row===null){
    if(before.rows[t][id])await c.query(`DELETE FROM "${t}" WHERE id::text=$1`,[id]);
    await c.query('INSERT INTO oak_sync_tombstones(table_name,row_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[t,id]);
  }
  const after=await snapshot(c);if(after.digest!==q.targetDigest)throw Error('Final database checksum differs');
  await c.query('COMMIT');return {ok:true};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
try{const input=fs.readFileSync(0,'utf8');if(input.length>64*1024*1024)throw Error('Request too large');const result=await main(JSON.parse(input));process.stdout.write(JSON.stringify({result})+'\n');}catch(e){process.stdout.write(JSON.stringify({error:e.message})+'\n');process.exitCode=1;}finally{await pool.end();}
