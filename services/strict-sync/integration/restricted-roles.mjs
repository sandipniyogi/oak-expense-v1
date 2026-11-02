import {createRequire} from 'node:module';import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {APPLICATION_TABLES,identifier,grantApplicationRole} from '../src/application-roles.mjs';
const {Pool}=createRequire('/app/package.json')('pg');const database=process.env.OAK_ROLE_TEST_DATABASE;
if(!/^oak_role_test_[a-f0-9]{16}$/.test(database||''))throw Error('Disposable role-test database required');
const url=new URL(process.env.DATABASE_URL);if(!['db','oak-expense-staging-db-1'].includes(url.hostname))throw Error('Staging database host required');url.pathname='/'+database;
const admin=new Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});const apps=[];
try{
 const unknownDefiners=await admin.query("SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef");assert.equal(unknownDefiners.rowCount,0,'Public SECURITY DEFINER functions need an explicit privilege audit');
 // Public defaults are changed ONLY inside the new disposable database.
 await admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
 for(const service of Object.keys(APPLICATION_TABLES)){
  const role=database+'_'+service,password=crypto.randomBytes(32).toString('hex'),table='oak_role_probe_'+service;
  await admin.query('CREATE TABLE public.'+identifier(table)+'(id integer PRIMARY KEY,value text NOT NULL)');await admin.query('INSERT INTO public.'+identifier(table)+" VALUES(1,'before')");
  await admin.query('CREATE ROLE '+identifier(role)+" LOGIN PASSWORD '"+password+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT");
  const c=await admin.connect();try{await c.query('BEGIN');await grantApplicationRole(c,role,service,{probeTable:table});await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  const appURL=new URL(url);appURL.username=role;appURL.password=password;const pool=new Pool({connectionString:appURL.toString(),connectionTimeoutMillis:5000,max:1});apps.push({service,role,table,pool});
 }
 const barrier=fs.readFileSync(new URL('../sql/postgres-barrier.sql',import.meta.url),'utf8');await admin.query(barrier);
 async function denied(pool,sql,values=[]){await assert.rejects(pool.query(sql,values),e=>['42501','55000'].includes(e.code),'Expected privilege/barrier denial')}
 for(const app of apps){const {service,role,table,pool}=app;
  const result=(await pool.query("SELECT current_user AS name,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];assert.equal(result.name,role);for(const flag of ['rolsuper','rolcreaterole','rolcreatedb','rolreplication','rolbypassrls'])assert.equal(result[flag],false);
  assert.equal((await pool.query("SELECT has_schema_privilege(current_user,'public','CREATE') AS allowed")).rows[0].allowed,false);
  for(const name of APPLICATION_TABLES[service])await pool.query('SELECT * FROM public.'+identifier(name)+' LIMIT 0');
  await denied(pool,'SELECT * FROM public.'+identifier(apps.find(a=>a.service!==service).table));
  await denied(pool,'CREATE TABLE public.unguarded_test(id int)');await denied(pool,'ALTER TABLE public.'+identifier(table)+' DISABLE TRIGGER ALL');await denied(pool,'TRUNCATE public.'+identifier(table));await denied(pool,'SELECT * FROM oak_guard.state');await denied(pool,'SELECT oak_guard.freeze()');await denied(pool,'SET ROLE '+identifier(url.username));
  await denied(pool,'UPDATE public.'+identifier(table)+" SET value='without-permit' WHERE id=1");
  console.log('PASS: '+service+' authenticates as restricted role, reads its tables, cannot cross scopes, administer the gate or write while frozen');
  const operation=crypto.randomUUID();const generation=(await admin.query('SELECT oak_guard.begin_application($1) AS epoch',[operation])).rows[0].epoch;
  const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('oak_guard.operation',$1,true),set_config('oak_guard.generation',$2,true),set_config('oak_guard.mode','application',true)",[operation,String(generation)]);await client.query('UPDATE public.'+identifier(table)+" SET value='permitted' WHERE id=1");await client.query('COMMIT')}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  assert.equal((await pool.query('SELECT value FROM public.'+identifier(table))).rows[0].value,'permitted');await admin.query('SELECT oak_guard.freeze()');await denied(pool,'DELETE FROM public.'+identifier(table)+' WHERE id=1');console.log('PASS: '+service+' can write with a current permit and relocks after freeze');
 }
 console.log('PASS: restricted roles and database barrier work together on the cloned staging schema. Live connections were not changed.');
}catch(e){console.error('Role test failed:',e.code||e.name, e instanceof assert.AssertionError?e.message:'No live migration performed');process.exitCode=1}
finally{for(const a of apps)await a.pool.end();await admin.end()}
