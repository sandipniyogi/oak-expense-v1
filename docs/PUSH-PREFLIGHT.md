# GitHub and live observation check before a staging push

This patch implements the code-push check. It does not implement continuous Mac/VPS synchronization or the all-module live write gate.

Install the source, run the two tests, then install the local hook:

```
python3 scripts/tests/test_push_preflight.py
python3 automation/tests/test_runner_busy.py
python3 scripts/preflight-push.py --install-hook
```

The hook invokes the existing REAL scripts/verify-live-sync.py on every origin/staging push. It does not use the local rehearsal or fake data. It requires the existing strict-verifier.json configuration and SSH key. A hook is local Git configuration and is not automatically installed on another clone.

Before pushing: review changes, run appropriate staging tests and commit locally. The hook requires a clean working tree including untracked files, fetches origin/main and origin/staging, and requires the proposed staging commit to include both remote tips. Behind/diverged branches block; the hook never pulls, merges, resets or stashes your work. Integrate upstream changes yourself, resolve any conflicts, test and commit, then retry. A first push of a new staging branch is outside this hook's scope.

Both live systems must be online, checked source must match approved main and the verifier must report no business-data differences. Approved main changing during the observations blocks the attempt. Only the current local staging commit may be pushed to remote staging; direct main/tag/deletion pushes are refused. Use GitHub PR approval for main. Existing hooks and custom core.hooksPath are preserved; automatic installation refuses to replace them.

For an explicit check after committing, use `python3 scripts/preflight-push.py`. It only fetches Git refs and observes live systems; it does not merge live data or deploy code. The observation is sequential and limited to the existing verifier's scope. Push approval grants no permission to modify live data and cannot guarantee that later live data stays unchanged. Local hooks can be bypassed, so this is workflow protection, not server-enforced branch protection or a distributed write barrier.

The new runner source returns exit 75 plus AUTOMATION_BUSY JSON when another job owns runner.lock. It no longer silently exits zero as if a requested sync ran. This patch changes automation/runner.py in the development project only. The stable engine under Library/Application Support/OakAutomation/engine is NOT modified or restarted; deploy this runner change through the approved release process later. Existing 03:00 expense synchronization retains its current behavior until that separate update.

13 controlled tests cover preflight decisions/hook preservation; one subprocess test holds a REAL file lock while invoking the modified real runner and verifies that it neither runs sync nor overwrites the other job's status. Tests do not inspect your live servers. A real pre-push attempt runs the real verifier on your Mac.

Keep PR #9 draft and code deployment paused. Full live fencing, all-module replication, conflict handling and recovery integration remain unfinished. A successful preflight does not mark production_gate_ready true.
