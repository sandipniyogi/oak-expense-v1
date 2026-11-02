#!/usr/bin/env python3
"""Install a forced read-only verification key/agent, not a live write gate."""
import argparse,base64,datetime,hashlib,json,os,pathlib,shlex,subprocess,sys
BOOTSTRAP=r'''
import base64,datetime,hashlib,json,os,pathlib,re,sys
os.umask(0o077)
q=json.load(sys.stdin)
if os.geteuid()!=0:raise SystemExit('Root setup required')
key=q['public_key'].strip()
if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/=]+(?: [A-Za-z0-9_.@-]+)?',key):raise SystemExit('Invalid public key')
code=base64.b64decode(q['agent'],validate=True)
if hashlib.sha256(code).hexdigest()!=q['sha256']:raise SystemExit('Agent checksum mismatch')
compile(code,'strict-verifier-agent','exec')
folder=pathlib.Path('/opt/oak-strict-verifier')
if folder.is_symlink():raise SystemExit('Agent directory symlink refused')
folder.mkdir(mode=0o700,exist_ok=True);folder.chmod(0o700)
target=folder/'agent.py'
if target.is_symlink():raise SystemExit('Agent symlink refused')
if target.exists() and target.read_bytes()!=code:
 backup=folder/('agent-before-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')+'.py');backup.write_bytes(target.read_bytes());backup.chmod(0o600)
temp=folder/'agent.new'
if temp.exists() or temp.is_symlink():raise SystemExit('Temporary agent path exists; stopped')
with temp.open('xb') as f:f.write(code);f.flush();os.fsync(f.fileno())
temp.chmod(0o600);os.replace(temp,target)
ssh=pathlib.Path('/root/.ssh')
if ssh.is_symlink():raise SystemExit('SSH directory symlink refused')
ssh.mkdir(mode=0o700,exist_ok=True)
authorized=ssh/'authorized_keys'
if authorized.is_symlink():raise SystemExit('Authorized keys symlink refused')
old=authorized.read_text() if authorized.exists() else ''
blob=key.split()[1]
line='restrict,command="/usr/bin/python3 /opt/oak-strict-verifier/agent.py vps" '+key
existing=[r for r in old.splitlines() if blob in r.split()]
if existing and existing!=[line]:raise SystemExit('This public key already has another authorization; stopped')
if not existing:
 if authorized.exists():
  backup=ssh/('authorized_keys.before-strict-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ'));backup.write_text(old);backup.chmod(0o600)
 with authorized.open('a') as f:f.write(('\n' if old and not old.endswith('\n') else '')+line+'\n');f.flush();os.fsync(f.fileno())
 authorized.chmod(0o600)
print(json.dumps({'ok':True,'agent_sha256':q['sha256'],'read_only':True,'services_restarted':False}))
'''
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--project',required=True);p.add_argument('--ssh-host',default='root@162.35.33.141');args=p.parse_args()
 root=pathlib.Path(args.project).resolve();agent=root/'automation/strict_sync/agent.py';code=agent.read_bytes()
 compile(code,str(agent),'exec')
 key=pathlib.Path.home()/'.ssh/oak_strict_verify_ed25519';key.parent.mkdir(mode=0o700,exist_ok=True)
 if key.is_symlink() or pathlib.Path(str(key)+'.pub').is_symlink():raise RuntimeError('Key symlink refused')
 if not key.exists():subprocess.run(['ssh-keygen','-q','-t','ed25519','-N','','-C','oak-strict-readonly','-f',str(key)],check=True)
 key.chmod(0o600)
 public=subprocess.check_output(['ssh-keygen','-y','-f',str(key)],text=True).strip()
 expected_public=pathlib.Path(str(key)+'.pub')
 if expected_public.exists() and expected_public.read_text().split()[:2]!=public.split()[:2]:raise RuntimeError('Public/private key mismatch')
 request={'public_key':' '.join(public.split()[:2])+' oak-strict-readonly','agent':base64.b64encode(code).decode(),'sha256':hashlib.sha256(code).hexdigest()}
 print('Install a restricted read-only verifier on the VPS. Enter SSH password privately if prompted.',flush=True)
 # Credentials stay in the controlling Terminal. Host-key verification is never disabled.
 result=subprocess.run(['ssh','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=ask',args.ssh_host,'python3 -c '+shlex.quote(BOOTSTRAP)],input=json.dumps(request),text=True,stdout=subprocess.PIPE,timeout=240)
 if result.returncode:raise RuntimeError('VPS setup failed; no live application configuration was changed')
 reply=json.loads(result.stdout)
 if reply.get('ok') is not True or reply.get('agent_sha256')!=request['sha256']:raise RuntimeError('VPS verifier confirmation mismatch')
 cfg=pathlib.Path.home()/'Library/Application Support/OakAutomation/strict-verifier.json';cfg.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 record={'project':str(root),'ssh_host':args.ssh_host,'ssh_key':str(key),'mode':'verification_only'}
 if cfg.is_symlink():raise RuntimeError('Verifier config symlink refused')
 if cfg.exists() and json.loads(cfg.read_text())!=record:raise RuntimeError('Existing verifier config differs; stopped without replacing it')
 cfg.write_text(json.dumps(record,indent=2));cfg.chmod(0o600)
 print('Installed read-only verifier. No containers restarted; daily sync and deployment settings unchanged.')
 print('Next: python3 scripts/verify-live-sync.py --project "'+str(root)+'"')
if __name__=='__main__':
 try:main()
 except Exception as e:raise SystemExit('Setup stopped: '+(str(e) if isinstance(e,RuntimeError) else type(e).__name__))
