#!/usr/bin/env python3
"""Block an approved development-branch push unless Git ancestry and fresh live observations pass."""
import argparse,importlib.util,json,pathlib,subprocess,sys
class Blocked(RuntimeError):pass
ALLOWED_BRANCHES={'staging','feature/company-funds','feature/oak-social-openai'}
EXPECTED={'https://github.com/sandipniyogi/oak-expense-v1','git@github.com:sandipniyogi/oak-expense-v1','ssh://git@github.com/sandipniyogi/oak-expense-v1'}
def git(root,*args):
 try:p=subprocess.run(['git',*args],cwd=root,text=True,capture_output=True,timeout=120)
 except (OSError,subprocess.TimeoutExpired):raise Blocked('Git unavailable or timed out') from None
 if p.returncode:raise Blocked('Git check failed: '+args[0]+'; no pull/reset performed')
 return p.stdout.strip()
def ancestor(root,older,newer):
 p=subprocess.run(['git','merge-base','--is-ancestor',older,newer],cwd=root,capture_output=True,timeout=30)
 if p.returncode not in (0,1):raise Blocked('Git ancestry unavailable')
 return p.returncode==0
def validate_report(report,approved):
 if not isinstance(report,dict) or report.get('approved_git_commit')!=approved:raise Blocked('Approved main changed during verification; fetch and retry')
 if report.get('both_online') is not True:raise Blocked('Both live systems must be online')
 if report.get('observed_business_content_matches') is not True:raise Blocked('Live business content does not match')
 if report.get('source_mismatches')!={'mac':{},'vps':{}}:raise Blocked('Live source differs from approved main or source scope is incomplete')
 if report.get('data_differences')!={}:raise Blocked('Live differences reported; reconcile before pushing')
 if not isinstance(report.get('counts'),dict) or set(report['counts'])!={'mac','vps'}:raise Blocked('Live observation scope incomplete')
 return report
def check(root,config,verify=None):
 branch=git(root,'branch','--show-current')
 if branch not in ALLOWED_BRANCHES:raise Blocked('Use staging or feature/company-funds')
 if git(root,'status','--porcelain','--untracked-files=normal'):raise Blocked('Commit or review all working-tree changes first; nothing is automatically stashed')
 remote=git(root,'remote','get-url','origin').rstrip('/').removesuffix('.git')
 if remote not in EXPECTED:raise Blocked('Unexpected origin repository')
 head=git(root,'rev-parse','HEAD')
 git(root,'fetch','--no-recurse-submodules','origin','+refs/heads/main:refs/remotes/origin/main','+refs/heads/staging:refs/remotes/origin/staging')
 approved=git(root,'rev-parse','origin/main')
 remote_refs=['origin/main']
 if branch=='staging':remote_refs.append('origin/staging')
 else:
  ref='refs/heads/'+branch
  advertised=git(root,'ls-remote','--heads','origin',ref)
  if advertised:
   parts=advertised.split()
   if len(parts)!=2 or parts[1]!=ref:raise Blocked('Unexpected remote feature reference')
   git(root,'fetch','--no-recurse-submodules','origin','+'+ref+':refs/remotes/origin/'+branch)
   remote_refs.append('origin/'+branch)
 for remote_ref in remote_refs:
  if not ancestor(root,remote_ref,head):raise Blocked(remote_ref+' contains changes missing from '+branch+'. Integrate and test them before pushing; no automatic merge performed')
 if verify is None:
  file=root/'scripts/verify-live-sync.py';spec=importlib.util.spec_from_file_location('oak_real_verifier',file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  try:verify=lambda:module.check(root,json.loads(config.read_text()))
  except Exception:raise Blocked('Read-only verifier configuration unavailable') from None
 try:report=verify()
 except Exception:raise Blocked('Real live verification failed; check Docker, SSH key, network and verifier configuration') from None
 validate_report(report,approved)
 if git(root,'rev-parse','origin/main')!=approved or git(root,'rev-parse','HEAD')!=head:raise Blocked('Git references changed during verification; retry')
 if git(root,'status','--porcelain','--untracked-files=normal'):raise Blocked('Working tree changed during verification')
 return {'ok':True,'branch':branch,'commit':head,'staging_commit':head if branch=='staging' else None,'approved_main':approved,'live_observation_matches':True,'production_gate_ready':report.get('production_gate_ready') is True,'live_write_permission_granted':False,'note':'Push preflight only. Not continuous synchronization or a production write permit.'}
def validate_push(lines,head,branch='staging'):
 if branch not in ALLOWED_BRANCHES:raise Blocked('This branch is not approved for direct push')
 if len(lines.splitlines())!=1 or not lines.strip():raise Blocked('Push exactly one current development branch')
 for line in lines.splitlines():
  parts=line.split()
  if len(parts)!=4 or parts[0]!='refs/heads/'+branch or parts[2]!='refs/heads/'+branch or parts[1]!=head:raise Blocked('Only the current approved development branch may be pushed through this hook; use a reviewed pull request for main')
def install_hook(root):
 settings=subprocess.run(['git','config','--get','core.hooksPath'],cwd=root,text=True,capture_output=True)
 if settings.returncode not in (0,1):raise Blocked('Git hook configuration unavailable')
 if settings.returncode==0:raise Blocked('Custom core.hooksPath exists; preserve it and integrate this check manually')
 hookdir=pathlib.Path(git(root,'rev-parse','--git-path','hooks'));hookdir=hookdir if hookdir.is_absolute() else root/hookdir
 hookdir.mkdir(parents=True,exist_ok=True);hook=hookdir/'pre-push'
 content='''#!/usr/bin/env python3
# Oak staging push preflight v1
import pathlib,subprocess,sys
root=subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip()
raise SystemExit(subprocess.call([sys.executable,str(pathlib.Path(root)/'scripts/preflight-push.py'),'--project',root,'--pre-push',*sys.argv[1:]]))
'''
 if hook.is_symlink():raise Blocked('Symlink hook refused')
 if hook.exists() and hook.read_text()!=content:raise Blocked('Existing pre-push hook preserved; integrate this check manually')
 hook.write_text(content);hook.chmod(0o755);return {'installed':True,'hook':str(hook),'live_services_changed':False}
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--project',default=str(pathlib.Path(__file__).resolve().parents[1]));p.add_argument('--config',default=str(pathlib.Path.home()/'Library/Application Support/OakAutomation/strict-verifier.json'));p.add_argument('--install-hook',action='store_true');p.add_argument('--pre-push',nargs=2,metavar=('REMOTE','URL'));a=p.parse_args();root=pathlib.Path(a.project).expanduser().resolve()
 if a.install_hook:result=install_hook(root)
 else:
  if a.pre_push:
   if a.pre_push[0]!='origin' or a.pre_push[1].rstrip('/').removesuffix('.git') not in EXPECTED:raise Blocked('Unexpected push destination')
   validate_push(sys.stdin.read(65537),git(root,'rev-parse','HEAD'),git(root,'branch','--show-current'))
  print('Fetching GitHub and checking both LIVE systems, read only…',file=sys.stderr,flush=True);result=check(root,pathlib.Path(a.config).expanduser())
 print(json.dumps(result,indent=2))
if __name__=='__main__':
 try:main()
 except Blocked as e:print('Push blocked: '+str(e),file=sys.stderr);sys.exit(1)
 except Exception:print('Push blocked: preflight unavailable; no deployment was requested',file=sys.stderr);sys.exit(1)
