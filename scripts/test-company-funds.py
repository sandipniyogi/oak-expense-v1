#!/usr/bin/env python3
import pathlib,subprocess,uuid
root=pathlib.Path(__file__).resolve().parents[1];db='oak-expense-staging-db-1';api='oak-expense-staging-api-1';name='oak_funds_test_'+uuid.uuid4().hex[:16];folder='/tmp/'+name;created=False;copied=False
owner=subprocess.check_output(['docker','exec',db,'sh','-c','printf "%s" "$POSTGRES_USER"'],text=True)
try:
 subprocess.run(['docker','exec',db,'createdb','-U',owner,name],check=True);created=True;print('Created disposable company-funds database:',name,flush=True)
 subprocess.run(['docker','exec',api,'mkdir','-m','700',folder],check=True);copied=True
 paths=['apps/api/src/company-funds.mjs','apps/api/src/company-funds-model.mjs','apps/api/test/company-funds.test.mjs','apps/api/integration/company-funds.integration.mjs','db/migrations/20261102_company_funds.sql']
 for rel in paths:
  target=folder+'/'+rel;subprocess.run(['docker','exec',api,'mkdir','-p',str(pathlib.PurePosixPath(target).parent)],check=True);subprocess.run(['docker','cp',str(root/rel),api+':'+target],check=True,stdout=subprocess.DEVNULL)
 uid=subprocess.check_output(['docker','exec',api,'id','-u'],text=True).strip();gid=subprocess.check_output(['docker','exec',api,'id','-g'],text=True).strip()
 if not uid.isdecimal() or not gid.isdecimal():raise RuntimeError('Container user unavailable')
 subprocess.run(['docker','exec','--user','0',api,'chown','-R',uid+':'+gid,folder],check=True)
 subprocess.run(['docker','exec',api,'node','--test',folder+'/apps/api/test/company-funds.test.mjs'],check=True,timeout=60)
 subprocess.run(['docker','exec','-e','OAK_FUNDS_TEST_DATABASE='+name,api,'node',folder+'/apps/api/integration/company-funds.integration.mjs'],check=True,timeout=120)
finally:
 if created:subprocess.run(['docker','exec',db,'dropdb','--force','-U',owner,name],check=True);print('Removed disposable company-funds database.',flush=True)
 if copied:subprocess.run(['docker','exec','--user','0',api,'rm','-rf','--',folder],check=True)
