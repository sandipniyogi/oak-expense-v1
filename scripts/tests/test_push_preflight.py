import unittest,importlib.util,pathlib,tempfile,subprocess,copy
from unittest.mock import patch
FILE=pathlib.Path(__file__).resolve().parents[1]/'preflight-push.py';spec=importlib.util.spec_from_file_location('preflight',FILE);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
GOOD={'approved_git_commit':'a'*40,'both_online':True,'observed_business_content_matches':True,'source_mismatches':{'mac':{},'vps':{}},'data_differences':{},'counts':{'mac':{},'vps':{}},'production_gate_ready':False}
class Tests(unittest.TestCase):
 def git_result(self,root,*args):
  if args==('branch','--show-current'):return 'staging'
  if args[0]=='status':return ''
  if args[:2]==('remote','get-url'):return 'https://github.com/sandipniyogi/oak-expense-v1.git'
  if args==('rev-parse','HEAD'):return 'b'*40
  if args==('rev-parse','origin/main'):return 'a'*40
  if args[0]=='fetch':return ''
  raise AssertionError(args)
 def check(self,report=None):
  with patch.object(m,'git',side_effect=self.git_result),patch.object(m,'ancestor',return_value=True):return m.check(pathlib.Path('/test'),pathlib.Path('/missing'),lambda:copy.deepcopy(GOOD if report is None else report))
 def test_match_allows_push_not_live_writes(self):
  r=self.check();self.assertTrue(r['ok']);self.assertFalse(r['production_gate_ready']);self.assertFalse(r['live_write_permission_granted'])
 def test_offline(self):
  d=copy.deepcopy(GOOD);d['both_online']=False
  with self.assertRaises(m.Blocked):self.check(d)
 def test_data_difference(self):
  d=copy.deepcopy(GOOD);d['data_differences']={'postgres':['expenses']}
  with self.assertRaises(m.Blocked):self.check(d)
 def test_source_difference(self):
  d=copy.deepcopy(GOOD);d['source_mismatches']['vps']['api']=['index.js']
  with self.assertRaises(m.Blocked):self.check(d)
 def test_main_moved(self):
  d=copy.deepcopy(GOOD);d['approved_git_commit']='c'*40
  with self.assertRaises(m.Blocked):self.check(d)
 def test_incomplete(self):
  for field in ('counts','source_mismatches','both_online','observed_business_content_matches'):
   d=copy.deepcopy(GOOD);d.pop(field)
   with self.assertRaises(m.Blocked):self.check(d)
 def test_behind(self):
  with patch.object(m,'git',side_effect=self.git_result),patch.object(m,'ancestor',return_value=False):
   with self.assertRaises(m.Blocked):m.check(pathlib.Path('/test'),pathlib.Path('/none'),lambda:GOOD)
 def test_git_network_failure(self):
  def run(root,*args):
   if args[0]=='fetch':raise m.Blocked('Git fetch failed')
   return self.git_result(root,*args)
  with patch.object(m,'git',side_effect=run):
   with self.assertRaises(m.Blocked):m.check(pathlib.Path('/test'),pathlib.Path('/none'),lambda:GOOD)
 def test_dirty_blocks_before_verification(self):
  def run(root,*args):return ' M source.js' if args[0]=='status' else self.git_result(root,*args)
  with patch.object(m,'git',side_effect=run):
   with self.assertRaises(m.Blocked):m.check(pathlib.Path('/test'),pathlib.Path('/none'),lambda:self.fail('Must not inspect yet'))
 def test_verifier_failure(self):
  with patch.object(m,'git',side_effect=self.git_result),patch.object(m,'ancestor',return_value=True):
   with self.assertRaises(m.Blocked):m.check(pathlib.Path('/test'),pathlib.Path('/none'),lambda:(_ for _ in ()).throw(RuntimeError('private detail')))
 def test_only_current_staging_push(self):
  sha='b'*40;m.validate_push('refs/heads/staging '+sha+' refs/heads/staging '+'0'*40,sha)
  for line in ['','refs/heads/main '+sha+' refs/heads/main '+'0'*40,'refs/heads/staging '+'c'*40+' refs/heads/staging '+'0'*40]:
   with self.assertRaises(m.Blocked):m.validate_push(line,sha)
 def test_hook_install_and_preservation(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);subprocess.run(['git','init','-q',str(root)],check=True);self.assertTrue(m.install_hook(root)['installed']);self.assertTrue(m.install_hook(root)['installed']);hook=root/'.git/hooks/pre-push';hook.write_text('existing custom hook')
   with self.assertRaises(m.Blocked):m.install_hook(root)
   self.assertEqual(hook.read_text(),'existing custom hook')
 def test_custom_hookspath_preserved(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);subprocess.run(['git','init','-q',str(root)],check=True);subprocess.run(['git','-C',str(root),'config','core.hooksPath','custom-hooks'],check=True)
   with self.assertRaises(m.Blocked):m.install_hook(root)
class FeatureTests(Tests):
 def git_result(self,root,*args):
  if args==('branch','--show-current'):return 'feature/company-funds'
  if args[0]=='ls-remote':return ''
  return super().git_result(root,*args)
 def test_feature_ref_allowed(self):
  sha='b'*40;m.validate_push('refs/heads/feature/company-funds '+sha+' refs/heads/feature/company-funds '+'0'*40,sha,'feature/company-funds')
 def test_cross_branch_and_main_refused(self):
  sha='b'*40
  for source,target in [('feature/company-funds','main'),('staging','feature/company-funds'),('feature/company-funds','staging')]:
   with self.assertRaises(m.Blocked):m.validate_push('refs/heads/'+source+' '+sha+' refs/heads/'+target+' '+'0'*40,sha,'feature/company-funds')
 def test_multiple_refs_refused(self):
  line='refs/heads/feature/company-funds '+'b'*40+' refs/heads/feature/company-funds '+'0'*40
  with self.assertRaises(m.Blocked):m.validate_push(line+'\n'+line,'b'*40,'feature/company-funds')
 def test_unknown_feature_refused(self):
  with self.assertRaises(m.Blocked):m.validate_push('x','b'*40,'feature/other')
 def test_feature_requires_existing_remote_ancestry(self):
  def run(root,*args):
   if args[0]=='ls-remote':return 'c'*40+'\trefs/heads/feature/company-funds'
   return self.git_result(root,*args)
  seen=[]
  def ancestry(root,ref,head):seen.append(ref);return ref!='origin/feature/company-funds'
  with patch.object(m,'git',side_effect=run),patch.object(m,'ancestor',side_effect=ancestry):
   with self.assertRaises(m.Blocked):m.check(pathlib.Path('/test'),pathlib.Path('/none'),lambda:self.fail('Must reject before verifying'))
  self.assertIn('origin/feature/company-funds',seen)
 def test_staging_not_required_for_feature(self):
  seen=[]
  with patch.object(m,'git',side_effect=self.git_result),patch.object(m,'ancestor',side_effect=lambda root,ref,head:seen.append(ref) or True):m.check(pathlib.Path('/test'),pathlib.Path('/none'),lambda:copy.deepcopy(GOOD))
  self.assertEqual(seen,['origin/main'])
if __name__=='__main__':unittest.main(verbosity=2)
