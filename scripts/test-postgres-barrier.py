#!/usr/bin/env python3
"""Test PostgreSQL fencing in a NEW disposable database. No live/staging data copied."""
import argparse,json,pathlib,re,subprocess,sys,time,uuid

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--project',required=True);args=parser.parse_args()
 root=pathlib.Path(args.project).resolve();container='oak-expense-staging-db-1';database='oak_guard_test_'+uuid.uuid4().hex[:16]
 if not re.fullmatch(r'oak_guard_test_[0-9a-f]{16}',database):raise RuntimeError('Invalid disposable database name')
 def command(args,**kwargs):return subprocess.run(args,text=True,capture_output=True,timeout=40,**kwargs)
 owner=command(['docker','exec',container,'sh','-c','printf "%s" "$POSTGRES_USER"'])
 if owner.returncode or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]*',owner.stdout):raise RuntimeError('Staging database unavailable; no test database created')
 user=owner.stdout
 base=['docker','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',user,'-d',database]
 def sql(text,expected_error=None):
  p=command(base,input=text)
  if expected_error:
   if p.returncode==0 or expected_error not in p.stderr:raise RuntimeError('Expected protected operation to fail: '+expected_error)
  elif p.returncode:raise RuntimeError('Disposable test SQL failed: '+p.stderr[-1800:])
  return p.stdout.strip()
 created=False;writer=None
 try:
  create=command(['docker','exec',container,'createdb','-U',user,database])
  if create.returncode:raise RuntimeError('Could not create disposable database; existing data not changed')
  created=True
  print('Disposable test database:',database,flush=True)
  sql('CREATE TABLE public.expenses(id integer PRIMARY KEY,amount numeric NOT NULL); INSERT INTO public.expenses VALUES(1,10);')
  sql((root/'services/strict-sync/sql/postgres-barrier.sql').read_text())
  sql('INSERT INTO public.expenses VALUES(2,20);','STRICT_SYNC_WRITE_LOCKED');print('PASS: direct INSERT blocked without a permit',flush=True)
  sql('UPDATE public.expenses SET amount=20;','STRICT_SYNC_WRITE_LOCKED');print('PASS: direct UPDATE blocked',flush=True)
  sql('DELETE FROM public.expenses;','STRICT_SYNC_WRITE_LOCKED');print('PASS: direct DELETE blocked',flush=True)
  sql('TRUNCATE public.expenses;','STRICT_SYNC_WRITE_LOCKED');print('PASS: TRUNCATE blocked',flush=True)
  sql('CREATE TABLE public.bypass(id integer);','STRICT_SYNC_DDL_LOCKED');print('PASS: new unguarded tables cannot be created',flush=True)
  if sql('SELECT count(*) FROM public.expenses;')!='1':raise RuntimeError('Read-only query failed')
  print('PASS: browsing queries still work',flush=True)
  operation=str(uuid.uuid4());epoch=sql("SELECT oak_guard.begin_application('"+operation+"');")
  if not epoch.isdigit():raise RuntimeError('Invalid epoch')
  def context(op,gen,mode='application'):
   return "SELECT set_config('oak_guard.operation','"+op+"',true);SELECT set_config('oak_guard.generation','"+gen+"',true);SELECT set_config('oak_guard.mode','"+mode+"',true);"
  sql('BEGIN;'+context(operation,epoch)+'UPDATE public.expenses SET amount=11 WHERE id=1;COMMIT;')
  if sql('SELECT amount FROM public.expenses WHERE id=1;')!='11':raise RuntimeError('Authorized write not committed')
  print('PASS: current application permit authorizes a write',flush=True)
  sql("SELECT oak_guard.begin_application('"+str(uuid.uuid4())+"');",'STRICT_SYNC_OPERATION_BUSY')
  print('PASS: a second application operation cannot replace the active permit',flush=True)
  # Keep a real transaction open after its update. The second connection must
  # time out attempting freeze until the writer commits or rolls back.
  writer=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  writer.stdin.write('BEGIN;'+context(operation,epoch)+"UPDATE public.expenses SET amount=12 WHERE id=1;SELECT 'WRITER_HOLDS_BARRIER';\n");writer.stdin.flush()
  # Read readiness without sleeping or depending on a timing guess.
  # psql emits multiple context rows; use a temporary readiness SELECT via the
  # lock catalog below rather than buffered line reads on its output pipe.
  ready=False;deadline=time.monotonic()+10
  while time.monotonic()<deadline:
   ready=sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND mode='ShareLock' AND granted;")!='0'
   if ready:break
   time.sleep(.05)
  if not ready:raise RuntimeError('Writer did not acquire test barrier')
  sql("SET statement_timeout='600ms'; SELECT oak_guard.freeze();",'statement timeout')
  print('PASS: freeze waits for an in-flight writer',flush=True)
  writer.stdin.write('COMMIT;\n');writer.stdin.close();writer.stdin=None
  output,error=writer.communicate(timeout=10)
  if writer.returncode:raise RuntimeError('Test writer failed: '+error[-1000:])
  writer=None
  sql('SELECT oak_guard.freeze();')
  sql('BEGIN;'+context(operation,epoch)+'UPDATE public.expenses SET amount=99 WHERE id=1;COMMIT;','STRICT_SYNC_WRITE_LOCKED')
  print('PASS: old permits cannot write after freeze',flush=True)
  sync=str(uuid.uuid4());sync_epoch=sql("SELECT oak_guard.begin_synchronization('"+sync+"');")
  sql('BEGIN;'+context(sync,sync_epoch,'synchronization')+'UPDATE public.expenses SET amount=13 WHERE id=1;COMMIT;')
  print('PASS: separate synchronization permit works while application writes remain frozen',flush=True)
  sql('SELECT oak_guard.freeze();')
  sql('BEGIN;'+context(sync,sync_epoch,'synchronization')+'UPDATE public.expenses SET amount=99 WHERE id=1;COMMIT;','STRICT_SYNC_WRITE_LOCKED')
  print('PASS: synchronization permit is fenced after completion',flush=True)
  print('PASS: PostgreSQL barrier tests completed. No shared write gate or replication was enabled.',flush=True)
 finally:
  if writer is not None:
   writer.kill()
   try:writer.communicate(timeout=5)
   except Exception:pass
  if created:
   drop=command(['docker','exec',container,'dropdb','--force','-U',user,database])
   if drop.returncode:print('Cleanup needed for disposable database ONLY: '+database,file=sys.stderr)
   else:print('Disposable test database removed.',flush=True)
if __name__=='__main__':
 try:main()
 except (RuntimeError,OSError,subprocess.SubprocessError) as e:raise SystemExit(str(e))
