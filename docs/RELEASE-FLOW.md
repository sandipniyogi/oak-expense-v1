# Approved release workflow

Target: Mac staging → GitHub staging branch → reviewed merge to main → Mac live health check → VPS.

## What this change implements

- GitHub checks for expense automation and restaurant source/tests.
- Expense API/web/OCR releases fetch GitHub `origin/main`, never local development HEAD. A failed fetch stops code deployment.
- Builds use a detached, temporary worktree. The development branch and uncommitted files are not checked out or copied into the release.
- Existing staging/live project names, ports, secrets and storage remain distinct. Only build contexts point to the approved source.
- The Mac live release completes its health checks before the VPS release begins. A Mac failure prevents VPS deployment.
- Existing per-machine image rollback remains available. If VPS deployment fails after Mac succeeds, Mac remains on the newer release; the error pauses completion and the next tick retries. This is not a simultaneous two-host transaction.
- The installed scheduler uses a private copy of its engine outside the development checkout, so switching branches cannot reactivate the legacy deployment policy.
- The code policy defaults to paused until explicitly enabled. Daily expense data sync remains due at 03:00 Asia/Shanghai, including catch-up and existing conflict handling.

## Scope and boundaries

The repository contains all modules. That does not mean every module is auto-deployed. The existing deployment builds expense API/web/OCR and the VPS phone service. Inventory, social, keg and AI services are NOT added to this deployment automatically.

Restaurant promotion continues using `restaurant/scripts/local.py` and its reviewed VPS installer. Its database is separate and is NOT included in expense sync. Integrating those services into the automatic release chain requires separate service-specific health, backup and rollback work.

Compose or database/sync-schema changes pause automatic expense deployment for explicit infrastructure/migration review. Main source is archived using the existing release allowlist; production secrets and Compose definitions remain on each machine.

Staging validation rebuilds the existing Mac expense staging services using approved main. Avoid running release validation while someone is actively reviewing a different staging candidate.

## First-time installation on the Mac

1. Ensure the current full-project upload has been committed and pushed. Leave secret files ignored.
2. Unzip `oak-approved-release-flow.zip` outside the project, then run its `install.py` with `--project /Users/sandip/Desktop/oak-expense-v1`.
3. The installer checks patch applicability, finds the existing LaunchAgent that directly invokes this project's runner, acquires its lock, pauses code deployment, applies the patch, installs the stable engine, and reloads the same schedule. If it cannot identify the scheduler, it stops before applying the patch. Do not create a second timer manually.
4. Review `git diff`. Commit the new workflow on `staging` and push it. Configure GitHub checks/main protection, then merge through a pull request.
5. Only after main contains the reviewed changes, enable the installed policy with the command below.

Private config, LaunchAgent and prior engine backups are saved under the automation state directory. A busy runner causes installation to stop; wait for completion and retry. The installer does not change the VPS, database or uploads.

## GitHub configuration

Create `staging` from the current main commit if it does not already exist. On GitHub, configure a main branch ruleset/protection (availability depends on account/repository plan):

- Require pull requests before merging.
- Require the `Source checks` status check.
- Block force pushes and deletion.
- Use review approval if another reviewer is available; a sole owner cannot approve their own PR.

The first workflow has to be pushed before its check can be selected. A merge to main is the release approval; no extra release tag is required. Without branch protection, this is a workflow convention, not a server-enforced review boundary. Do not push development work directly to main.

## Daily work

On the Mac project checkout:

```bash
git switch staging
# Develop, run staging, review the result.
git add <reviewed-source-files>
git commit -m "Describe the change"
git push -u origin staging
```

Open a pull request from staging to main. Wait for checks, inspect the diff, and merge when ready. The stable Mac scheduler fetches main at its existing interval, validates staging, promotes Mac live, then sends the exact source archive to the VPS. The Mac and Docker must be available. Deployment is not performed by a public GitHub runner and needs no VPS SSH key uploaded to GitHub.

The same source commit is used on both architectures; images are built separately on Mac and VPS. This is not a promise of identical Docker image digests.

## Enable, pause and status

Use the stable engine printed by the installer. For the existing config location:

```bash
python3 - <<'PY'
import json,pathlib,subprocess
p=pathlib.Path.home()/'Library/Application Support/OakAutomation/config.json'
c=json.loads(p.read_text())
subprocess.run(['python3',str(pathlib.Path(c['state_dir'])/'engine/configure_release.py'),'--config',str(p),'enable'],check=True)
PY
```

Change `enable` to `pause` to pause code releases while preserving data sync. To inspect status without printing credentials:

```bash
python3 - <<'PY'
import json,pathlib
p=pathlib.Path.home()/'Library/Application Support/OakAutomation/config.json'
c=json.loads(p.read_text());s=pathlib.Path(c['state_dir'])/'status.json'
print(s.read_text() if s.exists() else 'No scheduler result yet')
PY
```

`deployed.json` records completion on both machines. `mac-release.json` records a successful Mac promotion, even if VPS promotion subsequently fails. Preserve private deployment logs when diagnosing errors.

## Future automation-engine changes

The installed stable engine is deliberately independent of branch switching. Changes to runner/approved/deploy/machine/merge logic require reinstallation of the reviewed engine on the Mac; merely merging them does not replace the stable engine. Use a reviewed installer update, not an arbitrary copy from an unfinished staging branch.

## Validation performed in the development workspace

Automated tests cover remote-main selection, fetch failure, preservation of the local staging branch/uncommitted files, private temporary config cleanup, storage/environment preservation, default pause, and Mac-before-VPS ordering. Existing expense sync/recovery and restaurant tests also run. No actual Mac Docker deployment, VPS deployment or GitHub protection setting has been performed by this patch.
