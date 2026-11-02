import fcntl,json,pathlib,subprocess,sys,tempfile,unittest
class BusyTests(unittest.TestCase):
 def test_lock_contention_reports_busy_without_success(self):
  runner=pathlib.Path(__file__).resolve().parents[1]/'runner.py'
  with tempfile.TemporaryDirectory() as folder:
   root=pathlib.Path(folder);state=root/'state';state.mkdir();config=root/'test-config.json';config.write_text(json.dumps({'state_dir':str(state)}))
   with (state/'runner.lock').open('w') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    result=subprocess.run([sys.executable,str(runner),'--config',str(config),'sync'],text=True,capture_output=True,timeout=15)
   self.assertEqual(result.returncode,75,result.stderr);self.assertEqual(result.stdout,'');report=json.loads(result.stderr);self.assertEqual(report['code'],'AUTOMATION_BUSY');self.assertFalse(report['ok']);self.assertTrue(report['retryable']);self.assertFalse((state/'status.json').exists())
if __name__=='__main__':unittest.main(verbosity=2)
