#!/usr/bin/env python3
"""Restricted read-only host verifier. JSON stdin; hashes only on stdout."""
import decimal,hashlib,json,os,pathlib,re,subprocess,sys
ROLES={'mac':'oak-expense-v1','vps':'oak-vps'}
CURRENT_STAGE='initialization'
MODULES={'api','web','ocr','phone','inventory-api','keg-api','social-api','oak-ai','restaurant'}
POLICY={'oak_inv_categories':(['name'],['id','created_at']), 'oak_inv_locations':(['name'],['id','created_at']), 'oak_social_brand':(['id'],['updated_at']), 'oak_social_agent_settings':(['id'],['updated_at']), 'oak_sync_tombstones':(['table_name','row_id'],['deleted_at'])}
SITE_POLICY={'menu':(['category','name'],['id','updated_at']),'events':(['title'],['id','updated_at']),'migrations':(['id'],['applied_at'])}
def stable(v):
 if v is None:return 'null'
 if v is True:return 'true'
 if v is False:return 'false'
 if isinstance(v,decimal.Decimal):return format(v,'f')
 if isinstance(v,(int,float)):return json.dumps(v,allow_nan=False)
 if isinstance(v,str):return json.dumps(v,ensure_ascii=False)
 if isinstance(v,list):return '['+','.join(map(stable,v))+']'
 if isinstance(v,dict):return '{'+','.join(json.dumps(k)+':'+stable(v[k]) for k in sorted(v))+'}'
 raise ValueError('Unsupported snapshot type')
def digest(v):return hashlib.sha256(stable(v).encode()).hexdigest()
def normalize(tables,policy,fks):
 maps={};seen={}
 for table,(keys,omit) in policy.items():
  maps[table]={};seen[table]=set()
  for row in tables.get(table,[]):
   if any(k not in row or row[k] is None for k in keys):raise RuntimeError('missing_identity:'+table)
   key=digest([row[k] for k in keys])
   if key in seen[table]:raise RuntimeError('ambiguous_identity:'+table)
   seen[table].add(key)
   if 'id' in row:maps[table][str(row['id'])]=key
 result={}
 for table,rows in tables.items():
  result[table]=[]
  for original in rows:
   row=dict(original)
   for fk in fks:
    if fk['table']!=table or fk['references'] not in policy:continue
    if len(fk['columns'])!=1 or fk['referencedColumns']!=['id']:raise RuntimeError('unsupported_foreign_key')
    column=fk['columns'][0]
    if row.get(column) is not None:
     key=maps[fk['references']].get(str(row[column]))
     if key is None:raise RuntimeError('unmapped_foreign_key:'+table)
     row[column]={'entity':fk['references'],'key':key}
   if table in policy:
    for column in policy[table][1]:row.pop(column,None)
   result[table].append(stable(row))
  result[table].sort()
 return result

def run(args,stdin=None):
 p=subprocess.run(args,input=stdin,text=True,capture_output=True,timeout=180)
 if p.returncode:raise RuntimeError('inspection_failed:'+CURRENT_STAGE)
 return p.stdout

def names(role):
 prefix=ROLES[role];result={s:prefix+'-'+s+'-1' for s in MODULES}
 result['phone']=prefix+('-phone-queue-1' if role=='mac' else '-phone-cloud-1')
 result['restaurant']='oak-restaurant-live-website-1' if role=='mac' else 'oak-restaurant-website-1'
 return result

def verify(role,q):
 global CURRENT_STAGE
 if q.get('op')!='verify' or not re.fullmatch(r'[a-f0-9]{32}',q.get('nonce','')):raise RuntimeError('invalid_request')
 expected=q.get('expected',{})
 if set(expected)!=MODULES:raise RuntimeError('incomplete_source_scope')
 containers=names(role);code={};guards={}
 node=r"""const fs=require('fs'),p=require('path'),c=require('crypto');const root="/app";let raw='';process.stdin.on('data',x=>raw+=x);process.stdin.on('end',()=>{const files={},errors={};for(const name of JSON.parse(raw)){try{const file=p.join(root,name);let at=root;for(const part of name.split('/')){at=p.join(at,part);if(fs.lstatSync(at).isSymbolicLink()){const e=Error('symlink refused');e.code='SYMLINK_REFUSED';throw e}}files[name]=c.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}catch(e){files[name]=null;errors[name]=['ENOENT','EACCES','EPERM','EISDIR','ENOTDIR','SYMLINK_REFUSED'].includes(e.code)?e.code:'READ_FAILED'}}console.log(JSON.stringify({files,errors}))});"""
 py="import json,sys,pathlib,hashlib;files={};errors={};\nfor name in json.load(sys.stdin):\n p=pathlib.Path('/app',name)\n try:\n  if any(x.is_symlink() for x in [p,*p.parents]):raise RuntimeError('SYMLINK_REFUSED')\n  files[name]=hashlib.sha256(p.read_bytes()).hexdigest()\n except (OSError,RuntimeError) as e:\n  files[name]=None;errors[name]=type(e).__name__\nprint(json.dumps({'files':files,'errors':errors}))"
 for service,manifest in expected.items():
  CURRENT_STAGE='source:'+service
  if not manifest or len(manifest)>5000:raise RuntimeError('invalid_source_manifest')
  for name,checksum in manifest.items():
   parts=pathlib.PurePosixPath(name).parts
   if name.startswith('/') or '..' in parts or any(p.startswith('.') or p in ['node_modules','data','backups','storage','uploads'] for p in parts) or not re.fullmatch('[a-f0-9]{64}',checksum):raise RuntimeError('unsafe_source_path')
   allowed=name in ['package.json','next.config.mjs','server.js','server.mjs','app.py','requirements.txt'] or (service=='phone' and name.startswith('public/')) or (service=='restaurant' and name.startswith(('scripts/','public/'))) or (service=='web' and name.startswith('app/')) or name.startswith('src/')
   if not allowed:raise RuntimeError('source_path_not_allowed')
  obj=json.loads(run(['docker','inspect',containers[service]]))[0]
  if not obj['State']['Running']:raise RuntimeError('service_offline:'+service)
  env=dict(x.split('=',1) for x in obj['Config'].get('Env',[]) if '=' in x)
  guards[service]=env.get('OAK_STRICT_SYNC')=='1'
  probe=['python3','-c',py] if service=='ocr' else ['node','-e',node]
  record=json.loads(run(['docker','exec','-i',containers[service],*probe],json.dumps(list(manifest))))
  actual=record['files'];errors=record['errors']
  code[service]={'ok':actual==manifest and not errors,'different_files':[f for f,h in manifest.items() if actual.get(f)!=h],'file_errors':errors}
 CURRENT_STAGE='postgres_snapshot'
 # No temp functions, DDL, sequence mutation or business-data writes.
 sql=r"""BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format($q$SELECT jsonb_build_object('table',%L,'rows',coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb)) FROM public.%I r;$q$,tablename,tablename) FROM pg_tables WHERE schemaname='public' ORDER BY tablename
\gexec
SELECT jsonb_build_object('columns',coalesce(jsonb_agg(to_jsonb(x) ORDER BY table_name,ordinal_position),'[]'::jsonb)) FROM (SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public') x;
SELECT jsonb_build_object('constraints',coalesce(jsonb_agg(to_jsonb(x) ORDER BY tab,name),'[]'::jsonb)) FROM (SELECT r.relname tab,c.conname name,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public') x;
SELECT jsonb_build_object('fks',coalesce(jsonb_agg(to_jsonb(x) ORDER BY "table",name),'[]'::jsonb)) FROM (SELECT r.relname "table",c.conname name,rr.relname "references",ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(num,pos) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.pos) columns,ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(num,pos) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.pos) "referencedColumns" FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_class rr ON rr.oid=c.confrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE c.contype='f' AND n.nspname='public') x;
SELECT jsonb_build_object('triggers',coalesce(jsonb_agg(to_jsonb(x) ORDER BY tab,name),'[]'::jsonb)) FROM (SELECT r.relname tab,t.tgname name,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) x;
ROLLBACK;"""
 raw=run(['docker','exec','-i',ROLES[role]+'-db-1','sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],sql)
 tables={};schema={}
 for line in raw.splitlines():
  row=json.loads(line,parse_float=decimal.Decimal)
  if 'table' in row:tables[row['table']]=row['rows']
  else:schema.update(row)
 if set(schema)!=set(['columns','constraints','fks','triggers']):raise RuntimeError('incomplete_schema')
 normalized=normalize(tables,POLICY,schema['fks'])
 # Referenced screenshot manifest verifies missing files and collisions through existing bridge.
 CURRENT_STAGE='referenced_expense_files'
 bridge=json.loads(run(['docker','exec','-i',containers['api'],'node','src/automation-bridge.mjs'],json.dumps({'op':'files'})))
 if 'error' in bridge:raise RuntimeError('referenced_attachment_check_failed')
 screenshots=bridge['result']
 site_js=r"""const {DatabaseSync}=require('node:sqlite'),p=require('path'),fs=require('fs'),c=require('crypto');const root=process.env.DATA_DIR||'/data';const db=new DatabaseSync(p.join(root,'restaurant.sqlite'),{readOnly:true});const tables={};db.exec('BEGIN');try{for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){if(['sessions','audit','instagram_cache'].includes(name))continue;tables[name]=db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all();}db.exec('COMMIT')}finally{db.close()}const refs=new Set();function visit(value){if(typeof value==='string'&&value.startsWith('/media/'))refs.add(value);else if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')Object.values(value).forEach(visit)}for(const [name,rows] of Object.entries(tables))for(const r of rows){visit(r);if(name==='settings'&&typeof r.data==='string')visit(JSON.parse(r.data));}const files={};for(const ref of refs){if(!/^\/media\/[a-f0-9-]+\.(jpg|png|webp)$/.test(ref))throw Error('invalid media reference');const file=p.join(root,'uploads',p.basename(ref));if(fs.lstatSync(file).isSymbolicLink())throw Error('symlink refused');files[ref]=c.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}console.log(JSON.stringify({tables,files}));"""
 CURRENT_STAGE='restaurant_content_and_media'
 site=json.loads(run(['docker','exec',containers['restaurant'],'node','-e',site_js]),parse_float=decimal.Decimal)
 site_normalized=normalize(site['tables'],SITE_POLICY,[])
 file_js=r"""const fs=require('fs'),p=require('path'),c=require('crypto');const root=process.env.SOCIAL_STORAGE_ROOT||'/app/storage',entries=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=p.join(dir,e.name);if(e.isSymbolicLink())throw Error('symlink refused');if(e.isDirectory())walk(file);else if(e.isFile())entries.push([p.relative(root,file),c.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);else throw Error('special file refused')}}for(const name of ['assets','thumbs','renders','exports'])walk(p.join(root,name));entries.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);console.log(JSON.stringify({count:entries.length,digest:c.createHash('sha256').update(JSON.stringify(entries)).digest('hex')}));"""
 CURRENT_STAGE='social_files'
 social=json.loads(run(['docker','exec',containers['social-api'],'node','-e',file_js]))
 scope={'postgres':{t:digest(v) for t,v in normalized.items()},'schema':digest(schema),'restaurant':{t:digest(v) for t,v in site_normalized.items()},'expense_screenshots':digest(screenshots),'restaurant_media':digest(site['files']),'social_files':social['digest']}
 return {'nonce':q['nonce'],'role':role,'online':True,'source':code,'scope':scope,'digest':digest(scope),'counts':{'postgres':{t:len(v) for t,v in tables.items()},'restaurant':{t:len(v) for t,v in site['tables'].items()},'screenshots':len(screenshots),'social_files':social['count']},'guards_enabled':guards,'production_write_fencing':False,'verification_only':True}

def main():
 role=sys.argv[1] if len(sys.argv)>1 else ''
 if role not in ROLES:raise RuntimeError('invalid_role')
 if role=='vps' and os.environ.get('SSH_ORIGINAL_COMMAND') not in (None,'','oak-strict-verify'):raise RuntimeError('unsupported_ssh_command')
 raw=sys.stdin.buffer.read(2*1024*1024+1)
 if len(raw)>2*1024*1024:raise RuntimeError('request_too_large')
 print(json.dumps(verify(role,json.loads(raw))))
if __name__=='__main__':
 try:main()
 except Exception as e:
  print(json.dumps({'online':False,'verification_only':True,'error':str(e) if isinstance(e,RuntimeError) else type(e).__name__}));sys.exit(1)
