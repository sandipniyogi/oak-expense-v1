#!/usr/bin/env python3
"""Schema-only disposable permission test; never changes a live connection."""
import argparse,pathlib,subprocess,uuid,json
p=argparse.ArgumentParser();p.add_argument('--project',default=str(pathlib.Path(__file__).resolve().parents[1]));a=p.parse_args();root=pathlib.Path(a.project).expanduser().resolve();db='oak-expense-staging-db-1';api='oak-expense-staging-api-1';name='oak_role_test_'+uuid.uuid4().hex[:16];folder='/tmp/'+name;created=False;copied=False
roles=[name+'_'+s for s in ['expense','inventory','keg','social']]
def run(args,**kw):return subprocess.run(args,capture_output=True,timeout=90,**kw)
owner=run(['docker','exec',db,'sh','-c','printf "%s" "$POSTGRES_USER"'],text=True)
if owner.returncode or not owner.stdout:raise SystemExit('Staging database unavailable')
user=owner.stdout
try:
 schema=run(['docker','exec',db,'sh','-c','exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --schema-only --no-owner --no-privileges --no-comments'])
 if schema.returncode:raise RuntimeError('Could not read staging schema; nothing created')
 result=run(['docker','exec',db,'createdb','-U',user,name])
 if result.returncode:raise RuntimeError('Could not create disposable database')
 created=True;print('Created disposable schema-only database:',name,flush=True)
 result=run(['docker','exec','-i',db,'pg_restore','--clean','--if-exists','--no-owner','--no-privileges','--exit-on-error','-U',user,'-d',name],input=schema.stdout)
 if result.returncode:raise RuntimeError('Schema clone failed; no live data modified')
 result=run(['docker','exec',api,'mkdir','-m','700',folder])
 if result.returncode:raise RuntimeError('Staging API unavailable')
 copied=True
 for sub in ['src','integration','sql']:
  result=run(['docker','cp',str(root/'services/strict-sync'/sub),api+':'+folder+'/'+sub])
  if result.returncode:raise RuntimeError('Test source transfer failed')
 uid=run(['docker','exec',api,'id','-u'],text=True).stdout.strip();gid=run(['docker','exec',api,'id','-g'],text=True).stdout.strip()
 if not uid.isdecimal() or not gid.isdecimal():raise RuntimeError('Container user unavailable')
 result=run(['docker','exec','--user','0',api,'chown','-R',uid+':'+gid,folder])
 if result.returncode:raise RuntimeError('Temporary source ownership failed')
 result=subprocess.run(['docker','exec','-e','OAK_ROLE_TEST_DATABASE='+name,api,'node',folder+'/integration/restricted-roles.mjs'],timeout=150)
 if result.returncode:raise RuntimeError('Restricted-role test failed; do not migrate live roles')
except (OSError,subprocess.SubprocessError,RuntimeError) as e:
 print(str(e));raise SystemExit(1)
finally:
 if created:
  result=run(['docker','exec',db,'dropdb','--force','-U',user,name]);print(('Removed disposable database: ' if not result.returncode else 'Cleanup needed for disposable database ONLY: ')+name,flush=True)
  # Every role has a generated test-only prefix; no live role is altered.
  sql='\n'.join('DROP ROLE IF EXISTS "'+role+'";' for role in roles)
  result=run(['docker','exec','-i',db,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U',user,'-d','postgres'],input=sql,text=True)
  if result.returncode:print('Cleanup needed for test roles:',', '.join(roles))
  else:print('Removed disposable test roles.',flush=True)
 if copied:
  result=run(['docker','exec','--user','0',api,'rm','-rf','--',folder])
  if result.returncode:print('Temporary source cleanup needed:',folder)
