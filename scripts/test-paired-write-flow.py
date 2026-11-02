#!/usr/bin/env python3
"""Exercise the paired write flow in two new test databases; never in live data."""
import argparse,pathlib,subprocess,uuid

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--project',required=True);args=p.parse_args();root=pathlib.Path(args.project).resolve()
 db_container='oak-expense-staging-db-1';api_container='oak-expense-staging-api-1';stamp=uuid.uuid4().hex[:16];databases={peer:'oak_pair_test_'+stamp+'_'+peer for peer in ['mac','vps']};folder='/tmp/oak-paired-test-'+stamp;created=[];copied=False
 def run(command,**kw):return subprocess.run(command,text=True,capture_output=True,timeout=60,**kw)
 owner=run(['docker','exec',db_container,'sh','-c','printf "%s" "$POSTGRES_USER"'])
 if owner.returncode or not owner.stdout:raise RuntimeError('Staging database unavailable')
 user=owner.stdout
 try:
  for peer,name in databases.items():
   result=run(['docker','exec',db_container,'createdb','-U',user,name])
   if result.returncode:raise RuntimeError('Could not create disposable database: '+name)
   created.append(name);print('Created disposable database:',name,flush=True)
   base=['docker','exec','-i',db_container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',user,'-d',name]
   bootstrap='CREATE TABLE public.expenses(id integer PRIMARY KEY,amount numeric NOT NULL);INSERT INTO public.expenses VALUES(1,10);\n'+(root/'services/strict-sync/sql/postgres-barrier.sql').read_text()
   result=run(base,input=bootstrap)
   if result.returncode:raise RuntimeError('Test database bootstrap failed: '+result.stderr[-1500:])
  result=run(['docker','exec',api_container,'mkdir','-m','700',folder])
  if result.returncode:raise RuntimeError('Staging API container unavailable')
  copied=True
  # Only source files, not .env, credentials, uploads or database dumps.
  for name in ['src','integration']:
   result=run(['docker','cp',str(root/'services/strict-sync'/name),api_container+':'+folder+'/'+name])
   if result.returncode:raise RuntimeError('Could not transfer isolated integration test source')
  command=['docker','exec','-e','OAK_TEST_DB_MAC='+databases['mac'],'-e','OAK_TEST_DB_VPS='+databases['vps'],api_container,'node',folder+'/integration/paired-postgres.integration.mjs']
  result=subprocess.run(command,text=True,timeout=150)
  if result.returncode:raise RuntimeError('Combined write-flow test failed; do not promote')
 finally:
  for name in created:
   result=run(['docker','exec',db_container,'dropdb','--force','-U',user,name])
   print(('Removed disposable database: ' if result.returncode==0 else 'Cleanup needed for test database ONLY: ')+name,flush=True)
  if copied:
   # The path is generated locally from a fixed prefix and hexadecimal nonce.
   result=run(['docker','exec',api_container,'rm','-rf','--',folder])
   if result.returncode:print('Temporary test source cleanup needed:',folder)
if __name__=='__main__':
 try:main()
 except (RuntimeError,OSError,subprocess.SubprocessError) as e:raise SystemExit(str(e))
