# Commands to Run the Code — Local and Server

The Oak Lounge · oak-expense-v1 · Updated 29 October 2026

Use this as the everyday command reference. Code flow:

**Mac staging → GitHub staging → checked pull request → main → Mac live health checks → VPS.**

The current runner performs AUTOMATIC Mac live health checks and then continues to VPS. It does not pause for manual browser approval between those machines. Restaurant and other modules have separate deployment steps.

## Quick navigation

- [Mac: start Docker and prepare Terminal](#1-mac-start-docker-and-prepare-terminal)
- [Mac: pull code](#2-mac-pull-code-before-development)
- [Mac: start and test expense staging](#3-mac-start-and-test-expense-staging)
- [GitHub: commit, push, checks and approval](#4-github-commit-push-checks-and-approval)
- [Mac: deploy approved main through local live to VPS](#5-mac-deploy-approved-main-through-local-live-to-vps)
- [Mac: pause, enable and inspect automation](#6-mac-pause-enable-and-inspect-automation)
- [Mac: expense data sync](#7-mac-expense-data-sync)
- [VPS: health and logs](#8-vps-health-and-logs)
- [VPS: documentation push and pull](#9-vps-documentation-push-and-pull)
- [Restaurant: separate deployment](#10-restaurant-separate-deployment)
- [Other modules and recovery references](#11-other-modules-and-recovery-references)

## 1. Mac: start Docker and prepare Terminal

Existing machine: Docker is already installed. Do not reinstall for everyday work.

```bash
open -a Docker
```

Wait until Docker Desktop is ready, then:

```bash
docker info
docker compose version
cd "$HOME/Desktop/oak-expense-v1"
export OAK_ENGINE="$HOME/Library/Application Support/OakAutomation/engine"
export OAK_CONFIG="$HOME/Library/Application Support/OakAutomation/config.json"
```

Set these two variables again in each new Terminal session. The paths refer to the stable installed engine, not the version in a development checkout.

On a NEW Mac, install Docker Desktop from https://docs.docker.com/desktop/setup/install/mac-install/ and restore the private configuration, data, scheduler and engine as described in the setup/recovery guides. Cloning Git alone does not restore them.

## 2. Mac: pull code before development

Check unfinished work first:

```bash
git status --short
```

With a clean working tree:

```bash
git switch staging
git fetch origin
git pull --ff-only origin staging
git merge --ff-only origin/main
```

If Git cannot fast-forward or reports local changes, stop and reconcile them. Do not discard work with reset --hard or force-push staging/main.

A separate source clone, for a NEW project location only:

```bash
git clone https://github.com/sandipniyogi/oak-expense-v1.git
cd oak-expense-v1
git switch staging
```

Do not clone over the existing project.

## 3. Mac: start and test expense staging

From the project root:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.yml -f automation/compose.local.yaml \
  up -d --build
```

Status and API health:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.yml -f automation/compose.local.yaml ps
curl --fail http://localhost:4100/health
```

Open http://localhost:3100 and test the feature. Typical checks: receipt upload, OCR, manual save, combined payments, payer/amount filters, reports and Excel screenshots.

For combined payments, each screenshot must first become ready through Read screenshots or Attach and enter amounts manually. Enter at least two amounts overall before saving.

Recent logs:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.yml -f automation/compose.local.yaml \
  logs --tail 80 api web ocr
```

Stop staging without deleting its data:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.yml -f automation/compose.local.yaml stop
```

Restart already-created staging containers without rebuilding:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.yml -f automation/compose.local.yaml start
```

Local automated checks, when relevant:

```bash
python3 -m unittest discover -s automation/tests
node apps/api/src/automation-tests.cjs
```

## 4. GitHub: commit, push, checks and approval

If GitHub CLI is not installed on the Mac:

```bash
brew install gh gitleaks
```

Authenticate once, or again if access expires:

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
```

Sign in as sandipniyogi. Complete the device/browser login privately. A GitHub account password is not used as the Git HTTPS password.

Review changes:

```bash
git status --short
git diff
```

Stage only reviewed paths. Examples — choose the relevant one(s):

```bash
git add apps/web/app/CombinedExpenses.js
git add docs/COMMANDS.md
```

Check staged changes before committing:

```bash
git diff --cached --stat
git diff --cached --check
gitleaks git --pre-commit --staged --redact --verbose
```

If the scan passes and changes are correct:

```bash
git commit -m "Describe the tested change"
git push -u origin staging
```

Create a PR (skip creation if an open staging-to-main PR already exists):

```bash
gh pr create --base main --head staging
```

Watch checks and review the PR:

```bash
gh pr checks staging --watch
gh pr view staging --web
```

Only when ready to release, after checks pass:

```bash
gh pr merge staging --merge
```

Keep staging. Do not add --admin or --delete-branch. Merging main is release approval and can trigger deployment on the next scheduler tick.

Browser alternative: https://github.com/sandipniyogi/oak-expense-v1/compare/main...staging — base main, compare staging; create PR, pass Source checks, inspect Files changed, merge.

After the release merge, with no uncommitted work:

```bash
git fetch origin
git switch staging
git merge --ff-only origin/main
git push origin staging
```

This brings the main merge commit back into staging for the next change.

## 5. Mac: deploy approved main through local live to VPS

Normally the enabled scheduler checks remote main about every five minutes. For an immediate release instead:

```bash
python3 "$OAK_ENGINE/runner.py" --config "$OAK_CONFIG" deploy
```

The runner fetches approved main, uses an isolated checkout, validates Mac staging, deploys Mac live and checks health, then sends the same source commit to VPS. Images are built separately on each machine.

Keep the Mac awake and Docker available. Builds may be silent for minutes. Do not launch duplicate deployments. The runner can return with no output if another run holds its lock; inspect status and its timestamp.

Successful completion includes ok:true, a commit hash and scope:expense-api-web-ocr. On error, inspect status/logs before retrying.

Mac live: http://localhost:3000. VPS live: https://expenses.the-oak-lounge.online.

Do not run the legacy start-production.sh to promote staging code. Do not rebuild existing Mac live directly from a development checkout.

If existing Mac live containers are merely stopped, start their current images without rebuilding:

```bash
docker compose --env-file .env.production \
  -f docker-compose.yml -f automation/compose.local.yaml \
  start db ocr api web
```

If containers or images are missing, this is a recovery/bootstrap task rather than a normal start. Restore the existing configuration and use the reviewed release/recovery process.

## 6. Mac: pause, enable and inspect automation

Pause automatic code deployment:

```bash
python3 "$OAK_ENGINE/configure_release.py" --config "$OAK_CONFIG" pause
```

Enable approved-main deployment:

```bash
python3 "$OAK_ENGINE/configure_release.py" --config "$OAK_CONFIG" enable
```

These policy commands leave the daily expense-sync schedule enabled. If the engine is busy, wait and retry; do not kill a backup/sync in progress.

Read status without printing private config:

```bash
python3 <<'PY'
import json, os, pathlib
cfg = json.loads(pathlib.Path(os.environ['OAK_CONFIG']).read_text())
state = pathlib.Path(cfg['state_dir'])
for name in ('status.json', 'deployed.json', 'mac-release.json'):
    path = state / name
    print('\n' + name)
    print(path.read_text() if path.exists() else 'Not available yet')
PY
```

- status.json: latest recorded run; inspect its timestamp and result.
- deployed.json: last release completed on both machines.
- mac-release.json: last successful Mac promotion, including when a subsequent VPS deployment failed.

If Mac succeeds and VPS fails, the Mac may remain on the newer version. Do not assume a simultaneous two-machine rollback.

Stable-engine updates require a reviewed reinstallation. Switching Git branches or merging runner code does not update the installed engine automatically.

## 7. Mac: expense data sync

Scheduled at 03:00 Asia/Shanghai, with catch-up. Mac live and VPS live participate; staging and restaurant databases do not.

Preview without changing records:

```bash
python3 "$OAK_ENGINE/runner.py" --config "$OAK_CONFIG" dry-run
```

Sync now:

```bash
python3 "$OAK_ENGINE/runner.py" --config "$OAK_CONFIG" sync
```

Inspect conflicts:

```bash
python3 "$OAK_ENGINE/runner.py" --config "$OAK_CONFIG" conflicts
```

Review individual conflicts before choosing Mac or VPS values. Do not erase baseline/pending/conflict files to clear an error. They are recovery evidence. Data sync is separate from Git push/pull and is not an independent backup.

## 8. VPS: health and logs

Connect from Mac Terminal:

```bash
ssh root@162.35.33.141
```

Commands below run inside the VPS SSH session.

Expense status:

```bash
cd /opt/oak-expense
docker compose --env-file .env.vps \
  -f compose.vps.yaml -f compose.app.yaml ps
```

Expense logs:

```bash
docker compose --env-file .env.vps \
  -f compose.vps.yaml -f compose.app.yaml \
  logs --tail 80 api web ocr
```

Authenticated health (enter the private expense gateway password):

```bash
curl -u sandip https://expenses.the-oak-lounge.online/api/health
```

Read-only gateway and capacity checks:

```bash
cd /opt/oak-gateway
docker compose -f compose.yaml -f compose.edge.yaml ps
docker compose -f compose.yaml -f compose.edge.yaml logs --tail 60 caddy
df -h /
systemctl list-timers --all 'oak*'
```

Optional VPN status checks:

```bash
cd /opt/oak-openvpn
docker compose ps
cd /opt/oak-vpn
docker compose ps
vnstat -i eth0 --months
```

Do not git pull into /opt/oak-expense as a production deployment method. Do not apply documentation example Compose/Caddy files over the live configuration.

Return to the Mac shell:

```bash
exit
```

## 9. VPS: documentation push and pull

Use the SEPARATE checkout, not the running application:

```bash
cd /opt/oak-setup-docs
git status --short
```

With a clean working tree:

```bash
git fetch origin
git switch staging
git pull --ff-only origin staging
git switch -c docs/describe-this-update
```

Choose a unique branch name if that one already exists. Edit only the intended documentation/templates. Never copy actual passwords, VPN profiles or private runtime files into Git.

After reviewing and scanning the new content:

```bash
git add docs/deployment/
git diff --cached --check
git diff --cached --stat
git commit -m "Describe documentation update"
git push -u origin docs/describe-this-update
```

Create a PR INTO staging:

```bash
gh pr create --base staging --head docs/describe-this-update
```

Review and merge that documentation PR. Wait for staging checks, then create the normal staging-to-main PR. A PR targeting staging is not necessarily covered by the main-targeted PR checks; the push to staging and subsequent main PR run the current checks.

GitHub authentication, if needed on VPS:

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
```

No source changes, configs or backups need to be downloaded to a separate Mac folder for this VPS documentation workflow.

## 10. Restaurant: separate deployment

On the Mac:

```bash
cd "$HOME/Desktop/oak-expense-v1/restaurant"
python3 scripts/local.py staging
python3 scripts/local.py status
```

Review http://localhost:3180. After approval:

```bash
python3 scripts/local.py live
```

Review http://localhost:3080. Then:

```bash
python3 scripts/local.py package
```

Use the printed release path and restaurant/LOCAL-FIRST.md to transfer/install the reviewed release on VPS. No wildcard upload of backup directories. The restaurant helper uses its own images, credentials and data; test entries are not copied into live.

Restaurant checks on Mac with Node 24:

```bash
npm run check
npm test
python3 test/local.test.py
python3 test/router.test.py
```

Restaurant's VPS installer, AFTER the approved release has been extracted to the correct path:

```bash
python3 /opt/oak-expense/restaurant/scripts/install-vps.py
```

Do not run the installer against unreviewed or missing release files.

## 11. Other modules and recovery references

The expense release runner does not automatically deploy inventory, social, keg or AI. Their overlays are separate and may require their own schema/config/data recovery.

- Inventory: INVENTORY_ENGINE_SETUP.md.
- Keg simulator: KEG_SIMULATOR_SETUP.md.
- Full setup record: docs/setup/SETUP-PROCESS.md.
- Private backup inventory/recovery: docs/setup/BACKUP-AND-RECOVERY.md.
- Release mechanics: docs/RELEASE-FLOW.md.
- Redacted VPS references: docs/deployment/examples/.
- Restaurant promotion: restaurant/LOCAL-FIRST.md.

These paths are relative to the repository root.

Do not use docker compose down -v, delete Docker volumes, overwrite live databases, force-push protected branches or publish real environment/key files as routine troubleshooting steps.

Git stores source and this runbook. Keep databases, screenshots, credentials, installed scheduler state and private configuration in verified encrypted recovery backups. The actual private environment files are required on the relevant machines but are not included in Git.
