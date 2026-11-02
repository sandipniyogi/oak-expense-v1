#!/usr/bin/env python3
"""Test, back up and enable company funds in the existing Mac STAGING stack only."""
import datetime,json,os,pathlib,subprocess,time,urllib.request
os.umask(0o077);root=pathlib.Path(__file__).resolve().parents[1];cmd=['docker','compose','-p','oak-expense-staging','--env-file','.env.staging']
for name in ['docker-compose.yml','automation/compose.local.yaml','automation/compose.company-funds-staging.yaml']:cmd+=['-f',name]
def run(args,**kw):return subprocess.run(args,cwd=root,check=True,**kw)
config=json.loads(run(cmd+['config','--format','json'],capture_output=True,text=True).stdout)
if config.get('name')!='oak-expense-staging':raise SystemExit('Refusing non-staging project')
services=config['services']
for service,expected in [('api','4100'),('web','3100')]:
 published={str(p.get('published')) for p in services[service].get('ports',[]) if p.get('published') is not None}
 if published!={expected}:raise SystemExit('Expected staging '+service+' port '+expected+'; no restart attempted')
source=next((m.get('source','') for m in services['api'].get('volumes',[]) if m.get('target')=='/app/uploads'),'')
if 'storage-staging' not in pathlib.Path(source).parts:raise SystemExit('Separate storage-staging uploads required')
mounts=json.loads(run(['docker','inspect','oak-expense-staging-db-1','--format','{{json .Mounts}}'],capture_output=True,text=True).stdout)
volume=next((m.get('Name','') for m in mounts if m.get('Destination')=='/var/lib/postgresql/data'),'')
if not volume.startswith('oak-expense-staging_'):raise SystemExit('Existing staging database volume not verified')
run(['python3',str(root/'scripts/test-company-funds.py')]);print('Building STAGING API and web; live systems are untouched.',flush=True);run(cmd+['build','api','web'])
backup=root/'backups/company-funds-staging'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ');backup.mkdir(parents=True,mode=0o700)
with (backup/'before.dump').open('wb') as f:run(['docker','exec','oak-expense-staging-db-1','sh','-c','exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'],stdout=f,stderr=subprocess.PIPE)
with (backup/'before.dump').open('rb') as f:run(['docker','exec','-i','oak-expense-staging-db-1','pg_restore','--list'],stdin=f,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
run(['docker','exec','-i','oak-expense-staging-db-1','sh','-c','exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],input=(root/'db/migrations/20261102_company_funds.sql').read_text(),text=True,stdout=subprocess.DEVNULL)
run(cmd+['up','-d','--no-deps','api','web']);opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));month=datetime.datetime.now().strftime('%Y-%m')
for attempt in range(30):
 try:
  with opener.open('http://127.0.0.1:4100/company-funds?month='+month,timeout=5) as r:assert 'summary' in json.load(r)
  with opener.open('http://127.0.0.1:3100/company-funds',timeout=5) as r:assert r.status==200
  break
 except Exception:
  if attempt==29:raise SystemExit('Staging health failed; share output. Mac live and VPS were not changed.')
  time.sleep(1)
print('Staging ready: http://localhost:3100/company-funds');print('Staging backup:',backup);print('No Mac live or VPS deployment was performed.')
