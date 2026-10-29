import contextlib, json, pathlib, subprocess, sys, tempfile, unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
import approved, runner

class ApprovedReleaseTests(unittest.TestCase):
    def test_legacy_configuration_pauses_code_without_touching_machines(self):
        with patch.object(runner,'approved_commit',side_effect=AssertionError('must not fetch')):
            self.assertIn('skipped',runner.auto_deploy({},None,None,None))

    def test_fetch_failure_never_uses_local_head(self):
        with patch.object(approved,'git',side_effect=RuntimeError('offline')) as call:
            with self.assertRaisesRegex(RuntimeError,'offline'):
                approved.approved_commit('/repo')
            self.assertEqual(call.call_count,1)

    def test_fetch_uses_only_remote_main(self):
        with patch.object(approved,'git',side_effect=['','approved']) as call:
            self.assertEqual(approved.approved_commit('/repo'),'approved')
            self.assertIn('+refs/heads/main:refs/remotes/origin/main',call.call_args_list[0].args)
            self.assertEqual(call.call_args_list[1].args[-1],'refs/remotes/origin/main^{commit}')

    def test_worktree_uses_approved_main_not_local_staging_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp)/'repo';root.mkdir()
            def git(*args):
                return subprocess.check_output(['git',*args],cwd=root,text=True,stderr=subprocess.PIPE).strip()
            git('init','-b','main');git('config','user.name','Test');git('config','user.email','test@example.invalid')
            (root/'code').write_text('approved');git('add','.');git('commit','-m','approved')
            commit=git('rev-parse','HEAD')
            git('switch','-c','staging');(root/'code').write_text('unfinished')
            with approved.checkout(root,commit,pathlib.Path(temp)) as source:
                self.assertEqual((source/'code').read_text(),'approved')
                self.assertEqual((root/'code').read_text(),'unfinished')
            self.assertFalse(source.exists())
            self.assertEqual(git('branch','--show-current'),'staging')

    def test_build_contexts_change_but_storage_environment_and_name_do_not(self):
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp)/'repo';source=pathlib.Path(temp)/'source';root.mkdir();source.mkdir()
            services={}
            for name in ['api','web','ocr']:
                (root/name).mkdir();(source/name).mkdir()
                services[name]={'build':{'context':str(root/name),'dockerfile':'Dockerfile'},'environment':{'TEST_SECRET':'private'},'volumes':[{'type':'bind','source':'/live/uploads','target':'/app/uploads'}]}
            config={'name':'live-project','services':services,'volumes':{'pgdata':{'name':'live-database'}}}
            class Original:
                cfg={'project':str(root),'env_file':'.env.production'}
                def resolved(self):return config
            original=Original();original.root=root
            with approved.candidate_machine(original,source,pathlib.Path(temp)) as machine:
                file=pathlib.Path(machine.cfg['compose_files'][0]);saved=json.loads(file.read_text())
                self.assertEqual(file.stat().st_mode&0o777,0o600)
                self.assertEqual(saved['name'],'live-project')
                self.assertEqual(saved['volumes'],config['volumes'])
                self.assertEqual(saved['services']['api']['volumes'],services['api']['volumes'])
                self.assertEqual(saved['services']['api']['environment'],services['api']['environment'])
                self.assertEqual(saved['services']['api']['build']['context'],str(source/'api'))
                self.assertEqual(services['api']['build']['context'],str(root/'api'))
            self.assertFalse(file.exists())

    def test_mac_failure_never_calls_vps(self):
        self.check_pipeline(fail_mac=True)

    def test_success_promotes_mac_before_vps(self):
        self.check_pipeline(fail_mac=False)

    def check_pipeline(self,fail_mac):
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp);(root/'automation').mkdir()
            (root/'docker-compose.yml').write_text('same');(root/'automation/compose.local.yaml').write_text('same')
            events=[]
            class Fake:
                def resolved(self):return {'name':'live' if self is mac else 'stage','services':{'api':{'volumes':[]},'db':{'volumes':[]}}}
                def command(self,*a,**kw):events.append('stage-build')
                def smoke(self):events.append('stage-smoke')
                def send(self,p):events.append('vps');return {'sha256':'hash'}
            mac=Fake();vps=Fake()
            def deploy(*args):
                events.append('mac')
                if fail_mac:raise RuntimeError('Mac failed')
                return {'sha256':'hash'}
            cfg={'project':temp,'release_policy':'approved-main-v1'}
            with patch.object(runner,'approved_commit',return_value='approved'),patch.object(runner,'Machine',return_value=Fake()),patch.object(runner,'checkout',side_effect=lambda *a:contextlib.nullcontext(root)),patch.object(runner,'candidate_machine',side_effect=lambda m,*a:contextlib.nullcontext(m)),patch.object(runner.subprocess,'run'),patch.object(runner,'release',return_value={'sha256':'hash'}),patch.object(runner,'deploy',side_effect=deploy):
                if fail_mac:
                    with self.assertRaisesRegex(RuntimeError,'Mac failed'):runner.auto_deploy(cfg,root,mac,vps)
                    self.assertNotIn('vps',events)
                    self.assertFalse((root/'deployed.json').exists())
                else:
                    runner.auto_deploy(cfg,root,mac,vps)
                    self.assertLess(events.index('mac'),events.index('vps'))
                    self.assertEqual(json.loads((root/'deployed.json').read_text())['commit'],'approved')

if __name__=='__main__':unittest.main()
