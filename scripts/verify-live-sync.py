#!/usr/bin/env python3
"""Real Mac/VPS verification. Read only, never grants a write permit."""
import argparse,hashlib,json,pathlib,shlex,subprocess,sys,uuid
SERVICES={
 'api':('apps/api',['package.json','src/']), 'web':('apps/web',['package.json','next.config.mjs','app/']),
 'inventory-api':('services/inventory-api',['package.json','src/']), 'keg-api':('services/keg-api',['package.json','src/']),
 'social-api':('services/social-api',['package.json','src/']), 'oak-ai':('services/oak-ai',['package.json','src/']),
 'phone':('services/phone-queue',['server.js','public/']), 'restaurant':('restaurant',['package.json','server.mjs','scripts/','public/']),
 'ocr':('services/ocr',['requirements.txt','app.py'])}
class Unavailable(RuntimeError):pass

def execute(args,**kw):
 try:p=subprocess.run(args,text=True,capture_output=True,timeout=240,**kw)
 except (OSError,subprocess.TimeoutExpired):raise Unavailable('Connection or inspection timed out') from None
 if p.returncode:
  try:detail=json.loads(p.stdout).get('error','Connection unavailable')
  except (ValueError,AttributeError):detail='Connection unavailable'
  raise Unavailable('Connection or inspection failed: '+str(detail)+'; no data changed')
 return p.stdout

def expected_source(root):
 remote=execute(['git','remote','get-url','origin'],cwd=root).strip().removesuffix('.git').rstrip('/')
 if remote not in ['https://github.com/sandipniyogi/oak-expense-v1','git@github.com:sandipniyogi/oak-expense-v1','ssh://git@github.com/sandipniyogi/oak-expense-v1']:raise Unavailable('Unexpected Git origin; approval cannot be verified')
 execute(['git','fetch','--no-recurse-submodules','origin','main'],cwd=root)
 commit=execute(['git','rev-parse','origin/main'],cwd=root).strip();expected={}
 for service,(folder,selectors) in SERVICES.items():
  paths=execute(['git','ls-tree','-r','--name-only',commit,'--',folder],cwd=root).splitlines();expected[service]={}
  for name in paths:
   relative=name[len(folder)+1:]
   if not any(relative==s or s.endswith('/') and relative.startswith(s) for s in selectors):continue
   p=subprocess.run(['git','show',commit+':'+name],cwd=root,capture_output=True,check=True)
   expected[service][relative]=hashlib.sha256(p.stdout).hexdigest()
  if not expected[service]:raise Unavailable('Missing approved source for '+service)
 return commit,expected

def validated(result,nonce,role):
 if not isinstance(result,dict) or result.get('nonce')!=nonce or result.get('role')!=role or result.get('online') is not True:raise Unavailable(role+': fresh host verification missing')
 if set(result.get('source',{}))!=set(SERVICES):raise Unavailable(role+': incomplete source scope')
 if not isinstance(result.get('scope'),dict) or not result.get('digest'):raise Unavailable(role+': incomplete data scope')
 return result

def differences(a,b):return sorted(k for k in set(a)|set(b) if a.get(k)!=b.get(k))
def summarize(commit,left,right):
 source={role:{s:v.get('different_files',[]) for s,v in record['source'].items() if v.get('ok') is not True} for role,record in [('mac',left),('vps',right)]}
 diff={}
 for name in set(left['scope'])|set(right['scope']):
  a=left['scope'].get(name);b=right['scope'].get(name)
  if a!=b:diff[name]=differences(a,b) if isinstance(a,dict) and isinstance(b,dict) else 'different'
 return {'approved_git_commit':commit,'both_online':True,'source_mismatches':source,'data_differences':diff,
         'observed_business_content_matches':not any(source.values()) and not diff,
         'write_permission_granted':False,'production_gate_ready':False,
         'reason':'Read-only verification; live transactional fencing and all-module replication are not installed.',
         'counts':{'mac':left['counts'],'vps':right['counts']},
         'limitations':['Sequential observations can change while applications are writing.',
                        'Database functions, sequence state, dependency versions and compiled browser settings are not verified.',
                        'Local restaurant sessions, audit and Instagram cache; unreferenced receipt/media files and social tmp files are excluded.',
                        'Normalization maps declared seed identities, but does not reconcile or apply any record.']}

def check(root,config):
 commit,expected=expected_source(root);nonce=uuid.uuid4().hex;q=json.dumps({'op':'verify','nonce':nonce,'expected':expected})
 agent=root/'automation/strict_sync/agent.py'
 left=validated(json.loads(execute([sys.executable,str(agent),'mac'],input=q)),nonce,'mac')
 # Strict host-key checking; no agent/password fallback. The key is forced to the read-only agent.
 args=['ssh','-T','-i',config['ssh_key'],'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',config['ssh_host'],'oak-strict-verify']
 right=validated(json.loads(execute(args,input=q)),nonce,'vps')
 return summarize(commit,left,right)

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--project',required=True);p.add_argument('--config',default=str(pathlib.Path.home()/'Library/Application Support/OakAutomation/strict-verifier.json'));args=p.parse_args()
 root=pathlib.Path(args.project).resolve();config=json.loads(pathlib.Path(args.config).read_text())
 if pathlib.Path(config['project']).resolve()!=root:raise Unavailable('Verifier project mismatch')
 print('Checking approved Git source and both LIVE systems, read only…',file=sys.stderr,flush=True)
 result=check(root,config);print(json.dumps(result,indent=2));return 0 if result['observed_business_content_matches'] else 2
if __name__=='__main__':
 try:sys.exit(main())
 except (Unavailable,OSError,ValueError,KeyError,subprocess.SubprocessError) as e:
  print(json.dumps({'both_online':False,'write_permission_granted':False,'production_gate_ready':False,'error':str(e) if isinstance(e,Unavailable) else type(e).__name__}));sys.exit(1)
