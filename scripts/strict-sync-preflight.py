#!/usr/bin/env python3
"""Read-only live inventory. Does not synchronize data or grant write permission."""
import argparse, hashlib, json, pathlib, shlex, subprocess, sys
SERVICES={
 'api':('apps/api',['package.json','src/']),
 'web':('apps/web',['package.json','next.config.mjs','app/']),
 'inventory-api':('services/inventory-api',['package.json','src/']),
 'keg-api':('services/keg-api',['package.json','src/']),
 'social-api':('services/social-api',['package.json','src/']),
 'oak-ai':('services/oak-ai',['package.json','src/']),
 'phone':('services/phone-queue',['server.js','public/']),
 'restaurant':('restaurant',['package.json','server.mjs','scripts/','public/']),
 'ocr':('services/ocr',['requirements.txt','app.py'])}
AGENT=r'''
import json,subprocess,sys
q=json.load(sys.stdin)
step='initialization'
def call(args,stdin=None):
 p=subprocess.run(args,input=stdin,text=True,capture_output=True,timeout=180)
 if p.returncode:raise RuntimeError('Inspection command failed')
 return p.stdout
try:
 prefix='oak-expense-v1' if q['role']=='mac' else 'oak-vps'
 names={s:prefix+'-'+s+'-1' for s in q['expected']}
 names['phone']=prefix+('-phone-queue-1' if q['role']=='mac' else '-phone-cloud-1')
 names['restaurant']='oak-restaurant-live-website-1' if q['role']=='mac' else 'oak-restaurant-website-1'
 node="""const fs=require('fs'),c=require('crypto');let raw='';process.stdin.on('data',x=>raw+=x);process.stdin.on('end',()=>{const out={};for(const f of JSON.parse(raw)){try{out[f]=c.createHash('sha256').update(fs.readFileSync('/app/'+f)).digest('hex')}catch{out[f]=null}}console.log(JSON.stringify(out))});"""
 python="import json,sys,pathlib,hashlib;out={};\nfor f in json.load(sys.stdin):\n try:out[f]=hashlib.sha256(pathlib.Path('/app',f).read_bytes()).hexdigest()\n except OSError:out[f]=None\nprint(json.dumps(out))"
 code={}
 for service,expected in q['expected'].items():
  step='source:'+service
  obj=json.loads(call(['docker','inspect',names[service]]))[0]
  if not obj['State']['Running']:raise RuntimeError('Not running')
  probe=['python3','-c',python] if service=='ocr' else ['node','-e',node]
  actual=json.loads(call(['docker','exec','-i',names[service],*probe],json.dumps(list(expected))))
  code[service]={'matches_approved_git':actual==expected,'different_files':[f for f,h in expected.items() if actual.get(f)!=h]}
 step='postgres'
 sql=r"""BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format($query$SELECT jsonb_build_object('table',%L,'count',count(*),'digest',md5(coalesce(string_agg(v,chr(10) ORDER BY v COLLATE "C"),''))) FROM (SELECT to_jsonb(r)::text v FROM public.%I r) x;$query$,tablename,tablename)
FROM pg_tables WHERE schemaname='public' ORDER BY tablename
\gexec
SELECT jsonb_build_object('columns',
 (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY table_name,ordinal_position),'[]'::jsonb) FROM
 (SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
 FROM information_schema.columns WHERE table_schema='public') x));
ROLLBACK;"""
 raw=call(['docker','exec','-i',prefix+'-db-1','sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],sql)
 postgres={'tables':{},'columns':None}
 for line in raw.splitlines():
  row=json.loads(line)
  if 'table' in row:postgres['tables'][row['table']]={'count':row['count'],'digest':row['digest']}
  elif 'columns' in row:postgres['columns']=row['columns']
 if postgres['columns'] is None:raise RuntimeError('Incomplete inventory')
 files_js="""const fs=require('fs'),path=require('path'),c=require('crypto');const base=process.argv[1],entries=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('Symlink refused');if(e.isDirectory())walk(f);else if(e.isFile())entries.push([path.relative(base,f),c.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]);else throw Error('Special file refused')}}walk(base);entries.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);console.log(JSON.stringify({count:entries.length,digest:c.createHash('sha256').update(JSON.stringify(entries)).digest('hex')}));"""
 files={}
 for key,service,path in [('expense_uploads','api','/app/uploads'),('social_storage','social-api',None),('restaurant_uploads','restaurant',None)]:
  step='files:'+key
  if path is None:
   env=dict(x.split('=',1) for x in json.loads(call(['docker','inspect',names[service]]))[0]['Config']['Env'] if '=' in x)
   path=env.get('SOCIAL_STORAGE_ROOT','/app/storage') if service=='social-api' else env.get('DATA_DIR','/data')+'/uploads'
  files[key]=json.loads(call(['docker','exec',names[service],'node','-e',files_js,path]))
 step='restaurant-content'
 site_js="""const {DatabaseSync}=require('node:sqlite'),p=require('path'),c=require('crypto');const db=new DatabaseSync(p.join(process.env.DATA_DIR||'/data','restaurant.sqlite'),{readOnly:true});function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v)}const result={};db.exec('BEGIN');try{for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){if(['sessions','audit','instagram_cache'].includes(name))continue;const quoted='"'+name.replaceAll('"','""')+'"';const rows=db.prepare('SELECT * FROM '+quoted).all().map(stable).sort();result[name]={count:rows.length,digest:c.createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}db.exec('COMMIT')}finally{db.close()}console.log(JSON.stringify(result));"""
 restaurant=json.loads(call(['docker','exec',names['restaurant'],'node','-e',site_js]))
 print(json.dumps({'code':code,'postgres':postgres,'files':files,'restaurant':restaurant}))
except Exception as e:
 print(json.dumps({'error':'Inspection incomplete','step':step,'type':type(e).__name__}))
 sys.exit(1)
'''
def call(args,**kw):
 p=subprocess.run(args,capture_output=True,text=True,timeout=900,**kw)
 if p.returncode:
  try:
   problem=json.loads(p.stdout)
   if problem.get('step'):raise RuntimeError('Inspection failed at '+problem['step']+' ('+problem.get('type','unknown')+')')
  except (ValueError,AttributeError):pass
  raise RuntimeError('Command failed; check Git, SSH or Docker connectivity. No data changed.')
 return p.stdout

def differences(a,b):return sorted(k for k in set(a)|set(b) if a.get(k)!=b.get(k))
def compare(a,b):
 code={role:[s for s,v in r['code'].items() if not v['matches_approved_git']] for role,r in [('mac',a),('vps',b)]}
 d={'postgres_schema_matches':a['postgres']['columns']==b['postgres']['columns'],
    'different_postgres_tables':differences(a['postgres']['tables'],b['postgres']['tables']),
    'different_file_stores':differences(a['files'],b['files']),
    'different_restaurant_tables':differences(a['restaurant'],b['restaurant']),
    'code_mismatches':code}
 d['observed_match']=d['postgres_schema_matches'] and not any([d['different_postgres_tables'],d['different_file_stores'],d['different_restaurant_tables'],*code.values()])
 return d

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--project',required=True);p.add_argument('--ssh-host',default='root@162.35.33.141');args=p.parse_args()
 root=pathlib.Path(args.project).resolve()
 print('Fetching approved Git main…',file=sys.stderr,flush=True)
 call(['git','fetch','origin','main'],cwd=root)
 approved=call(['git','rev-parse','origin/main'],cwd=root).strip();expected={}
 for service,(folder,selectors) in SERVICES.items():
  paths=call(['git','ls-tree','-r','--name-only',approved,'--',folder],cwd=root).splitlines();expected[service]={}
  for name in paths:
   relative=name[len(folder)+1:]
   if not any(relative==s or (s.endswith('/') and relative.startswith(s)) for s in selectors):continue
   content=subprocess.run(['git','show',approved+':'+name],cwd=root,check=True,capture_output=True).stdout
   expected[service][relative]=hashlib.sha256(content).hexdigest()
  if not expected[service]:raise RuntimeError('Approved source missing: '+service)
 results={}
 for role in ('mac','vps'):
  print('Checking '+role+' live, read only…',file=sys.stderr,flush=True)
  command=[sys.executable,'-c',AGENT] if role=='mac' else ['ssh','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',args.ssh_host,'python3 -c '+shlex.quote(AGENT)]
  try:results[role]=json.loads(call(command,input=json.dumps({'role':role,'expected':expected})))
  except RuntimeError as e:raise RuntimeError(role+': '+str(e)) from None
 report={'approved_git_commit':approved,**compare(results['mac'],results['vps']),
         'write_permission_granted':False,
         'note':'Read-only sequential observations, not a lock or an atomic sync proof.',
         'excluded_restaurant_local_state':['sessions','audit','instagram_cache'],
         'limitations':['Constraints, sequences and SQL functions are not compared.',
                        'Dependencies and compiled frontend configuration are not compared.',
                        'Concurrent or later writes can invalidate these observations.']}
 print(json.dumps(report,indent=2));return 0 if report['observed_match'] else 2
if __name__=='__main__':
 try:sys.exit(main())
 except (RuntimeError,subprocess.SubprocessError,OSError,ValueError,KeyError) as e:
  message=str(e) if isinstance(e,RuntimeError) else type(e).__name__
  print(json.dumps({'observed_match':False,'write_permission_granted':False,'error':message}));sys.exit(1)
