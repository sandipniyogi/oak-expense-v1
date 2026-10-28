#!/usr/bin/env python3
import os,sys,json,pathlib,fcntl
from machine import Machine
os.umask(0o077)
cfg=json.loads(pathlib.Path(sys.argv[1]).read_text())
with (pathlib.Path(cfg['project'])/'.oak-automation-host.lock').open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 print(json.dumps(Machine(cfg).backup()))
