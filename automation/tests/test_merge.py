import sys,pathlib,unittest,copy
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from merge import merge,baseline,TABLES

def rows():return {t:{} for t in TABLES}
class MergeTests(unittest.TestCase):
 def test_bootstrap_identical(self):
  a=rows();a['expenses']['x']={'id':'x','amount':10};self.assertEqual(merge(None,a,a),(a,[]))
 def test_bootstrap_different_blocks(self):
  a=rows();b=rows();a['expenses']['x']={'id':'x','amount':10};self.assertTrue(merge(None,a,b)[1])
 def test_new_in_each_direction(self):
  a=rows();b=rows();base=baseline(rows());a['expenses']['a']={'id':'a','amount':10};b['expenses']['b']={'id':'b','amount':20}
  merged,conflicts=merge(base,a,b);self.assertFalse(conflicts);self.assertEqual(set(merged['expenses']),{'a','b'})
 def test_one_sided_edit(self):
  a=rows();a['expenses']['x']={'id':'x','amount':10};base=baseline(a);b=copy.deepcopy(a);b['expenses']['x']['amount']=11
  self.assertEqual(merge(base,a,b),(b,[]))
 def test_two_edits_conflict(self):
  a=rows();a['expenses']['x']={'id':'x','amount':10};base=baseline(a);b=copy.deepcopy(a);a['expenses']['x']['amount']=11;b['expenses']['x']['amount']=12
  _,c=merge(base,a,b);self.assertEqual(len(c),1)
  merged,c2=merge(base,a,b,{c[0]['id']:'vps'});self.assertFalse(c2);self.assertEqual(merged,b)
 def test_stale_resolution_not_reused(self):
  a=rows();a['expenses']['x']={'id':'x','amount':10};base=baseline(a);b=copy.deepcopy(a);a['expenses']['x']['amount']=11;b['expenses']['x']['amount']=12
  _,c=merge(base,a,b);b['expenses']['x']['amount']=13;self.assertTrue(merge(base,a,b,{c[0]['id']:'mac'})[1])
 def test_delete_propagates(self):
  a=rows();a['expenses']['x']={'id':'x','amount':10};base=baseline(a);b=copy.deepcopy(a);b['expenses']['x']=None
  self.assertEqual(merge(base,a,b),(b,[]))
 def test_delete_against_edit_conflicts(self):
  a=rows();a['expenses']['x']={'id':'x','amount':10};base=baseline(a);b=copy.deepcopy(a);a['expenses']['x']['amount']=11;b['expenses']['x']=None
  self.assertTrue(merge(base,a,b)[1])
 def test_tombstone_not_resurrected(self):
  a=rows();a['expenses']['x']=None;self.assertEqual(merge(baseline(a),a,a),(a,[]))
 def test_foreign_key_conflict(self):
  a=rows();b=rows();a['expenses']['x']={'id':'x','user_id':'missing'};self.assertTrue(merge(baseline(rows()),a,b)[1])
 def test_unique_category_conflict(self):
  a=rows();b=rows();a['categories']['a']={'id':'a','name':'Food'};b['categories']['b']={'id':'b','name':'Food'}
  self.assertTrue(merge(baseline(rows()),a,b)[1])
 def test_explicit_missing_side_becomes_tombstone(self):
  a=rows();b=rows();a['expenses']['x']={'id':'x','amount':10}
  _,c=merge(None,a,b);target,c=merge(None,a,b,{c[0]['id']:'vps'});self.assertFalse(c);self.assertIsNone(target['expenses']['x'])
 def test_many_records_no_pagination_limit(self):
  a=rows();a['expenses']={str(i):{'id':str(i),'amount':i} for i in range(6001)};self.assertFalse(merge(baseline(rows()),a,rows())[1])
if __name__=='__main__':unittest.main()
