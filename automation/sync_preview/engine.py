"""Local disposable rehearsal: two real SQLite stores, no live connection."""
import json,sqlite3,threading
from pathlib import Path

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)
class Locked(RuntimeError):pass
class Engine:
 def __init__(self,root):
  self.root=Path(root);self.root.mkdir(parents=True,exist_ok=True);self.lock=threading.RLock();self.peers={}
  for peer in ('mac','vps'):
   db=sqlite3.connect(self.root/(peer+'.sqlite'),check_same_thread=False);db.execute('PRAGMA synchronous=FULL');db.execute('CREATE TABLE IF NOT EXISTS records(key TEXT PRIMARY KEY,value TEXT NOT NULL)');db.commit();self.peers[peer]=db
  self.control=sqlite3.connect(self.root/'control.sqlite',check_same_thread=False);self.control.execute('PRAGMA synchronous=FULL');self.control.execute('CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL)');self.control.commit()
  row=self.control.execute('SELECT data FROM state WHERE id=1').fetchone()
  if row:self.state=json.loads(row[0])
  else:
   initial={'expense:demo-1':canonical({'paid_by':'Sandip','description':'Demo supplies','amount':100}),'menu:demo-1':canonical({'name':'Demo dish','price':25})}
   if any(self.snapshot(p) for p in self.peers):raise Locked('Uninitialized stores contain records; refusing to overwrite')
   for peer in self.peers:self.replace(peer,initial)
   self.state={'version':1,'online':{'mac':True,'vps':True},'approved':{'mac':True,'vps':True},'base':initial,'pending':None,'message':'Ready. Local rehearsal only.'};self.persist()
  if self.state.get('version')!=1:raise Locked('Unsupported state')
 def snapshot(self,peer):return dict(self.peers[peer].execute('SELECT key,value FROM records ORDER BY key'))
 def replace(self,peer,rows):
  with self.peers[peer]:
   self.peers[peer].execute('DELETE FROM records');self.peers[peer].executemany('INSERT INTO records VALUES(?,?)',sorted(rows.items()))
 def persist(self):
  with self.control:self.control.execute('INSERT INTO state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',(canonical(self.state),))
 def available(self):
  if not all(self.state['online'].values()):raise Locked('Both rehearsal peers must be online')
  if not all(self.state['approved'].values()):raise Locked('Rehearsal code approval mismatch')
 def status(self):
  with self.lock:
   mac,vps=(self.snapshot(p) for p in ('mac','vps'));reason='Ready for one change'
   if self.state['pending']:reason='Interrupted sync: recover before editing'
   elif not all(self.state['online'].values()):reason='A rehearsal peer is offline'
   elif not all(self.state['approved'].values()):reason='Rehearsal code approval mismatch'
   elif mac!=vps or mac!=self.state['base']:reason='Check & Sync required'
   return {'rehearsal':True,'actual_vps_connected':False,'locked':reason!='Ready for one change','reason':reason,'message':self.state['message'],'online':self.state['online'],'approved':self.state['approved'],'rows':{p:{k:json.loads(v) for k,v in self.snapshot(p).items()} for p in self.peers},'pending':bool(self.state['pending'])}
 def edit(self,peer,key,value,delete=False,force=False):
  with self.lock:
   if peer not in self.peers or not key.startswith(('expense:','menu:')) or len(key)>80:raise ValueError('Invalid rehearsal record')
   if self.state['pending']:raise Locked('Recovery required')
   if not force:
    self.available()
    if self.status()['locked']:raise Locked('Check & Sync before changing data')
   with self.peers[peer]:
    if delete:self.peers[peer].execute('DELETE FROM records WHERE key=?',(key,))
    else:self.peers[peer].execute('INSERT INTO records VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,canonical(value)))
   self.state['message']='Demo change saved on '+peer+'. Sync before another edit.';self.persist()
 def plan(self):
  base=self.state['base'];mac=self.snapshot('mac');vps=self.snapshot('vps');merged={};conflicts=[]
  for key in sorted(set(base)|set(mac)|set(vps)):
   b,m,v=base.get(key),mac.get(key),vps.get(key)
   if m==v:chosen=m
   elif m==b:chosen=v
   elif v==b:chosen=m
   else:conflicts.append(key);continue
   if chosen is not None:merged[key]=chosen
  return merged,conflicts
 def sync(self,interrupt=False):
  with self.lock:
   self.available()
   if self.state['pending']:raise Locked('Recovery required')
   target,conflicts=self.plan()
   if conflicts:
    self.state['message']='Conflicts require a decision: '+', '.join(conflicts);self.persist();return {'conflicts':conflicts,'changed':False}
   self.state['pending']={'before':{p:self.snapshot(p) for p in self.peers},'target':target};self.persist()
   self.replace('mac',target)
   if interrupt:raise Locked('Simulated interruption after Mac apply; recover to finish VPS apply')
   self.replace('vps',target);self.finish();return {'conflicts':[],'changed':True}
 def finish(self):
  target=self.state['pending']['target']
  if any(self.snapshot(p)!=target for p in self.peers):raise Locked('Verification failed; pending journal retained')
  self.state['base']=target;self.state['pending']=None;self.state['message']='Both rehearsal stores verified. Ready for one change.';self.persist()
 def recover(self):
  with self.lock:
   self.available();pending=self.state['pending']
   if not pending:return {'recovered':False}
   for peer in self.peers:
    current=self.snapshot(peer)
    if current not in (pending['before'][peer],pending['target']):raise Locked('Unexpected data during recovery; no overwrite allowed')
   for peer in self.peers:self.replace(peer,pending['target'])
   self.finish();return {'recovered':True}
 def switch(self,peer,field,value):
  with self.lock:
   if peer not in self.peers or field not in ('online','approved') or not isinstance(value,bool):raise ValueError('Invalid fixture switch')
   self.state[field][peer]=value;self.persist()
 def resolve(self,key,source):
  with self.lock:
   self.available()
   if self.state['pending']:raise Locked('Recovery required')
   _,conflicts=self.plan()
   if key not in conflicts or source not in self.peers:raise Locked('Choose an existing conflict and peer')
   # Explicit selection is journaled before either side is changed.
   chosen=self.snapshot(source).get(key);before={p:self.snapshot(p) for p in self.peers}
   target={p:dict(before[p]) for p in self.peers}
   for rows in target.values():
    if chosen is None:rows.pop(key,None)
    else:rows[key]=chosen
   # Resolve one key by changing the baseline to the opposite peer's old value.
   # No peer data is changed here; the standard plan now chooses the selected side.
   other='vps' if source=='mac' else 'mac'
   old=before[other].get(key)
   if old is None:self.state['base'].pop(key,None)
   else:self.state['base'][key]=old
   self.state['message']='Selected '+source+' for '+key+'. Click Check & Sync to apply.';self.persist()
 def close(self):
  for db in [*self.peers.values(),self.control]:db.close()
