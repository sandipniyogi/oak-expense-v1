import unittest,tempfile,pathlib,copy,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from merge import TABLES,fingerprint
from runner import sync,atomic

def blank():return {t:{} for t in TABLES}
class Peer:
 def __init__(self,rows):self.rows=copy.deepcopy(rows);self.schema=[];self.backups=0;self.fail=False;self.files={}
 def snap(self):return {'schema':self.schema,'rows':copy.deepcopy(self.rows),'digest':fingerprint({'schema':self.schema,'rows':self.rows})}
 def request(self,q):
  if q['op']=='snapshot':return self.snap()
  if q['op']=='digest':return {'digest':fingerprint({'schema':q['schema'],'rows':q['rows']})}
  if q['op']=='backup':self.backups+=1;return {'ok':True}
  if q['op']=='files':return self.files
  if q['op']=='apply':
   if self.fail:raise RuntimeError('Connection lost')
   if self.snap()['digest']==q['targetDigest']:return {'ok':True}
   if self.snap()['digest']!=q['expectedDigest']:raise RuntimeError('Concurrent change')
   self.rows=copy.deepcopy(q['rows']);return {'ok':True}
  raise AssertionError(q)
class RecoveryTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.state=pathlib.Path(self.tmp.name);self.a=Peer(blank());self.b=Peer(blank());sync(self.a,self.b,self.state)
 def tearDown(self):self.tmp.cleanup()
 def test_interrupted_after_first_commit_recovers(self):
  self.b.rows['expenses']['x']={'id':'x','amount':10};self.b.fail=True
  with self.assertRaises(RuntimeError):sync(self.a,self.b,self.state)
  self.assertTrue((self.state/'pending.json').exists());self.assertEqual(self.a.rows['expenses']['x']['amount'],10)
  self.b.fail=False;sync(self.a,self.b,self.state);self.assertFalse((self.state/'pending.json').exists());self.assertEqual(self.a.rows,self.b.rows)
 def test_new_edit_during_interruption_not_overwritten(self):
  self.b.rows['expenses']['x']={'id':'x','amount':10};self.b.fail=True
  with self.assertRaises(RuntimeError):sync(self.a,self.b,self.state)
  self.b.fail=False;self.a.rows['expenses']['x']['amount']=99
  with self.assertRaisesRegex(RuntimeError,'manual reconciliation'):sync(self.a,self.b,self.state)
  self.assertEqual(self.a.rows['expenses']['x']['amount'],99)
 def test_conflict_keeps_both(self):
  self.a.rows['expenses']['x']={'id':'x','amount':1};self.b.rows['expenses']['x']={'id':'x','amount':2}
  with self.assertRaisesRegex(RuntimeError,'conflicts'):sync(self.a,self.b,self.state)
  self.assertEqual(self.a.rows['expenses']['x']['amount'],1);self.assertEqual(self.b.rows['expenses']['x']['amount'],2)
 def test_schema_mismatch(self):
  self.b.schema=[{'column_name':'new'}]
  with self.assertRaisesRegex(RuntimeError,'Schemas differ'):sync(self.a,self.b,self.state)
 def test_dry_run_does_not_mutate(self):
  self.a.rows['expenses']['x']={'id':'x','amount':1};s=sync(self.a,self.b,self.state,True);self.assertTrue(s['vps_changes']);self.assertFalse(self.b.rows['expenses']);self.assertEqual(self.a.backups,0)
 def test_attachment_collision_blocks_before_records(self):
  self.a.rows['expenses']['x']={'id':'x','amount':1};self.a.files={'same':'aaa'};self.b.files={'same':'bbb'}
  with self.assertRaisesRegex(RuntimeError,'collision'):sync(self.a,self.b,self.state)
  self.assertFalse(self.b.rows['expenses'])
 def test_bootstrap_differences_require_review(self):
  (self.state/'baseline.json').unlink();self.a.rows['expenses']['x']={'id':'x','amount':1}
  with self.assertRaisesRegex(RuntimeError,'conflicts'):sync(self.a,self.b,self.state)
if __name__=='__main__':unittest.main()
