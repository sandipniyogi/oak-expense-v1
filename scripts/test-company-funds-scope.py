#!/usr/bin/env python3
"""Run original legacy scope tests and the new scope tests in staging Node."""
import argparse,json,pathlib,subprocess,uuid
p=argparse.ArgumentParser();p.add_argument('--project',required=True);a=p.parse_args();root=pathlib.Path(a.project).resolve();container='oak-expense-staging-api-1';folder='/tmp/oak-funds-scope-'+uuid.uuid4().hex
item=json.loads(subprocess.check_output(['docker','inspect',container],text=True))[0]
if not item['State']['Running'] or (item['Config'].get('Labels') or {}).get('com.docker.compose.project')!='oak-expense-staging':raise SystemExit('Running staging API required')
files=['src/expense-sync-scope.mjs','test/expense-sync-legacy.test.mjs','test/expense-sync-scope.test.mjs','test/company-funds-scope.test.mjs']
for rel in files:
 if not (root/'apps/api'/rel).is_file():raise SystemExit('Missing test source: '+rel)
try:
 subprocess.run(['docker','exec','-u','0',container,'mkdir','-p',folder+'/src',folder+'/test'],check=True)
 for rel in files:subprocess.run(['docker','cp',str(root/'apps/api'/rel),container+':'+folder+'/'+rel],check=True,stdout=subprocess.DEVNULL)
 subprocess.run(['docker','exec',container,'node','--test',*[folder+'/'+rel for rel in files if rel.startswith('test/')]],check=True)
 print('PASS: original legacy scope tests and company-funds scope tests. No database opened.')
finally:subprocess.run(['docker','exec','-u','0',container,'rm','-rf','--',folder],check=True)
