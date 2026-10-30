#!/usr/bin/env python3
"""One compose configuration for all Mac staging application services."""
import json,pathlib,subprocess,os,time,urllib.request
root=pathlib.Path(__file__).resolve().parents[1]
env={**os.environ,'INVENTORY_API_HOST_PORT':'4300','KEG_API_HOST_PORT':'4301','AI_API_HOST_PORT':'4400','SOCIAL_API_HOST_PORT':'4500','SOCIAL_STORAGE_DIR':str(root/'storage-staging/social')}
files=['docker-compose.yml','automation/compose.local.yaml','docker-compose.inventory.yml','docker-compose.keg.yml','docker-compose.social.yml','docker-compose.ai.yml','automation/compose.ai-staging.yaml','docker-compose.phone-queue.yml']
cmd=['docker','compose','-p','oak-expense-staging','--env-file','.env.staging']
for file in files:cmd+=['-f',file]
resolved=subprocess.run(cmd+['config','--format','json'],cwd=root,env=env,text=True,capture_output=True)
if resolved.returncode:raise SystemExit('Could not resolve staging Compose; check the files/env locally. Resolved secrets were not printed.')
config=json.loads(resolved.stdout)
if config.get('name')!='oak-expense-staging':raise SystemExit('Refusing a non-staging project.')
# Refuse a storage mistake before any container starts. Live defaults are unsafe.
services=config['services'];upload=next((v.get('source','') for v in services['api'].get('volumes',[]) if v.get('target')=='/app/uploads'),'')
if not upload or 'storage-staging' not in pathlib.Path(upload).parts:raise SystemExit('Expected storage-staging uploads. Review .env.staging before continuing.')
print('Building all STAGING app services. Live services and data are untouched.',flush=True)
subprocess.run(cmd+['build','api','web','inventory-api','keg-api','social-api','oak-ai','phone-queue'],cwd=root,env=env,check=True)
subprocess.run(cmd+['up','-d','db','ocr','api','web','inventory-api','keg-api','social-api','oak-ai','phone-queue'],cwd=root,env=env,check=True)
failed=[]
for path in ['/module-api/inventory/health','/module-api/keg/health','/module-api/social/health','/module-api/ai/health']:
 for attempt in range(15):
  try:
   with urllib.request.urlopen('http://localhost:3100'+path,timeout=4) as response:
    result=json.load(response)
   if not result.get('ok'):raise RuntimeError('Unhealthy response')
   if path=='/module-api/ai/health' and not result.get('model_available'):raise RuntimeError('Configured AI model is not installed')
   print('PASS '+path,flush=True);break
  except Exception:
   if attempt==14:failed.append(path)
   else:time.sleep(1)
if failed:raise SystemExit('Staging check failed: '+', '.join(failed)+'. Do not promote yet.')
print('Application services ready. Next: python3 restaurant/scripts/local.py staging',flush=True)
