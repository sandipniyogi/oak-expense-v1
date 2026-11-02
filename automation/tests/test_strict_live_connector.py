import copy,decimal,importlib.util,json,pathlib,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parents[2]
def module(name,file):
 s=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
agent=module('strict_agent','automation/strict_sync/agent.py');client=module('strict_client','scripts/verify-live-sync.py');setup=module('strict_setup','scripts/setup-strict-verifier.py')
class Tests(unittest.TestCase):
 def tables(self,prefix):return {'oak_inv_categories':[{'id':prefix+'cat','name':'Bar','created_at':prefix}], 'oak_inv_locations':[{'id':prefix+'loc','name':'Shelf','category_id':prefix+'cat','created_at':prefix}], 'oak_sync_tombstones':[{'table_name':'expenses','row_id':'deleted','deleted_at':prefix}]}
 def fks(self):return [{'table':'oak_inv_locations','columns':['category_id'],'references':'oak_inv_categories','referencedColumns':['id']}]
 def test_equivalent_seed_relations(self):self.assertEqual(agent.normalize(self.tables('mac'),agent.POLICY,self.fks()),agent.normalize(self.tables('vps'),agent.POLICY,self.fks()))
 def test_wrong_parent_fails(self):
  t=self.tables('x');t['oak_inv_locations'][0]['category_id']='missing';self.assertRaises(RuntimeError,agent.normalize,t,agent.POLICY,self.fks())
 def test_ambiguous_names_fail(self):
  t=self.tables('x');t['oak_inv_categories'].append({'id':'other','name':'Bar'});self.assertRaises(RuntimeError,agent.normalize,t,agent.POLICY,self.fks())
 def test_tombstone_identity_retained(self):
  a=self.tables('x');b=self.tables('y');b['oak_sync_tombstones'][0]['row_id']='other';self.assertNotEqual(agent.normalize(a,agent.POLICY,self.fks()),agent.normalize(b,agent.POLICY,self.fks()))
 def test_unknown_fields_never_ignored(self):
  a={'unknown':[{'id':1,'updated_at':'x'}]};b={'unknown':[{'id':1,'updated_at':'y'}]};self.assertNotEqual(agent.normalize(a,agent.POLICY,[]),agent.normalize(b,agent.POLICY,[]))
 def test_decimal_precision_preserved(self):self.assertNotEqual(agent.digest(decimal.Decimal('1000000000000.00001')),agent.digest(decimal.Decimal('1000000000000.00002')))
 def test_source_not_mutated(self):
  t=self.tables('x');before=copy.deepcopy(t);agent.normalize(t,agent.POLICY,self.fks());self.assertEqual(t,before)
 def test_stale_nonce_rejected(self):self.assertRaises(client.Unavailable,client.validated,{'nonce':'old','online':True},'fresh','mac')
 def test_incomplete_module_scope_rejected(self):self.assertRaises(client.Unavailable,client.validated,{'nonce':'fresh','role':'mac','online':True,'source':{}},'fresh','mac')
 def test_real_agreement_does_not_grant_permission(self):
  source={s:{'ok':True,'different_files':[]} for s in client.SERVICES};record={'source':source,'scope':{'postgres':{'expenses':'a'}},'counts':{}}
  r=client.summarize('a'*40,record,record);self.assertTrue(r['observed_business_content_matches']);self.assertFalse(r['write_permission_granted']);self.assertFalse(r['production_gate_ready'])
 def test_both_wrong_same_code_not_accepted(self):
  record={'source':{s:{'ok':False,'different_files':['src/index.js']} for s in client.SERVICES},'scope':{},'counts':{}};self.assertFalse(client.summarize('a'*40,record,record)['observed_business_content_matches'])
 def test_readonly_agent_and_forced_key(self):
  source=(ROOT/'automation/strict_sync/agent.py').read_text();self.assertIn('REPEATABLE READ READ ONLY',source);self.assertIn('readOnly:true',source);self.assertIn('production_write_fencing\':False',source);self.assertIn('restrict,command=',setup.BOOTSTRAP);self.assertNotIn('ConfigPut',source)
 def test_setup_compiles(self):compile(setup.BOOTSTRAP,'bootstrap','exec')
if __name__=='__main__':unittest.main()
