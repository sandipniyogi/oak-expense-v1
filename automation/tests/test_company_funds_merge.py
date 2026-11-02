import copy,pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from merge import TABLES,FUND_TABLES,merge,baseline

def rows():
 r={t:{} for t in TABLES+FUND_TABLES}
 r['users']['u']={'id':'u'};r['expenses']['e']={'id':'e','user_id':'u'}
 return r
class Funds(unittest.TestCase):
 def test_old_scope(self):
  r={t:{} for t in TABLES};self.assertEqual(merge(baseline(r),r,r),(r,[]))
 def test_seven_scope(self):
  r=rows();self.assertEqual(set(baseline(r)),set(TABLES+FUND_TABLES))
 def test_scope_mismatch(self):
  with self.assertRaises(RuntimeError):merge(None,rows(),{t:{} for t in TABLES})
 def test_partial_scope(self):
  r=rows();del r[FUND_TABLES[0]]
  with self.assertRaises(RuntimeError):merge(None,r,r)
 def test_unknown_scope(self):
  r=rows();r['unknown']={}
  with self.assertRaises(RuntimeError):baseline(r)
 def test_old_baseline_expands_without_losing_rows(self):
  a=rows();b=rows();a[FUND_TABLES[0]]['m']={'id':'m','partner_id':'u','request_id':'new'}
  result,c=merge(baseline({t:b[t] for t in TABLES}),a,b);self.assertFalse(c);self.assertEqual(result,a)
 def test_reverse_funding_review(self):
  a=rows();b=rows();b[FUND_TABLES[1]]['e']={'expense_id':'e','expense_user_id':'u'}
  result,c=merge(baseline(a),a,b);self.assertFalse(c);self.assertEqual(result,b)
 def test_movement_reference_missing(self):
  a=rows();b=rows();a[FUND_TABLES[0]]['m']={'id':'m','partner_id':'missing','request_id':'new'}
  self.assertTrue(merge(baseline(b),a,b)[1])
 def test_funding_reference_missing(self):
  a=rows();b=rows();a[FUND_TABLES[1]]['missing']={'expense_id':'missing','expense_user_id':'u'}
  self.assertTrue(merge(baseline(b),a,b)[1])
 def test_same_request_different_ids(self):
  a=rows();b=rows()
  for r,k in [(a,'a'),(b,'b')]:r[FUND_TABLES[0]][k]={'id':k,'partner_id':'u','request_id':'same'}
  self.assertTrue(merge(baseline(rows()),a,b)[1])
 def test_competing_review_conflicts(self):
  original=rows();original[FUND_TABLES[1]]['e']={'expense_id':'e','expense_user_id':'u','note':'initial'};a=copy.deepcopy(original);b=copy.deepcopy(original)
  a[FUND_TABLES[1]]['e']['note']='mac';b[FUND_TABLES[1]]['e']['note']='vps';self.assertTrue(merge(baseline(original),a,b)[1])
 def test_review_deletion(self):
  a=rows();a[FUND_TABLES[1]]['e']={'expense_id':'e','expense_user_id':'u'};b=copy.deepcopy(a);b[FUND_TABLES[1]]['e']=None
  self.assertEqual(merge(baseline(a),a,b),(b,[]))
 def test_no_silent_baseline_shrink(self):
  a={t:{} for t in TABLES}
  with self.assertRaises(RuntimeError):merge(baseline(rows()),a,a)
if __name__=='__main__':unittest.main(verbosity=2)
