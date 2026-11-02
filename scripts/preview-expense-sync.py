#!/usr/bin/env python3
"""Existing live expense merge preview under the existing scheduler lock. No apply mode."""
import argparse,fcntl,json,pathlib,subprocess,sys

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--project',required=True);args=p.parse_args()
 root=pathlib.Path(args.project).resolve();folder=pathlib.Path.home()/'Library/Application Support/OakAutomation';cfg=json.loads((folder/'config.json').read_text())
 if pathlib.Path(cfg['project']).resolve()!=root:raise RuntimeError('Automation project mismatch')
 engine=folder/'engine'
 for name in ['runner.py','machine.py','merge.py']:
  if not (engine/name).is_file():raise RuntimeError('Installed automation engine missing')
 # Reuse the installed engine's CLI and lock. The only accepted command is dry-run.
 result=subprocess.run([sys.executable,str(engine/'runner.py'),'--config',str(folder/'config.json'),'dry-run'],text=True,capture_output=True,timeout=300)
 if result.returncode:raise RuntimeError('Existing expense preview stopped. Run the existing runner dry-run in Terminal to inspect its error; no data applied.')
 if not result.stdout.strip():raise RuntimeError('Scheduler lock may be busy; no preview result returned')
 data=json.loads(result.stdout)
 print(json.dumps({'expense_merge_preview':data,'applied':False,'write_permission_granted':False,
  'note':'Expense-only existing merge preview. This neither synchronizes other modules nor unlocks strict mode.'},indent=2))
if __name__=='__main__':
 try:main()
 except (RuntimeError,OSError,ValueError,KeyError,subprocess.SubprocessError) as e:raise SystemExit(str(e) if isinstance(e,RuntimeError) else type(e).__name__)
