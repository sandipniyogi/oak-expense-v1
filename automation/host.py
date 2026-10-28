#!/usr/bin/env python3
"""Restricted SSH entry point. Install path and config are owned by root."""
import sys,json,pathlib,fcntl,os
from machine import Machine
from deploy import deploy

def run(config,request):
    if config.get('role')!='vps':raise RuntimeError('Wrong host role')
    machine=Machine(config)
    lockpath=machine.root/'.oak-automation-host.lock'
    with lockpath.open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        if request.get('op')=='deploy':return deploy(machine,request)
        if request.get('op')=='agent':
            q=request.get('request',{})
            if q.get('op') not in ('init','snapshot','files','file_get','file_put','digest','apply','backup'):raise RuntimeError('Unsupported agent operation')
            return machine.request(q)
        raise RuntimeError('Unsupported request')
if __name__=='__main__':
    os.umask(0o077)
    try:
        if os.environ.get('SSH_ORIGINAL_COMMAND') not in (None,'','oak-automation'):raise RuntimeError('This key is restricted to Oak automation')
        cfg=json.loads(pathlib.Path(sys.argv[1]).read_text())
        raw=sys.stdin.buffer.read(64*1024*1024+1)
        if len(raw)>64*1024*1024:raise RuntimeError('Request too large')
        result=run(cfg,json.loads(raw));print(json.dumps({'result':result}))
    except Exception as e:
        # Do not expose environment variables or full compose command errors.
        print(json.dumps({'error':str(e) if isinstance(e,RuntimeError) else type(e).__name__}));sys.exit(1)
