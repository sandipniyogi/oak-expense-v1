import base64,hashlib,io,json,os,pathlib,subprocess,tarfile,tempfile,time,datetime
from machine import Machine
ALLOWED={'apps','services','db','scripts','automation'}
def unpack(payload,dest):
    raw=base64.b64decode(payload['archive'],validate=True)
    if len(raw)>32*1024*1024 or hashlib.sha256(raw).hexdigest()!=payload['sha256']:raise RuntimeError('Release checksum mismatch')
    seen=set();total=0
    with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as tf:
        for m in tf:
            p=pathlib.PurePosixPath(m.name)
            if p.is_absolute() or '..' in p.parts or not p.parts or p.parts[0] not in ALLOWED or any((x.startswith('.') and x!='.dockerignore') or x in ('node_modules','backups') for x in p.parts):raise RuntimeError('Invalid release path: '+m.name)
            if not (m.isdir() or m.isfile()):raise RuntimeError('Release contains a link/device')
            if m.name in seen:raise RuntimeError('Duplicate release path')
            seen.add(m.name);total+=m.size
            if total>64*1024*1024:raise RuntimeError('Expanded release is too large')
            out=dest.joinpath(*p.parts)
            if m.isdir():out.mkdir(parents=True,exist_ok=True)
            else:
                out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(tf.extractfile(m).read());out.chmod(0o755 if m.mode&0o111 else 0o644)
    for p in ('apps/api/src/index.js','apps/api/src/automation-bridge.mjs','apps/api/src/automation-schema.sql','apps/web/app/page.js','automation/runner.py'):
        if not (dest/p).is_file():raise RuntimeError('Incomplete release: '+p)
def tree(root):
    return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file() and not any(part.startswith('.') for part in p.relative_to(root).parts)}
def restore_tree(src,dst):
    import shutil
    # Replace only release-owned source trees. Data, secrets and compose files stay.
    for name in ALLOWED:
        if (dst/name).exists():shutil.rmtree(dst/name)
        if (src/name).exists():shutil.copytree(src/name,dst/name)
def deploy(machine,payload):
    root=machine.root
    with tempfile.TemporaryDirectory(prefix='oak-release-') as tmp:
        src=pathlib.Path(tmp)/'incoming';src.mkdir();unpack(payload,src)
        if tree(root/'db')!=tree(src/'db'):raise RuntimeError('Database migration changed. Automatic deployment paused; review and test a migration first.')
        oldschema=root/'apps/api/src/automation-schema.sql'
        if oldschema.exists() and oldschema.read_bytes()!=(src/'apps/api/src/automation-schema.sql').read_bytes():raise RuntimeError('Sync schema changed; explicit migration required')
        subprocess.run(['python3','-m','unittest','discover','-s',str(src/'automation/tests')],check=True,cwd=src,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        machine.backup()
        previous=pathlib.Path(tmp)/'previous';previous.mkdir()
        import shutil
        replace_source=machine.cfg.get('role')=='vps'
        if replace_source:
            for name in ALLOWED:
                if (root/name).exists():shutil.copytree(root/name,previous/name,ignore=shutil.ignore_patterns('node_modules','.next','__pycache__','._*','.DS_Store'))
        # Save running image IDs under unique tags before builds overwrite tags.
        previous_images={}
        for service in ['api','web','ocr']+(['phone-cloud'] if machine.cfg.get('phone_cloud') else []):
            cid=machine.command(['ps','-q',service],text=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL).stdout.strip()
            if cid:
                image=subprocess.check_output(['docker','inspect','--format','{{.Image}}',cid],text=True).strip()
                tag='oak-rollback-'+str(os.getpid())+'-'+service
                subprocess.run(['docker','tag',image,tag],check=True);previous_images[service]={'image':tag}
        replace_source=machine.cfg.get('role')=='vps'
        if replace_source:
            for name in ALLOWED:
                if any(p.is_file() for p in (root/name).rglob('.env*')):raise RuntimeError('Nested environment file found; move server secrets outside release source before deployment')
            restore_tree(src,root)
        try:
            machine.assert_private()
            machine.command(['build','api','web','ocr']+(['phone-cloud'] if machine.cfg.get('phone_cloud') else []),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            machine.command(['up','-d','--no-build','--no-deps','api','web','ocr']+(['phone-cloud'] if machine.cfg.get('phone_cloud') else []),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            for attempt in range(30):
                try:machine.smoke();break
                except Exception:
                    if attempt==29:raise
                    time.sleep(2)
        except Exception as failure:
            log=root/'backups'/'last-deploy-error.log'
            log.write_bytes((getattr(failure,'stderr',b'') or str(failure).encode())[-100000:]);log.chmod(0o600)
            if replace_source:restore_tree(previous,root)
            rollback=root/'.oak-rollback-images.json';rollback.write_text(json.dumps({'services':previous_images}));os.chmod(rollback,0o600)
            try:machine.command(['-f',str(rollback),'up','-d','--no-build','--no-deps']+list(previous_images),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            finally:rollback.unlink(missing_ok=True)
            raise RuntimeError('Build/start/smoke failed; previous code and images restored. Inspect local deployment log.') from failure
        return {'ok':True,'release':payload['commit'],'sha256':payload['sha256']}
