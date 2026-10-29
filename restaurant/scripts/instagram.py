#!/usr/bin/env python3
"""Verify the Instagram account before privately storing its API token."""
import argparse,getpass,json,os,pathlib,re,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser();p.add_argument('--environment',choices=['staging','live','vps'],default='staging');a=p.parse_args();env=ROOT/('.env.restaurant' if a.environment=='vps' else '.env.restaurant.'+a.environment)
 if not env.exists():raise RuntimeError('Set up this website environment first.')
 token=getpass.getpass('Instagram API long-lived access token (hidden; NOT your password): ').strip()
 if not re.fullmatch(r'[A-Za-z0-9_.-]{30,4096}',token):raise RuntimeError('Invalid token format. No settings changed.')
 req=urllib.request.Request('https://graph.instagram.com/v25.0/me?fields=user_id,username',headers={'Authorization':'Bearer '+token})
 try:
  with urllib.request.urlopen(req,timeout=15) as response:d=json.load(response)
 except Exception:raise RuntimeError('Instagram could not verify this token. Check Instagram Login basic permissions and token validity. No settings changed.') from None
 uid=str(d.get('user_id') or d.get('id') or '')
 if d.get('username','').lower()!='theoaklounge786' or not uid.isdigit():raise RuntimeError('This token is not for @theoaklounge786. No settings changed.')
 lines=[line for line in env.read_text().splitlines() if not line.startswith(('INSTAGRAM_ACCESS_TOKEN=','INSTAGRAM_USER_ID='))];lines+=['INSTAGRAM_ACCESS_TOKEN='+token,'INSTAGRAM_USER_ID='+uid]
 temp=env.with_name(env.name+'.tmp');fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
 with os.fdopen(fd,'w') as f:f.write('\n'.join(lines)+'\n')
 os.chmod(temp,0o600);os.replace(temp,env);print('Verified @theoaklounge786. Connection saved privately for '+a.environment+'. Restart the selected environment to apply it.')
if __name__=='__main__':
 try:main()
 except Exception as e:raise SystemExit('Stopped: '+str(e))
