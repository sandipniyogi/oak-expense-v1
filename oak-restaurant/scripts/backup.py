#!/usr/bin/env python3
import pathlib,subprocess,datetime,os,fcntl,gzip,sqlite3,shutil,time,argparse
root=pathlib.Path(__file__).resolve().parents[1];os.umask(0o077)
parser=argparse.ArgumentParser();parser.add_argument('--local',choices=['staging','live']);args=parser.parse_args()
scope=args.local or 'production'
with (root/'.backup.lock').open('w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 folder=root/'backups'/scope/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ');folder.mkdir(parents=True,mode=0o700)
 cmd=['docker','compose','--project-directory',str(root)]
 if args.local:cmd+=['-p','oak-restaurant-'+args.local,'--env-file',str(root/('.env.restaurant.'+args.local)),'-f',str(root/'compose.local.yaml')]
 else:cmd+=['-f',str(root/'compose.yaml')]
 with (folder/'restaurant.sqlite').open('wb') as out:subprocess.run(cmd+['exec','-T','website','node','scripts/backup.mjs'],check=True,stdout=out)
 db=sqlite3.connect(str(folder/'restaurant.sqlite'));result=db.execute('PRAGMA integrity_check').fetchone();db.close()
 if result!=('ok',):raise SystemExit('Database backup integrity check failed')
 with (folder/'uploads.tar.gz').open('wb') as out:subprocess.run(cmd+['exec','-T','website','tar','-czf','-','-C','/data/uploads','.'],check=True,stdout=out)
 with gzip.open(folder/'uploads.tar.gz','rb') as src:
  while src.read(1024*1024):pass
 (folder/'VERIFIED').touch()
 copies=sorted([p for p in folder.parent.iterdir() if p.is_dir() and not p.is_symlink() and (p/'VERIFIED').exists()],key=lambda p:p.stat().st_mtime,reverse=True)
 for p in copies[7:]:
  if p.stat().st_mtime<time.time()-14*86400:shutil.rmtree(p)
 print('Verified website backup:',folder)
