import importlib.util,pathlib,unittest
p=pathlib.Path(__file__).resolve().parents[1]/'scripts/install-vps.py';spec=importlib.util.spec_from_file_location('install',p);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class RouterTests(unittest.TestCase):
 def test_expense_block_preserved(self):
  expense='''expenses.the-oak-lounge.online {
 basic_auth { sandip HASH }
 handle_path /api/* { reverse_proxy oak-api:4000 }
 handle_path /phone/* { reverse_proxy oak-phone:8080 }
 handle { reverse_proxy oak-web:3000 }
}
'''
  source='''the-oak-lounge.online, www.the-oak-lounge.online {
 respond "The Oak Lounge — website setup in progress." 200
}
'''+expense
  updated=mod.replace_root(source);self.assertIn(expense,updated);self.assertIn('reverse_proxy oak-restaurant:3080',updated);self.assertIn('https://the-oak-lounge.online{uri}',updated);self.assertEqual(mod.replace_root(updated),updated)
 def test_unexpected_existing_site_refused(self):
  with self.assertRaises(RuntimeError):mod.replace_root('the-oak-lounge.online, www.the-oak-lounge.online { reverse_proxy existing-site:80 }')
if __name__=='__main__':unittest.main()
