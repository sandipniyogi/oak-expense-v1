#!/usr/bin/env python3
"""Deploy only the restaurant root domain; never edit the expenses host block."""
import pathlib,os,subprocess,hashlib,secrets,getpass,re,datetime,json,sys
root=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'scripts'))
from release import fingerprint

def replace_root(text):
 match=re.search(r'(?m)^the-oak-lounge\.online,\s*www\.the-oak-lounge\.online\s*\{',text)
 if not match:raise RuntimeError('Expected root/www domain block was not found. Do not replace the whole Caddyfile.')
 start=match.start();brace=text.index('{',match.start());depth=0;end=None
 for i in range(brace,len(text)):
  if text[i]=='{':depth+=1
  elif text[i]=='}':
   depth-=1
   if depth==0:end=i+1;break
 if end is None:raise RuntimeError('Caddyfile brace mismatch')
 before=text[start:end]
 if 'respond "The Oak Lounge' not in before and 'reverse_proxy oak-restaurant:3080' not in before:raise RuntimeError('Root domain has an unexpected existing website. Preserve it before proceeding.')
 block='''the-oak-lounge.online, www.the-oak-lounge.online {
    @www host www.the-oak-lounge.online
    redir @www https://the-oak-lounge.online{uri} permanent
    encode gzip
    reverse_proxy oak-restaurant:3080
}'''
 return text[:start]+block+text[end:]

def main():
 if os.geteuid()!=0:raise RuntimeError('Run on the VPS as root')
 if root!=pathlib.Path('/opt/oak-expense/restaurant'):raise RuntimeError('Extract this project to /opt/oak-expense/restaurant first')
 release_file=root/'release.json'
 if not release_file.exists():raise RuntimeError('Build staging, promote to Mac live, then run local.py package. Upload that release ZIP, not the starter bundle.')
 if json.loads(release_file.read_text()).get('source')!=fingerprint(root):raise RuntimeError('VPS source differs from the tested Mac release. Stop and check the extraction.')
 os.umask(0o077);gateway=pathlib.Path('/opt/oak-gateway');cfg=gateway/'conf/Caddyfile';old=cfg.read_text();new=replace_root(old)
 subprocess.run(['docker','network','inspect','oak-edge'],check=True,stdout=subprocess.DEVNULL)
 env=root/'.env.restaurant'
 if not env.exists():
  password=getpass.getpass('Choose NEW restaurant admin password (12+ characters): ')
  confirm=getpass.getpass('Confirm restaurant admin password: ')
  if len(password)<12 or password!=confirm:raise RuntimeError('Passwords must match and have at least 12 characters')
  salt=secrets.token_hex(16);hashed=hashlib.scrypt(password.encode(),salt=salt.encode(),n=16384,r=8,p=1,dklen=64).hex()
  env.write_text('ADMIN_PASSWORD_HASH=scrypt:'+salt+':'+hashed+'\n');env.chmod(0o600);del password,confirm
 cmd=['docker','compose','--project-directory',str(root),'-f',str(root/'compose.yaml')]
 subprocess.run(cmd+['up','-d','--build','--wait'],check=True)
 subprocess.run(['python3',str(root/'scripts/backup.py')],check=True)
 candidate=cfg.with_name('restaurant-candidate.Caddyfile');candidate.write_text(new);candidate.chmod(0o600)
 gc=['docker','compose','-f','compose.yaml','-f','compose.edge.yaml']
 subprocess.run(gc+['exec','-T','caddy','caddy','validate','--config','/etc/caddy/restaurant-candidate.Caddyfile','--adapter','caddyfile'],cwd=gateway,check=True)
 saved=cfg.with_name('Caddyfile.before-restaurant-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'));saved.write_text(old);saved.chmod(0o600)
 os.replace(candidate,cfg)
 try:subprocess.run(gc+['exec','-T','caddy','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'],cwd=gateway,check=True)
 except Exception:cfg.write_text(old);raise
 pathlib.Path('/etc/systemd/system/oak-restaurant-backup.service').write_text('''[Unit]
Description=Oak restaurant database and image backup
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
UMask=0077
ExecStart=/usr/bin/python3 /opt/oak-expense/restaurant/scripts/backup.py
''')
 pathlib.Path('/etc/systemd/system/oak-restaurant-backup.timer').write_text('''[Unit]
Description=Daily Oak restaurant backup
[Timer]
OnCalendar=*-*-* 19:15:00 UTC
Persistent=true
[Install]
WantedBy=timers.target
''')
 subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','enable','--now','oak-restaurant-backup.timer'],check=True)
 print('Restaurant deployed: https://the-oak-lounge.online')
 print('Admin: https://the-oak-lounge.online/admin — username admin, password you just chose.')
 print('The expenses hostname configuration is preserved. Add real menus, address, hours and contact details in admin.')
if __name__=='__main__':
 try:main()
 except Exception as e:raise SystemExit('Installation stopped: '+str(e))
