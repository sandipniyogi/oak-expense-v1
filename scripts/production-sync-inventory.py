#!/usr/bin/env python3
"""Read-only production integration inventory. No configuration or data writes."""
import json,subprocess,sys
JS=r'''const {createRequire}=await import('node:module');const require=createRequire('/app/package.json');const {Pool}=require('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});try{const c=await pool.connect();try{await c.query('BEGIN READ ONLY');const role=(await c.query("SELECT current_user AS name,rolsuper AS superuser,rolcreaterole AS create_role,rolcreatedb AS create_database,rolreplication AS replication FROM pg_roles WHERE rolname=current_user")).rows[0];const tables=(await c.query("SELECT t.tablename,t.tableowner,EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=(quote_ident(t.schemaname)||'.'||quote_ident(t.tablename))::regclass AND k.contype='p') AS has_primary_key FROM pg_tables t WHERE t.schemaname='public' ORDER BY t.tablename")).rows;const guard=(await c.query("SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='oak_guard') AS installed")).rows[0];await c.query('ROLLBACK');console.log(JSON.stringify({ok:true,role,owned_public_tables:tables.filter(t=>t.tableowner===role.name).map(t=>t.tablename),tables_without_primary_key:tables.filter(t=>!t.has_primary_key).map(t=>t.tablename),public_table_count:tables.length,postgres_barrier_installed:guard.installed}));}finally{c.release()}}catch{console.log(JSON.stringify({ok:false,error:'Database role inspection unavailable'}));process.exitCode=1}finally{await pool.end()}'''
def run(args,timeout=40):
 try:return subprocess.run(args,text=True,capture_output=True,timeout=timeout)
 except (OSError,subprocess.TimeoutExpired):return None
def host(role):
 prefix='oak-expense-v1' if role=='mac' else 'oak-vps';result={'role':role,'read_only':True,'services':{},'database_connections':{}}
 for service in ['api','web','db','ocr','inventory-api','keg-api','social-api','oak-ai']:
  name=prefix+'-'+service+'-1';p=run(['docker','inspect',name,'--format','{{json .State}}'])
  if not p or p.returncode:result['services'][service]={'available':False};continue
  try:state=json.loads(p.stdout);result['services'][service]={'running':state.get('Running') is True,'status':state.get('Status')}
  except ValueError:result['services'][service]={'available':False}
 for service in ['api','inventory-api','keg-api','social-api']:
  p=run(['docker','exec',prefix+'-'+service+'-1','node','--input-type=module','-e',JS]);
  try:result['database_connections'][service]=json.loads(p.stdout) if p and p.stdout.strip() else {'ok':False,'error':'Service unavailable'}
  except ValueError:result['database_connections'][service]={'ok':False,'error':'Role inspection unavailable'}
 site='oak-restaurant-live-website-1' if role=='mac' else 'oak-restaurant-website-1'
 p=run(['docker','inspect',site,'--format','{{json .Config.User}}'])
 try:result['restaurant_container_user']=json.loads(p.stdout) if p and not p.returncode else None
 except ValueError:result['restaurant_container_user']=None
 return result
if __name__=='__main__':
 if len(sys.argv)>1 and sys.argv[1]=='--host':
  if len(sys.argv)!=3 or sys.argv[2] not in ('mac','vps'):raise SystemExit('Expected host role')
  print(json.dumps(host(sys.argv[2])));raise SystemExit(0)
 from pathlib import Path
 print('Inspecting live Mac roles, read only…',file=sys.stderr,flush=True);mac=host('mac')
 print('Inspecting live VPS roles, read only. Enter SSH password privately if prompted…',file=sys.stderr,flush=True)
 code=Path(__file__).read_text();p=subprocess.run(['ssh','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','root@162.35.33.141','python3 - --host vps'],input=code,text=True,stdout=subprocess.PIPE,timeout=300)
 try:vps=json.loads(p.stdout) if p.returncode==0 else {'error':'VPS inspection failed'}
 except ValueError:vps={'error':'Invalid VPS inspection response'}
 print(json.dumps({'mac':mac,'vps':vps,'production_gate_enabled':False,'changes_made':False},indent=2))
