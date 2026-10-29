#!/usr/bin/env python3
"""Enable/pause approved-main releases; never disable the data-sync schedule."""
import argparse,fcntl,json,os,pathlib,tempfile
p=argparse.ArgumentParser();p.add_argument('--config',required=True);p.add_argument('mode',choices=['enable','pause']);args=p.parse_args()
path=pathlib.Path(args.config).expanduser().resolve();cfg=json.loads(path.read_text());state=pathlib.Path(cfg['state_dir'])
with (state/'runner.lock').open('a') as lock:
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise SystemExit('Automation is running. Wait for it to finish, then retry.')
    cfg['release_policy']='approved-main-v1' if args.mode=='enable' else 'paused'
    fd,temp=tempfile.mkstemp(dir=path.parent,prefix='.oak-config-')
    with os.fdopen(fd,'w') as handle:json.dump(cfg,handle,indent=2)
    os.replace(temp,path)
print('Approved-main deployment '+('enabled' if args.mode=='enable' else 'paused')+'. Daily expense sync is unchanged.')
