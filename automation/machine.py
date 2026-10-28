"""Local machine operations. Never print compose's resolved secrets."""
import subprocess,json,pathlib,datetime,os,tarfile
class Machine:
    def __init__(self,config):
        self.cfg=config;self.root=pathlib.Path(config['project']).resolve()
        self.base=['docker','compose','--project-directory',str(self.root),'--env-file',config['env_file']]
        for name in config['compose_files']:self.base+=['-f',name]
    def command(self,args,**kw):
        return subprocess.run(self.base+args,cwd=self.root,check=True,**kw)
    def request(self,q):
        if q['op']=='backup':return self.backup()
        result=subprocess.run(self.base+['exec','-T','api','node','src/automation-bridge.mjs'],cwd=self.root,input=json.dumps(q),text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if not result.stdout.strip():raise RuntimeError('Docker API bridge unavailable; ensure Docker and live services are running')
        data=json.loads(result.stdout)
        if 'error' in data:raise RuntimeError(data['error'])
        return data['result']
    def backup(self):
        folder=self.root/'backups'/'automation'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
        folder.mkdir(parents=True,mode=0o700)
        os.chmod(folder,0o700)
        dump=folder/'database.dump'
        try:
            with dump.open('wb') as f:self.command(['exec','-T','db','sh','-c','exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'],stdout=f,stderr=subprocess.PIPE)
            with dump.open('rb') as f:self.command(['exec','-T','db','pg_restore','--list'],stdin=f,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            # Full uploads backup via container's real mount, independent of host .env.
            with (folder/'uploads.tar.gz').open('wb') as f:self.command(['exec','-T','api','sh','-c','exec tar -czf - -C /app/uploads .'],stdout=f,stderr=subprocess.PIPE)
            import gzip
            with gzip.open(folder/'uploads.tar.gz','rb') as f:
                while f.read(1024*1024):pass
            for p in folder.iterdir():os.chmod(p,0o600)
        except Exception:
            (folder/'FAILED').touch();raise
        (folder/'VERIFIED').touch()
        # Retain at least seven verified copies and all copies from the last 14 days.
        import shutil,time
        copies=sorted([p for p in folder.parent.iterdir() if p.is_dir() and not p.is_symlink() and (p/'VERIFIED').is_file()],key=lambda p:p.stat().st_mtime,reverse=True)
        cutoff=time.time()-86400*int(self.cfg.get('backup_retention_days',14))
        for old in copies[7:]:
            if old.stat().st_mtime<cutoff:shutil.rmtree(old)
        return {'ok':True,'backup':str(folder)}
    def smoke(self):
        js='''const base="http://localhost:4000";for(const p of ["/health","/meta","/reports/expenses?payment_method=all"]){const r=await fetch(base+p);if(!r.ok)throw Error(p+":"+r.status);const d=await r.json();if(p==="/health"&&!d.ok)throw Error("Health failed");if(p==="/meta"&&!Array.isArray(d.users))throw Error("Metadata failed");if(p.startsWith("/reports")&&!Array.isArray(d.rows))throw Error("Report failed");}const o=await fetch('http://ocr:8001/health');if(!o.ok||!(await o.json()).ok)throw Error('OCR health failed');console.log("API smoke passed");'''
        self.command(['exec','-T','api','node','--input-type=module','-e',js],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        self.command(['exec','-T','web','node','-e','fetch("http://localhost:3000").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        if self.cfg.get('phone_cloud'):
            self.command(['exec','-T','phone-cloud','node','-e','fetch("http://localhost:8080/config.js").then(async r=>{if(!r.ok||!(await r.text()).includes("OAK_QUEUE_CLOUD=true"))process.exit(1)}).catch(()=>process.exit(1))'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    def resolved(self):
        return json.loads(self.command(['config','--format','json'],text=True,stdout=subprocess.PIPE).stdout)

    def assert_private(self):
        if self.cfg.get('role')!='vps':return
        config=self.resolved()
        for name in ('db','api','ocr','web','phone-cloud'):
            if config['services'].get(name,{}).get('ports'):raise RuntimeError('Private service publishes a host port: '+name)
