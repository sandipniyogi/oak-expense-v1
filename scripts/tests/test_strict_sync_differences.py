import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('d',pathlib.Path(__file__).parents[1]/'strict-sync-differences.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def row(key='a',**fields):return {'key':key,'fields':fields}
class Tests(unittest.TestCase):
 def test_same(self):self.assertEqual(m.classify([row(name='x')],[row(name='x')])['different_fields'],[])
 def test_metadata(self):self.assertEqual(m.classify([row(id='a',updated_at='a')],[row(id='b',updated_at='b')])['non_metadata_different_fields'],[])
 def test_content(self):self.assertEqual(m.classify([row(price='a')],[row(price='b')])['non_metadata_different_fields'],['price'])
 def test_unmatched(self):self.assertEqual(m.classify([row('a')],[row('b')])['unmatched_mac_rows'],1)
 def test_duplicate(self):self.assertTrue(m.classify([row(),row()],[row()])['ambiguous_match'])
 def test_agent(self):compile(m.AGENT,'agent','exec');self.assertIn('READ ONLY',m.AGENT);self.assertIn('readOnly:true',m.AGENT)
if __name__=='__main__':unittest.main()
