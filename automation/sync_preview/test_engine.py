import unittest,tempfile,sqlite3
from pathlib import Path
from engine import Engine,Locked,canonical
class Tests(unittest.TestCase):
 def setUp(self):self.temp=tempfile.TemporaryDirectory();self.e=Engine(self.temp.name)
 def tearDown(self):self.e.close();self.temp.cleanup()
 def test_initial(self):self.assertFalse(self.e.status()['locked']);self.assertFalse(self.e.status()['actual_vps_connected'])
 def test_forward_and_reverse(self):
  for peer in ('mac','vps'):
   self.e.edit(peer,'expense:new',{'amount':15 if peer=='mac' else 20});self.assertTrue(self.e.status()['locked']);self.e.sync();self.assertEqual(self.e.snapshot('mac'),self.e.snapshot('vps'));self.assertFalse(self.e.status()['locked'])
 def test_locked_second_write(self):
  self.e.edit('mac','menu:new',{'name':'demo'})
  with self.assertRaises(Locked):self.e.edit('vps','menu:other',{})
 def test_deletion(self):
  self.e.edit('vps','expense:demo-1',None,delete=True);self.e.sync();self.assertNotIn('expense:demo-1',self.e.snapshot('mac'))
 def test_independent_changes(self):
  self.e.edit('mac','expense:a',{'amount':1},force=True);self.e.edit('vps','menu:b',{'name':'b'},force=True);self.assertFalse(self.e.sync()['conflicts']);self.assertIn('menu:b',self.e.snapshot('mac'))
 def test_conflict_no_overwrite(self):
  for p in ('mac','vps'):self.e.edit(p,'expense:demo-1',{'description':p},force=True)
  before={p:self.e.snapshot(p) for p in self.e.peers};self.assertEqual(self.e.sync()['conflicts'],['expense:demo-1']);self.assertEqual(before,{p:self.e.snapshot(p) for p in self.e.peers})
 def test_explicit_resolution(self):
  for p in ('mac','vps'):self.e.edit(p,'expense:demo-1',{'description':p},force=True)
  self.e.resolve('expense:demo-1','vps');self.e.sync();self.assertEqual(self.e.snapshot('mac')['expense:demo-1'],canonical({'description':'vps'}))
 def test_edit_delete_conflict(self):
  self.e.edit('mac','expense:demo-1',None,delete=True,force=True);self.e.edit('vps','expense:demo-1',{'amount':12},force=True);self.assertEqual(self.e.sync()['conflicts'],['expense:demo-1']);self.e.resolve('expense:demo-1','mac');self.e.sync();self.assertNotIn('expense:demo-1',self.e.snapshot('vps'))
 def test_offline_blocks(self):
  self.e.switch('vps','online',False)
  for fn in (lambda:self.e.edit('mac','expense:x',{}),self.e.sync,self.e.recover):
   with self.assertRaises(Locked):fn()
 def test_approval_blocks(self):
  self.e.switch('mac','approved',False)
  with self.assertRaises(Locked):self.e.sync()
  with self.assertRaises(Locked):self.e.edit('vps','menu:x',{})
 def test_restart_recovery(self):
  self.e.edit('vps','expense:x',{'amount':99})
  with self.assertRaises(Locked):self.e.sync(interrupt=True)
  self.e.close();self.e=Engine(self.temp.name);self.assertTrue(self.e.status()['locked']);self.assertTrue(self.e.state['pending']);self.e.recover();self.assertEqual(self.e.snapshot('mac'),self.e.snapshot('vps'));self.assertFalse(self.e.status()['locked']);self.assertFalse(self.e.recover()['recovered'])
 def test_recovery_refuses_external_changes(self):
  self.e.edit('mac','expense:x',{})
  with self.assertRaises(Locked):self.e.sync(True)
  with self.e.peers['vps']:self.e.peers['vps'].execute('INSERT INTO records VALUES(?,?)',('expense:unexpected','{}'))
  before=self.e.snapshot('vps')
  with self.assertRaises(Locked):self.e.recover()
  self.assertEqual(before,self.e.snapshot('vps'));self.assertIsNotNone(self.e.state['pending'])
if __name__=='__main__':unittest.main(verbosity=2)
