#!/usr/bin/env python3
"""Actual merge/bridge test in two disposable staging databases only."""
import argparse,json,pathlib,subprocess,sys,tempfile,uuid,shutil
p=argparse.ArgumentParser();p.add_argument('--project',required=True);a=p.parse_args();root=pathlib.Path(a.project).resolve();sys.path.insert(0,str(root/'automation'));from runner import sync
api='oak-expense-staging-api-1';db='oak-expense-staging-db-1';token=uuid.uuid4().hex[:16];names=['oak_funds_sync_'+token+'_'+side for side in ('mac','vps')];remote='/tmp/oak-funds-sync-'+token;created=[]
def run(args,**kw):return subprocess.run(args,check=True,**kw)
def sql(name,query):
 return run(['docker','exec','-i',db,'sh','-c','exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"','sh',name],input=query,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout
# Source imports pg from the existing staging image, never host Node.
driver=r'''const {createRequire}=await import('node:module');const req=createRequire('/app/package.json');const {Pool}=req('pg');const {spawnSync}=await import('node:child_process');const name=process.env.OAK_FUNDS_SYNC_DB;if(!/^oak_funds_sync_[a-f0-9]{16}_(mac|vps)$/.test(name))throw Error('Disposable database required');const u=new URL(process.env.DATABASE_URL);if(!['db','oak-expense-staging-db-1'].includes(u.hostname))throw Error('Unexpected database host');u.pathname='/'+name;const r=spawnSync(process.execPath,[process.env.OAK_FUNDS_SYNC_BRIDGE],{env:{...process.env,DATABASE_URL:u.toString()},input:await new Promise(resolve=>{let x='';process.stdin.setEncoding('utf8');process.stdin.on('data',b=>x+=b);process.stdin.on('end',()=>resolve(x))}),encoding:'utf8'});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);'''
class Peer:
 def __init__(self,name):self.name=name
 def request(self,q):
  if q['op']=='backup':return {'ok':True,'disposable_only':True}
  r=run(['docker','exec','-i','-e','OAK_FUNDS_SYNC_DB='+self.name,'-e','OAK_FUNDS_SYNC_BRIDGE='+remote+'/automation-bridge.mjs',api,'node','--input-type=module','-e',driver],input=json.dumps(q),text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  d=json.loads(r.stdout)
  if 'error' in d:raise RuntimeError(d['error'])
  return d['result']
try:
 inspect=json.loads(subprocess.check_output(['docker','inspect',db,api],text=True))
 for item in inspect:
  labels=item['Config'].get('Labels') or {}
  if labels.get('com.docker.compose.project')!='oak-expense-staging' or not item['State']['Running']:raise RuntimeError('Running staging containers required')
 run(['docker','exec','-u','0',api,'mkdir','-p',remote])
 for filename in ['automation-bridge.mjs','expense-sync-scope.mjs','automation-schema.sql']:
  run(['docker','cp',str(root/'apps/api/src'/filename),api+':'+remote+'/'+filename],stdout=subprocess.DEVNULL)
 run(['docker','exec','-u','0',api,'ln','-s','/app/node_modules',remote+'/node_modules'])
 for name in names:
  sql('postgres','CREATE DATABASE '+name+';');created.append(name);print('Created disposable database:',name,flush=True)
  sql(name,"CREATE TABLE users(id uuid PRIMARY KEY,name text); CREATE TABLE categories(id uuid PRIMARY KEY,name text); CREATE TABLE merchants(id uuid PRIMARY KEY,name text); CREATE TABLE expenses(id uuid PRIMARY KEY,user_id uuid REFERENCES users(id),amount numeric); INSERT INTO users VALUES('00000000-0000-0000-0000-000000000001','Test partner'); INSERT INTO expenses VALUES('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',3200);")
  sql(name,(root/'db/migrations/20261102_company_funds.sql').read_text())
  Peer(name).request({'op':'init'})
 mac,vps=map(Peer,names)
 with tempfile.TemporaryDirectory(prefix='oak-funds-sync-state-') as state:
  state=pathlib.Path(state);assert sync(mac,vps,state)['unchanged']
  sql(names[0],"INSERT INTO oak_company_fund_entries(id,request_id,partner_id,kind,amount_cents,occurred_on,purpose) VALUES('00000000-0000-0000-0000-000000000003','test-advance','00000000-0000-0000-0000-000000000001','advance',500000,'2026-11-01','Test supplies');")
  sync(mac,vps,state);assert mac.request({'op':'snapshot'})==vps.request({'op':'snapshot'});print('PASS: actual movement sync Mac to VPS',flush=True)
  sql(names[1],"INSERT INTO oak_company_expense_funding(expense_id,funding_source,expense_user_id,amount_cents) VALUES('00000000-0000-0000-0000-000000000002','advance','00000000-0000-0000-0000-000000000001',320000);")
  sync(mac,vps,state);assert mac.request({'op':'snapshot'})==vps.request({'op':'snapshot'});print('PASS: expense_id review sync VPS to Mac',flush=True)
  sql(names[0],"UPDATE oak_company_fund_entries SET voided_at='2026-11-03',void_reason='Test correction';")
  sync(mac,vps,state);assert mac.request({'op':'snapshot'})==vps.request({'op':'snapshot'});print('PASS: void history retained on both peers',flush=True)
  sql(names[1],'DELETE FROM oak_company_expense_funding;');snap=vps.request({'op':'snapshot'});assert list(snap['rows']['oak_company_expense_funding'].values())==[None]
  sync(mac,vps,state);assert mac.request({'op':'snapshot'})==vps.request({'op':'snapshot'});print('PASS: review deletion uses expense_id tombstone and propagates',flush=True)
  for name,note in zip(names,['mac edit','vps edit']):sql(name,"UPDATE oak_company_fund_entries SET purpose='"+note+"';")
  before=[p.request({'op':'snapshot'})['digest'] for p in (mac,vps)]
  try:sync(mac,vps,state);raise AssertionError('Concurrent conflict accepted')
  except RuntimeError as e:assert 'conflict' in str(e)
  assert before==[p.request({'op':'snapshot'})['digest'] for p in (mac,vps)];print('PASS: competing edits stop without overwriting either peer',flush=True)
 print('PASS: company-funds sync tested on disposable data only.',flush=True)
finally:
 for name in reversed(created):
  sql('postgres','DROP DATABASE '+name+' WITH (FORCE);');print('Removed disposable database:',name,flush=True)
 run(['docker','exec','-u','0',api,'rm','-rf','--',remote],stdout=subprocess.DEVNULL)
