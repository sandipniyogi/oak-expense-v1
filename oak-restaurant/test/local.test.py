import unittest,pathlib,tempfile,sys,importlib.util,json
scripts=pathlib.Path(__file__).resolve().parents[1]/'scripts';sys.path.insert(0,str(scripts));import release
spec=importlib.util.spec_from_file_location('local',scripts/'local.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
from unittest.mock import patch
class ReleaseTests(unittest.TestCase):
 def test_passwords_state_and_backups_excluded(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);(p/'server.mjs').write_text('code');original=release.fingerprint(p)
   (p/'.env.restaurant.staging').write_text('SECRET');(p/'.local-staging-release.json').write_text('{}');(p/'.backup.lock').touch();(p/'.DS_Store').touch();(p/'release.json').write_text('{}');(p/'backups').mkdir();(p/'backups/data.sqlite').write_text('DATA')
   self.assertEqual(release.fingerprint(p),original);self.assertEqual(set(release.inventory(p)),{'server.mjs'})
 def test_changed_code_requires_retest(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);(p/'server.mjs').write_text('old');a=release.fingerprint(p);(p/'server.mjs').write_text('new');self.assertNotEqual(release.fingerprint(p),a)
 def test_symlink_refused(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);(p/'source').write_text('x');(p/'linked').symlink_to(p/'source')
   with self.assertRaises(RuntimeError):release.fingerprint(p)
 def test_local_credentials_ports_and_cookies_are_separate(self):
  with tempfile.TemporaryDirectory() as d:
   old=mod.ROOT;mod.ROOT=pathlib.Path(d)
   try:
    with patch('getpass.getpass',side_effect=['staging-password-123','staging-password-123','live-password-123','live-password-123']):
     stage=mod.env('staging','image-a');live=mod.env('live','image-a')
    a=stage.read_text();b=live.read_text();self.assertIn('SITE_PORT=3180',a);self.assertIn('SITE_PORT=3080',b);self.assertIn('ADMIN_COOKIE_NAME=oak_restaurant_staging',a);self.assertIn('ADMIN_COOKIE_NAME=oak_restaurant_live',b);self.assertNotIn('staging-password',a);self.assertNotIn('live-password',b)
    oldhash=a.splitlines()[0];mod.env('staging','image-b');self.assertEqual(stage.read_text().splitlines()[0],oldhash);self.assertIn('RESTAURANT_IMAGE=image-b',stage.read_text())
   finally:mod.ROOT=old
if __name__=='__main__':unittest.main()
