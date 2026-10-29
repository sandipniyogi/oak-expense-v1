#!/usr/bin/env python3
"""Mac scheduler: approved GitHub main releases; daily live expense-data sync."""
import argparse,base64,contextlib,datetime,fcntl,hashlib,json,os,pathlib,subprocess,sys,tarfile,io,time
from zoneinfo import ZoneInfo
from merge import merge,baseline,canonical,TABLES
from machine import Machine
from deploy import deploy
from approved import approved_commit,checkout,candidate_machine

def atomic(path,data):
    path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    temp=path.with_name(path.name+'.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2));temp.chmod(0o600);os.replace(temp,path)
def read(path,default):return json.loads(path.read_text()) if path.exists() else default
class Remote:
    def __init__(self,cfg):self.cfg=cfg
    def send(self,q):
        args=['ssh','-T','-i',self.cfg['ssh_key'],'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',self.cfg['ssh_host'],'oak-automation']
        p=subprocess.run(args,input=json.dumps(q),text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=2400)
        try:d=json.loads(p.stdout)
        except Exception:raise RuntimeError('SSH connection/remote command failed. Check key, known_hosts and VPS connectivity.')
        if 'error' in d:raise RuntimeError(d['error'])
        return d['result']
    def request(self,q):return self.send({'op':'agent','request':q})
def sync(mac,vps,state,dry=False):
    pending=state/'pending.json';basepath=state/'baseline.json'
    left=mac.request({'op':'snapshot'});right=vps.request({'op':'snapshot'})
    if left['schema']!=right['schema']:raise RuntimeError('Schemas differ. Deploy matching schema migrations before syncing data.')
    journal=read(pending,None)
    if journal:
        if dry:return {'pending_recovery':True}
        # Journal recovery accepts only original or exact planned state. Never overwrite later edits.
        for name,snap in [('mac',left),('vps',right)]:
            if snap['digest'] not in (journal[name],journal['targetDigest']):raise RuntimeError('Interrupted sync plus new '+name+' edits. Pending plan retained; manual reconciliation required.')
    else:
        base=read(basepath,None)
        target,conflicts=merge(base,left['rows'],right['rows'],read(state/'resolutions.json',{}))
        if conflicts:
            atomic(state/'conflicts.json',conflicts);raise RuntimeError(str(len(conflicts))+' sync conflicts. Run the conflicts command; no records were changed.')
        digest=mac.request({'op':'digest','schema':left['schema'],'rows':target})['digest']
        journal={'schema':left['schema'],'rows':target,'targetDigest':digest,'mac':left['digest'],'vps':right['digest']}
        if dry:return {'conflicts':0,'mac_changes':left['digest']!=digest,'vps_changes':right['digest']!=digest}
        if left['digest']==right['digest']==digest:
            atomic(basepath,baseline(target));atomic(state/'conflicts.json',[]);return {'ok':True,'unchanged':True}
        # Preserve both database + upload snapshots before any sync mutation.
        mac.request({'op':'backup'});vps.request({'op':'backup'})
        manifests=[mac.request({'op':'files'}),vps.request({'op':'files'})]
        for name in set(manifests[0])&set(manifests[1]):
            if manifests[0][name]!=manifests[1][name]:raise RuntimeError('Screenshot filename collision: '+name)
        # Copy additions only. Physical file deletion is intentionally disabled.
        for source,dest,si,di in [(mac,vps,0,1),(vps,mac,1,0)]:
            for name,checksum in manifests[si].items():
                if manifests[di].get(name)==checksum:continue
                b=source.request({'op':'file_get','name':name})
                if b['sha256']!=checksum:raise RuntimeError('Attachment changed during transfer')
                dest.request({'op':'file_put','name':name,**b})
        atomic(pending,journal)
    if dry:return {'pending_recovery':True}
    for name,dest in [('mac',mac),('vps',vps)]:
        dest.request({'op':'apply','schema':journal['schema'],'rows':journal['rows'],'expectedDigest':journal[name],'targetDigest':journal['targetDigest']})
    for dest in (mac,vps):
        if dest.request({'op':'snapshot'})['digest']!=journal['targetDigest']:raise RuntimeError('Records changed during final verification; pending journal retained')
    atomic(basepath,baseline(journal['rows']));pending.unlink();atomic(state/'conflicts.json',[]);atomic(state/'resolutions.json',{})
    return {'ok':True,'expenses':sum(r is not None for r in journal['rows']['expenses'].values())}
def release(root,commit):
    paths=['apps','services','db','scripts','automation']
    p=subprocess.run(['git','archive','--format=tar.gz',commit]+paths,cwd=root,check=True,stdout=subprocess.PIPE)
    return {'op':'deploy','archive':base64.b64encode(p.stdout).decode(),'sha256':hashlib.sha256(p.stdout).hexdigest(),'commit':commit}
def auto_deploy(cfg,state,mac,vps):
    # Fail closed until the owner explicitly enables the new release policy.
    if cfg.get('release_policy')!='approved-main-v1':
        return {'skipped':'Code deployment paused. Enable approved-main-v1 after configuring GitHub main protection. Data sync remains enabled.'}
    root=pathlib.Path(cfg['project'])
    commit=approved_commit(root)
    previous=read(state/'deployed.json',{})
    if previous.get('commit')==commit:return {'unchanged':True,'commit':commit}
    stage=Machine({**cfg,'env_file':'.env.staging','compose_files':['docker-compose.yml','automation/compose.local.yaml']})
    a=mac.resolved();b=stage.resolved()
    if a['name']==b['name']:raise RuntimeError('Staging and live project names must differ')
    def sources(c):
        out=set()
        for service in ('db','api'):
            for v in c['services'][service].get('volumes',[]):
                if v['target'] in ('/var/lib/postgresql/data','/app/uploads'):
                    src=v['source'];out.add(c.get('volumes',{}).get(src,{}).get('name',src))
        return out
    if sources(a)&sources(b):raise RuntimeError('Staging storage overlaps live storage')
    with checkout(root,commit,state) as source:
        # Infrastructure changes need an explicit rollout: they must never be
        # silently ignored while reporting that the complete commit deployed.
        for name in ['docker-compose.yml','automation/compose.local.yaml']:
            if not (root/name).is_file() or (root/name).read_bytes()!=(source/name).read_bytes():
                raise RuntimeError('Compose configuration differs from approved main; review infrastructure before releasing')
        subprocess.run(['python3','-m','unittest','discover','-s','automation/tests'],cwd=source,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        with contextlib.ExitStack() as stack:
            candidate_stage=stack.enter_context(candidate_machine(stage,source,state))
            candidate_live=stack.enter_context(candidate_machine(mac,source,state))
            candidate_stage.command(['up','-d','--build','api','web','ocr'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            for attempt in range(30):
                try:candidate_stage.smoke();break
                except Exception:
                    if attempt==29:raise RuntimeError('Staging smoke tests failed')
                    time.sleep(2)
            payload=release(root,commit)
            result=deploy(candidate_live,payload)
            atomic(state/'mac-release.json',{'commit':commit,'sha256':payload['sha256']})
            # VPS never starts deploying until Mac live build and smoke pass.
            remote_result=vps.send(payload)
            if result['sha256']!=remote_result['sha256']:raise RuntimeError('Release verification mismatch')
    atomic(state/'deployed.json',{'commit':commit,'sha256':payload['sha256']})
    return {'ok':True,'commit':commit,'scope':'expense-api-web-ocr'}
def notify(state,message):
    if sys.platform!='darwin':return
    now=time.time();last=read(state/'last-notification.json',{})
    if now-last.get('at',0)<86400:return
    subprocess.run(['osascript','-e','on run argv\n display notification (item 1 of argv) with title "Oak automation needs attention"\nend run',message],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    atomic(state/'last-notification.json',{'at':now})
def tick(cfg,state,mac,vps):
    result={}
    # Pending sync must recover before builds can change source/container identities.
    if (state/'pending.json').exists():result['recovery']=sync(mac,vps,state)
    try:result['deploy']=auto_deploy(cfg,state,mac,vps)
    except Exception as e:
        details=getattr(e,'stderr',None) or str(e)
        if isinstance(details,bytes):details=details.decode('utf-8','replace')
        log=state/'deploy-error.log';log.write_text(details[-100000:]);log.chmod(0o600)
        result['deploy_error']=str(e) if isinstance(e,RuntimeError) else 'Deployment check failed; see deploy-error.log ('+type(e).__name__+')'
    now=datetime.datetime.now(ZoneInfo('Asia/Shanghai'))
    day=(now.date() if now.hour>=3 else now.date()-datetime.timedelta(days=1)).isoformat()
    if read(state/'last-sync.json',{}).get('day')!=day:
        mac.request({'op':'backup'});vps.request({'op':'backup'});result['sync']=sync(mac,vps,state);atomic(state/'last-sync.json',{'day':day,'at':now.isoformat()})
    return result
if __name__=='__main__':
    os.umask(0o077);os.environ['COMPOSE_PARALLEL_LIMIT']='1'
    parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);parser.add_argument('command',choices=['tick','sync','dry-run','deploy','conflicts','resolve']);parser.add_argument('--id');parser.add_argument('--take',choices=['mac','vps']);args=parser.parse_args()
    cfg=json.loads(pathlib.Path(args.config).read_text());state=pathlib.Path(cfg['state_dir']);state.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (state/'runner.lock').open('w') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:sys.exit(0)
        try:
            mac=Machine(cfg);vps=Remote(cfg)
            if args.command=='conflicts':result=read(state/'conflicts.json',[])
            elif args.command=='resolve':
                conflicts=read(state/'conflicts.json',[])
                if not args.take or not any(c['id']==args.id and 'mac' in c for c in conflicts):raise RuntimeError('Select a current record conflict ID and --take mac or vps')
                resolutions=read(state/'resolutions.json',{});resolutions[args.id]=args.take;atomic(state/'resolutions.json',resolutions);result={'ok':True,'next':'Run sync to apply this explicit choice'}
            elif args.command in ('sync','dry-run'):result=sync(mac,vps,state,args.command=='dry-run')
            elif args.command=='deploy':result=auto_deploy(cfg,state,mac,vps)
            else:result=tick(cfg,state,mac,vps)
            if isinstance(result,dict) and result.get('deploy_error'):notify(state,'Code deployment paused. Open runner logs to see the failed check.')
            atomic(state/'status.json',{'ok':not (isinstance(result,dict) and result.get('deploy_error')),'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'result':result});print(json.dumps(result,ensure_ascii=False))
        except Exception as e:
            error=str(e) if isinstance(e,RuntimeError) else type(e).__name__
            notify(state,'Sync or deployment paused. Your records have not been silently overwritten; check the automation status.')
            atomic(state/'status.json',{'ok':False,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'error':error});print('Oak automation paused: '+error,file=sys.stderr);sys.exit(1)
