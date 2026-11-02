import ast,copy,importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('p',pathlib.Path(__file__).parents[1]/'strict-sync-preflight.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def setUp(self):
  self.a={'code':{'api':{'matches_approved_git':True}},'postgres':{'columns':['id'],'tables':{'expenses':{'count':1,'digest':'a'}}},'files':{'uploads':'a'},'restaurant':{'menu':'a'}};self.b=copy.deepcopy(self.a)
 def test_match(self):self.assertTrue(m.compare(self.a,self.b)['observed_match'])
 def test_row_digest(self):
  self.b['postgres']['tables']['expenses']['digest']='b';self.assertFalse(m.compare(self.a,self.b)['observed_match'])
 def test_unknown_module(self):
  self.b['postgres']['tables']['extra']={};self.assertFalse(m.compare(self.a,self.b)['observed_match'])
 def test_schema(self):
  self.b['postgres']['columns']=[];self.assertFalse(m.compare(self.a,self.b)['observed_match'])
 def test_files(self):
  self.b['files']['uploads']='b';self.assertFalse(m.compare(self.a,self.b)['observed_match'])
 def test_restaurant(self):
  self.b['restaurant']['menu']='b';self.assertFalse(m.compare(self.a,self.b)['observed_match'])
 def test_shared_old_code(self):
  self.a['code']['api']['matches_approved_git']=self.b['code']['api']['matches_approved_git']=False;self.assertFalse(m.compare(self.a,self.b)['observed_match'])
 def test_agent(self):
  compile(m.AGENT,'agent','exec');self.assertIn('REPEATABLE READ READ ONLY',m.AGENT);self.assertIn('readOnly:true',m.AGENT);self.assertNotIn('CREATE FUNCTION',m.AGENT)
if __name__=='__main__':unittest.main()
