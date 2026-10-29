#!/usr/bin/env python3
"""Build staging, promote its exact image to Mac live, package approved source."""
import pathlib,subprocess,os,json,hashlib,secrets,getpass,argparse,urllib.request,urllib.error,datetime,zipfile,sys
from release import fingerprint,files,inventory
ROOT=pathlib.Path(__file__).resolve().parents[1]
PORTS={'staging':3180,'live':3080}
def write(path,data):
 tmp=path.with_name(path.name+'.tmp');tmp.write_text(json.dumps(data,indent=2)+'\n');tmp.chmod(0o600);os.replace(tmp,path)
def env(kind,image):
 path=ROOT/('.env.restaurant.'+kind)
 values={}
 if path.exists():
  for line in path.read_text().splitlines():
   if '=' in line:k,v=line.split('=',1);values[k]=v
 else:
  password=getpass.getpass('Choose '+kind+' website admin password (12+ characters): ')
  confirm=getpass.getpass('Confirm password: ')
  if len(password)<12 or password!=confirm:raise RuntimeError('Passwords must match and contain at least 12 characters')
  salt=secrets.token_hex(16);hashed=hashlib.scrypt(password.encode(),salt=salt.encode(),n=16384,r=8,p=1,dklen=64).hex();values['ADMIN_PASSWORD_HASH']='scrypt:'+salt+':'+hashed;del password,confirm
 values.update(RESTAURANT_IMAGE=image,SITE_PORT=str(PORTS[kind]),PUBLIC_ORIGIN='http://localhost:'+str(PORTS[kind]),ADMIN_COOKIE_NAME='oak_restaurant_'+kind,APP_ENV='staging' if kind=='staging' else 'local-live')
 path.write_text('\n'.join(k+'='+v for k,v in values.items())+'\n');path.chmod(0o600);return path

def command(kind,args,**kw):
 return subprocess.run(['docker','compose','-p','oak-restaurant-'+kind,'--env-file',str(ROOT/('.env.restaurant.'+kind)),'-f',str(ROOT/'compose.local.yaml')]+args,cwd=ROOT,check=True,**kw)
def smoke(kind):
 origin='http://localhost:'+str(PORTS[kind]);d=json.load(urllib.request.urlopen(origin+'/api/health',timeout=15))
 if not d.get('ok'):raise RuntimeError('Website health check failed')
 data=json.load(urllib.request.urlopen(origin+'/api/content',timeout=15))
 expected='staging' if kind=='staging' else 'local-live'
 if data.get('environment')!=expected:raise RuntimeError('Wrong website/environment answered on this port')
 try:urllib.request.urlopen(origin+'/api/admin/content',timeout=15)
 except urllib.error.HTTPError as e:
  if e.code!=401:raise
 else:raise RuntimeError('Admin endpoint is not protected')
def image_id(image):return subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',image],text=True).strip()
def main():
 os.umask(0o077)
 p=argparse.ArgumentParser();p.add_argument('action',choices=['staging','live','package','status']);a=p.parse_args()
 if a.action=='status':
  for kind in PORTS:
   if (ROOT/('.env.restaurant.'+kind)).exists():command(kind,['ps'])
  return
 current=fingerprint(ROOT);image='oak-restaurant:release-'+current[:20]
 if a.action=='staging':
  for test in ['test/local.test.py','test/router.test.py']:subprocess.run([sys.executable,test],cwd=ROOT,check=True)
  env('staging',image);print('Building STAGING. Existing expense containers are separate.',flush=True)
  command('staging',['up','-d','--build','--wait']);smoke('staging')
  if fingerprint(ROOT)!=current:raise RuntimeError('Source changed during the build. Run staging again.')
  write(ROOT/'.local-staging-release.json',{'source':current,'image':image,'image_id':image_id(image),'tested_at':datetime.datetime.now(datetime.timezone.utc).isoformat()})
  print('Staging ready: http://localhost:3180 — admin: http://localhost:3180/admin')
  print('Test the design and admin. When satisfied, run: python3 scripts/local.py live')
  return
 stage=ROOT/'.local-staging-release.json'
 if not stage.exists():raise RuntimeError('Build and test staging first')
 ready=json.loads(stage.read_text())
 if ready['source']!=current or ready['image_id']!=image_id(ready['image']):raise RuntimeError('Source/image changed since staging was tested. Run staging again.')
 if a.action=='live':
  existed=(ROOT/'.env.restaurant.live').exists()
  if existed:
   cid=command('live',['ps','-q','website'],text=True,stdout=subprocess.PIPE).stdout.strip()
   if cid:subprocess.run(['python3',str(ROOT/'scripts/backup.py'),'--local','live'],check=True)
  env('live',ready['image']);print('Promoting the exact staged image to MAC LIVE (no rebuild).',flush=True)
  command('live',['up','-d','--no-build','--wait']);smoke('live')
  write(ROOT/'.local-live-release.json',ready)
  print('Mac live ready: http://localhost:3080 — admin: http://localhost:3080/admin')
  print('Its database is separate. Staging test entries are not copied.')
  print('After checking Mac live, package it with: python3 scripts/local.py package')
  return
 live=ROOT/'.local-live-release.json'
 if not live.exists() or json.loads(live.read_text()).get('source')!=current:raise RuntimeError('Promote this tested version to Mac live first')
 smoke('live');out=ROOT/'backups'/'releases'/('oak-restaurant-release-'+current[:12]+'.zip');out.parent.mkdir(parents=True,exist_ok=True)
 release={**ready,'files':inventory(ROOT),'packaged_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
  for file,rel in files(ROOT):z.write(file,'oak-restaurant/'+rel)
  z.writestr('oak-restaurant/release.json',json.dumps(release,indent=2))
 print('VPS release prepared:',out)
 print('Upload this release ZIP only after verifying Mac live. Instructions are in LOCAL-FIRST.md.')
if __name__=='__main__':
 try:main()
 except Exception as e:raise SystemExit('Stopped: '+str(e))
