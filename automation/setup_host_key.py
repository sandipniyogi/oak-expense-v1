#!/usr/bin/env python3
import sys,pathlib,re,os
os.umask(0o077)
s=sys.stdin.read().strip()
if not re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/=]+(?: [^\r\n]*)?',s):raise SystemExit('Expected an Ed25519 PUBLIC key')
blob=s.split()[1]
folder=pathlib.Path('/root/.ssh');folder.mkdir(mode=0o700,exist_ok=True);folder.chmod(0o700)
p=folder/'authorized_keys';old=p.read_text() if p.exists() else ''
lines=[line for line in old.splitlines() if blob not in line.split()]
lines.append('restrict,command="/usr/bin/python3 /opt/oak-expense/automation/host.py /etc/oak-automation.json" '+s)
tmp=folder/'authorized_keys.oak-tmp';tmp.write_text('\n'.join(lines)+'\n');tmp.chmod(0o600);os.replace(tmp,p)
print('Restricted Oak automation key installed. This key can sync expense data and deploy your code.')
