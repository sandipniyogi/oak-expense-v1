#!/usr/bin/env python3
"""Read-only detailed classification; never reconcile records or enable writes."""
import argparse,json,subprocess,sys,shlex
AGENT=r'''
import json,subprocess,sys
q=json.load(sys.stdin);prefix='oak-expense-v1' if q['role']=='mac' else 'oak-vps';step='postgres'
def call(args,stdin=None):
 p=subprocess.run(args,input=stdin,text=True,capture_output=True,timeout=180)
 if p.returncode:raise RuntimeError('Inspection failed')
 return p.stdout
try:
 sql="BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
 for table,keys in [('oak_inv_categories',['name']),('oak_inv_locations',['name']),('oak_social_agent_settings',[]),('oak_social_brand',[]),('oak_sync_tombstones',['table_name','row_id'])]:
  key='jsonb_build_array('+','.join('r."'+k+'"' for k in keys)+')' if keys else "'[]'::jsonb"
  sql+="SELECT jsonb_build_object('table','"+table+"','rows',coalesce(jsonb_agg(jsonb_build_object('key',md5(("+key+")::text),'fields',(SELECT jsonb_object_agg(key,md5(value::text)) FROM jsonb_each(to_jsonb(r))))),'[]'::jsonb)) FROM public.\""+table+'" r;\n'
 sql+='ROLLBACK;'
 raw=call(['docker','exec','-i',prefix+'-db-1','sh','-c','exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'],sql)
 postgres={}
 for line in raw.splitlines():
  r=json.loads(line);postgres[r['table']]=r['rows']
 step='restaurant'
 js="""const {DatabaseSync}=require('node:sqlite'),p=require('path'),c=require('crypto');const db=new DatabaseSync(p.join(process.env.DATA_DIR||'/data','restaurant.sqlite'),{readOnly:true});function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v)}const hash=v=>c.createHash('sha256').update(stable(v)).digest('hex');const out={};db.exec('BEGIN');try{for(const [table,keys] of [['menu',['category','name']],['events',['title']],['migrations',['id']]])out[table]=db.prepare('SELECT * FROM '+table).all().map(r=>({key:hash(keys.map(k=>r[k])),fields:Object.fromEntries(Object.entries(r).map(([k,v])=>[k,hash(v)]))}));db.exec('COMMIT')}finally{db.close()}console.log(JSON.stringify(out));"""
 restaurant=json.loads(call(['docker','exec','oak-restaurant-live-website-1' if q['role']=='mac' else 'oak-restaurant-website-1','node','-e',js]))
 step='referenced-screenshots'
 bridge=json.loads(call(['docker','exec','-i',prefix+'-api-1','node','src/automation-bridge.mjs'],json.dumps({'op':'files'})))
 if 'error' in bridge:raise RuntimeError('Referenced attachment verification failed')
 referenced=bridge['result']
 # The bridge checks existence and content of every currently referenced screenshot.
 # File names are used locally to count extras, never printed in the final report.
 js="""const fs=require('fs'),p=require('path');const root=process.env.UPLOAD_DIR||'/app/uploads';console.log(JSON.stringify(fs.readdirSync(root).filter(n=>{const s=fs.lstatSync(p.join(root,n));return s.isFile()&&!s.isSymbolicLink()})));"""
 names=json.loads(call(['docker','exec',prefix+'-api-1','node','-e',js]))
 print(json.dumps({'postgres':postgres,'restaurant':restaurant,'referenced':referenced,'unreferenced_regular_files':len(set(names)-set(referenced))}))
except Exception as e:
 print(json.dumps({'error':'Read-only check incomplete','step':step,'type':type(e).__name__}));sys.exit(1)
'''
META={'id','created_at','updated_at','applied_at','deleted_at'}
def classify(a,b):
 left={};right={}
 for rows,index in [(a,left),(b,right)]:
  for row in rows:
   if row['key'] in index:return {'ambiguous_match':True,'note':'Duplicate comparison key; manual inspection required.'}
   index[row['key']]=row['fields']
 common=set(left)&set(right);fields=set();different=0
 for key in common:
  delta={f for f in set(left[key])|set(right[key]) if left[key].get(f)!=right[key].get(f)}
  fields|=delta;different+=bool(delta)
 return {'mac_rows':len(a),'vps_rows':len(b),'unmatched_mac_rows':len(set(left)-set(right)),
         'unmatched_vps_rows':len(set(right)-set(left)),'matched_rows_with_differences':different,
         'different_fields':sorted(fields),'non_metadata_different_fields':sorted(fields-META),
         'note':'IDs/timestamps are reported separately; this does not authorize ignoring them.'}
def collect(role,host):
 command=[sys.executable,'-c',AGENT] if role=='mac' else ['ssh','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',host,'python3 -c '+shlex.quote(AGENT)]
 print('Inspecting '+role+' differences, read only…',file=sys.stderr,flush=True)
 p=subprocess.run(command,input=json.dumps({'role':role}),text=True,capture_output=True,timeout=600)
 try:d=json.loads(p.stdout)
 except ValueError:raise RuntimeError(role+': connection or inspection failed') from None
 if p.returncode or 'error' in d:raise RuntimeError(role+': '+d.get('error','Inspection failed')+' at '+d.get('step','connection'))
 return d

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--ssh-host',default='root@162.35.33.141');args=p.parse_args()
 a=collect('mac',args.ssh_host);b=collect('vps',args.ssh_host)
 out={'postgres':{t:classify(a['postgres'][t],b['postgres'][t]) for t in a['postgres']},
      'restaurant':{t:classify(a['restaurant'][t],b['restaurant'][t]) for t in a['restaurant']},
      'expense_screenshots':{'referenced_files_match':a['referenced']==b['referenced'],
       'mac_referenced_count':len(a['referenced']),'vps_referenced_count':len(b['referenced']),
       'mac_unreferenced_regular_files':a['unreferenced_regular_files'],
       'vps_unreferenced_regular_files':b['unreferenced_regular_files']},
      'write_permission_granted':False,'data_changed':False,
      'note':'Sequential read-only observations. No records or files reconciled. No strict lock installed.'}
 print(json.dumps(out,indent=2))
if __name__=='__main__':
 try:main()
 except (RuntimeError,subprocess.SubprocessError,OSError,ValueError,KeyError) as e:
  print(json.dumps({'data_changed':False,'write_permission_granted':False,'error':str(e) if isinstance(e,RuntimeError) else type(e).__name__}));sys.exit(1)
