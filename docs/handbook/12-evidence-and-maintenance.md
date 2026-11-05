# 12 — Evidence, handover and documentation maintenance

[Handbook index](README.md)

## What this handbook was checked against

Repository code was read from the actual GitHub main checkout at `26c959182764d5cb9d4a3dfcb0d47410fa203388`. This is more recent than some retained setup documents. Installed control tools are separate from main and were read from the saved deployment packages used during this project.

| Subject | Source reviewed | What it establishes |
| --- | --- | --- |
| Actual CI triggers/commands | `.github/workflows/checks.yml` | Pushes on main/staging, PRs to main, Source checks command list |
| Allowed push branches/checks | `scripts/preflight-push.py` | Explicit staging/company-funds allowlist; ancestry/clean-tree/live observation checks |
| Funds UI/API/model | `apps/web/app/company-funds/page.js`, `apps/api/src/company-funds.mjs`, `company-funds-model.mjs` | Request flow, kinds, exact cents, sign convention and review invalidation |
| Funds schema and keys | `db/migrations/20261102_company_funds.sql`, `expense-sync-scope.mjs` | Two support tables, expense_id key, explicit sync boundary |
| Data operation/recovery | `automation/runner.py`, `automation/merge.py`, bridge/schema | Three-way merge, journals, backups, supported scope, daily time calculation |
| Staging starters | `scripts/start-company-funds-staging.py`, `scripts/start-all-staging.py` | Different overlay lists, staging safeguards and real side effects |
| Integration tests | `scripts/test-company-funds*.py`, API/automation tests | Disposable tests, conflict/void/deletion behavior |
| Restaurant setup | `restaurant/Dockerfile`, `scripts/local.py`, package/tests | Non-root file permission fix, Node24, separate local environments |
| Read-only verification | `scripts/verify-live-sync.py`, installed runtime verifier/agent | Normalized source/content scope and documented exclusions/limits |
| Manual full-app release | Saved `oak-company-funds-release-review.zip` and production-support controller/host source | Nine modules, exact artifacts, host backups/health and rollback semantics |
| Coordinated migration | Saved production-support source and owner completion output | Reviewed paired transition and installed merge-engine upgrade |
| Current automatic-code policy | Saved `oak-automatic-code-release.zip`, `service/auto_release.py`, `manage.py`, `install.py` | Separate stable job, code-only gates, 300-second LaunchAgent, journal behavior |
| Actual installation acceptance | Owner's check/enable and migration output | Reported successful setup at that time; no continuous guarantee |

The production-support archive predates the later preparation fix. Its environment-list aliasing and abandon/recovery behavior must not be treated as the final installed implementation. The automatic-code package includes the environment-copy fix. Migration history in this handbook is grounded in the successful owner output and stated later fix; an operator should inventory the exact current installed versions before updating control tools.

## Installed control source and state map

| Component | Key files/state | Explanation |
| --- | --- | --- |
| Stable data engine | `runner.py`, `machine.py`, `merge.py`, other installed engine files | Only reviewed engine changes should be installed; Git pull alone is not an upgrade |
| Data sync state | `baseline.json`, `pending.json`, `conflicts.json`, `resolutions.json`, `status.json`, `runner.lock` | Private operation evidence under configured state_dir |
| Manual release controller | `controller.py`, `host_release.py`, `runtime/agent.py`, `runtime/verifier.py` | Git approval, source packaging, peer observation and host operations |
| Local console server | `tools/release-console/serve.py` | Loopback action UI, separate from production websites |
| Manual release state | `workflow.json`, `mac/current.json`, `mac/deployed.json` | Prepared/healthy/current workflow and recorded release identities |
| VPS agent | `/opt/oak-release-control/agent.py` and related installed host/control source | Restricted release command endpoint; private state on VPS |
| Coordinated funds state | `company-funds-workflow.json`, rehearsal/engine backups | Exact reviewed one-off maintenance state |
| Automatic-code service | `service/auto_release.py`, copied controller/host/runtime, `manage.py` | Stable independent job using existing release state/lock |
| Automatic-code state | `settings.json`, `job.json`, `status.json`, `worker.lock`, `stdout.log`, `stderr.log` | Settings, durable started-job outcome and progress |
| New user LaunchAgent | `~/Library/LaunchAgents/online.the-oak-lounge.approved-code.plist` | 300-second interval and RunAtLoad for the signed-in Mac user |

None of these private state files should be committed to document a workflow. Describe fields and behavior, not raw secret-bearing files. Lock files are not stale-status flags to delete; process locks and journals have different jobs.

## Handover checklist

A maintainer should record these privately without adding secrets to Git:

- Named business owner, repository owner and operational escalation contact.
- Which developers can read/push/review/merge; current main ruleset and required checks.
- Which machine is the production orchestration Mac and its normal uptime policy.
- Current source commit/artifact on each host and last verified data-sync time/result.
- Installed control runtime versions/hashes and locations; how to reinstall from reviewed source.
- Actual scheduler registration, timezone, lock/state paths and notification behavior.
- Private configuration backup location; authorized recovery procedure for each credential type.
- Docker container/project/network/volume ownership; current Caddy/domain ownership.
- Exact live store coverage, excluded independent data and normalized verifier rules.
- Backup schedule/retention/off-host copy, latest successful restore rehearsal and accepted data-loss window.
- Known incidents, unresolved differences, pending journals and expected recovery owner.

If a value is unknown, mark it unknown and assign follow-up. Do not replace missing knowledge with a default password, invented path or “everything is synchronized” statement.

## Documentation change procedure

Update the relevant handbook chapter in the same PR as behavior changes. Include commands, whether they mutate source/data/schema, environment boundaries, tests and recovery implications. Update the current-state table and roadmap when a capability genuinely becomes installed/accepted.

Keep older documents where they contain useful history, but add a clear current-workflow pointer at their beginning. Do not silently delete incident history or rewrite old test outputs as current acceptance.

Before publishing docs:

1. Validate relative links and source paths against the same commit being documented.
2. Run `git diff --check` and inspect every changed file; only Markdown is expected for this handbook PR.
3. Syntax-check shell examples without executing their deployment/data actions.
4. Check commands against installed/source CLIs; do not invent flags or reset procedures.
5. Scan for real keys/tokens/passwords, raw business records and secret-resolved configuration.
6. Inspect rendered GitHub Markdown/tables/diagrams.
7. Publish a reviewable PR. Leave main/production unchanged until merge is deliberately planned.

Merging documentation can currently cause the enabled worker to rebuild apps because main advances. Decide whether to schedule that release or temporarily pause future code releases before merge. Do not mark the new main commit as deployed by hand.

## Publishing this handbook from the existing Mac

If it has already been pushed/opened as a PR, review that PR instead of creating a duplicate. If a package is being applied locally, keep the existing pre-push hook. The source allowlist currently accepts staging and feature/company-funds, not arbitrary docs branches. Do not disable it to upload documentation.

A maintainer can publish from an approved, clean, isolated branch after confirming no unrelated commits. For the already merged company-funds branch, inspect/update it first:

```bash
cd "$HOME/Desktop/oak-expense-v1"
git status --short --branch
git fetch origin
git switch feature/company-funds
git merge --ff-only origin/main
```

If that refuses or shows unrelated changes, stop for review. Apply the documentation files, stage only the handbook/entry-point Markdown, inspect the staged diff, commit, then push that approved branch. The existing preflight should perform its live check. Open a new PR to main with a documentation-only title/body; do not reuse the already merged PR #10.

Publishing through an authorized GitHub documentation branch is also possible. It does not modify the Mac's local hook policy or permit future unsupported local branch pushes. Repository rules and review still apply. Do not merge a documentation PR simply to make it readable; branch/PR file links are already usable.

## Official command/tool references

The command explanations were checked against primary documentation. These links are for the tool's semantics, not evidence that this installation has every optional feature configured:

- [Git command reference](https://git-scm.com/docs)
- [Git switch](https://git-scm.com/docs/git-switch)
- [GitHub Git setup](https://docs.github.com/en/get-started/git-basics/set-up-git)
- [GitHub CLI authentication](https://cli.github.com/manual/gh_auth_login)
- [GitHub CLI PR creation](https://cli.github.com/manual/gh_pr_create)
- [GitHub CLI PR checks](https://cli.github.com/manual/gh_pr_checks)
- [GitHub CLI PR merge](https://cli.github.com/manual/gh_pr_merge)
- [GitHub SSH testing](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection)
- [Docker Desktop Mac installation](https://docs.docker.com/desktop/setup/install/mac-install/)
- [Homebrew installation](https://docs.brew.sh/Installation)

## Scope and confidence

This is a source-reviewed onboarding/runbook, not a full security audit, accounting certification or fresh production acceptance test. No live database was opened, no application was restarted and no production configuration was changed to author it. It deliberately records unfinished items: production write fencing, all-module replication, robust journal retirement, retention/DR ownership and documentation-only deployment optimization.
