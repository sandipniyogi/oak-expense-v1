import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[2] / "scripts/preflight-push.py"
spec = importlib.util.spec_from_file_location("oak_preflight", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PushPolicyTests(unittest.TestCase):
    def report(self):
        return {
            "approved_git_commit": "approved-sha",
            "both_online": True,
            "observed_business_content_matches": False,
            "source_mismatches": {"mac": {}, "vps": {}},
            "data_differences": {
                "postgres": ["expenses", "merchants"],
                "expense_screenshots": "different"
            },
            "counts": {"mac": {}, "vps": {}},
            "production_gate_ready": False
        }

    def test_data_difference_does_not_block_development_push(self):
        module.validate_report(self.report(), "approved-sha")

    def test_source_mismatch_still_blocks(self):
        r = self.report()
        r["source_mismatches"]["vps"] = {"api": ["src/index.js"]}
        with self.assertRaises(module.Blocked):
            module.validate_report(r, "approved-sha")

    def test_offline_host_still_blocks(self):
        r = self.report()
        r["both_online"] = False
        with self.assertRaises(module.Blocked):
            module.validate_report(r, "approved-sha")

    def test_unapproved_baseline_still_blocks(self):
        with self.assertRaises(module.Blocked):
            module.validate_report(self.report(), "different-sha")

    def test_missing_data_observation_still_blocks(self):
        r = self.report()
        del r["data_differences"]
        with self.assertRaises(module.Blocked):
            module.validate_report(r, "approved-sha")

    def test_incomplete_live_scope_still_blocks(self):
        r = self.report()
        del r["counts"]["vps"]
        with self.assertRaises(module.Blocked):
            module.validate_report(r, "approved-sha")

if __name__ == "__main__":
    unittest.main()
