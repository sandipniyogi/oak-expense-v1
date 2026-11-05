# 11 — Command reference

[Handbook index](README.md)

Commands below assume the existing configured Mac unless explicitly labelled VPS. Run one section at a time; they are not one setup script. Commands that change data or deployments are labelled.

## Locate source and observe Git

```bash
cd "$HOME/Desktop/oak-expense-v1"
git status --short --branch
git remote -v
git fetch origin
git log -3 --oneline --decorate
git diff --stat
git diff --cached --stat
git diff --check
```

Fetch changes refs only. For a clean intended branch, `git merge --ff-only origin/main` advances it only if no merge is needed. A refusal is an instruction to inspect history, not force-reset.

## Review, stage and commit source — local source changes

```bash
git diff -- apps/web/app/company-funds/page.js
git add apps/web/app/company-funds/page.js
git diff --cached
git commit -m "Describe the reviewed change"
```

Replace the file/message for the task. Explicit staging avoids accidentally adding private tools, dumps or uploads.

## Push and PR — publishes source; merge can deploy

Current approved branch example:

```bash
git push -u origin staging
gh pr create --base main --head staging --title "Describe change" --body "Behavior and validation"
gh pr checks PR_NUMBER --watch
gh pr diff PR_NUMBER
gh pr merge PR_NUMBER --merge
git fetch origin
git log -1 origin/main --format="%H %s"
gh run list --branch main --limit 3
```

Use the actual approved branch in push and head. Never merge unrelated staging work. A docs branch published through GitHub does not change the existing local hook's branch allowlist.

## Staging tests and application start — staging mutations

```bash
python3 scripts/test-company-funds.py
python3 scripts/test-company-funds-scope.py --project "$PWD"
python3 scripts/test-company-funds-sync.py --project "$PWD"
python3 scripts/start-company-funds-staging.py
```

The first/sync integration helpers use disposable test data; the starter builds/restarts API/web and migrates staging. Read [development](04-development.md) for overlay compatibility. Complete module/restaurant staging alternatives:

```bash
python3 scripts/start-all-staging.py
python3 restaurant/scripts/local.py staging
```

## Optional local source-only checks — compatible host Node needed

```bash
python3 -m unittest discover -s automation/tests
node --test apps/api/test/company-funds.test.mjs
```

These are focused checks, not the full CI suite. Read `.github/workflows/checks.yml` for all commands. Do not conclude new source was tested merely by running tests from a stale container image.

## Automatic code release — read status/readiness

```bash
python3 "$HOME/Library/Application Support/OakAutomation/automatic-code/service/manage.py" status
python3 "$HOME/Library/Application Support/OakAutomation/automatic-code/service/manage.py" check
```

## Automatic code release — change future scheduler behavior

```bash
python3 "$HOME/Library/Application Support/OakAutomation/automatic-code/service/manage.py" disable
python3 "$HOME/Library/Application Support/OakAutomation/automatic-code/service/manage.py" enable
```

Choose the intended action; do not run both as a routine. Disable does not kill a running release. Enable reruns readiness. Keep the legacy code deployment policy paused.

## Watch automatic-code logs

```bash
tail -n 80 -f "$HOME/Library/Application Support/OakAutomation/automatic-code/stdout.log"
tail -n 80 "$HOME/Library/Application Support/OakAutomation/automatic-code/stderr.log"
```

Ctrl+C stops `tail -f`. Private logs should be redacted before sharing.

## Data dry run — no business-record apply

```bash
python3 "$HOME/Library/Application Support/OakAutomation/engine/runner.py" \
  --config "$HOME/Library/Application Support/OakAutomation/config.json" \
  dry-run
```

## Data sync — mutates supported live records/files

```bash
python3 "$HOME/Library/Application Support/OakAutomation/engine/runner.py" \
  --config "$HOME/Library/Application Support/OakAutomation/config.json" \
  sync
```

## Data conflicts — inspect, then decide explicitly

```bash
python3 "$HOME/Library/Application Support/OakAutomation/engine/runner.py" \
  --config "$HOME/Library/Application Support/OakAutomation/config.json" \
  conflicts
```

Do not paste conflict contents publicly. The `resolve --id CONFLICT_ID --take mac|vps` forms are explained in [data synchronization](06-data-sync.md); they require an evidence-based decision before applying a subsequent sync.

## Separate broad read-only verifier

```bash
python3 scripts/verify-live-sync.py --project "$PWD"
```

Uses private verifier config and both hosts. Reports normalized observed content, not continuous synchronization or permission to write. When investigating managed release state, prefer automatic-code `check`, which also checks the release records/policy.

## Manual release console — starts local control UI

```bash
python3 tools/release-console/serve.py
```

Normally http://127.0.0.1:3192. Start is not deployment, but UI actions can deploy. Preserve local-only `tools/`. Do not expose this control server publicly. Coordinate with automatic mode before manual activation.

## Docker and health — observation

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
docker logs --tail 80 oak-expense-staging-api-1
curl --noproxy '*' --fail --max-time 10 http://127.0.0.1:4100/health
curl --noproxy '*' --fail --max-time 10 http://127.0.0.1:3100/module-api/ai/health
curl --noproxy '*' --fail --max-time 10 http://localhost:3080/api/health
curl --fail --max-time 15 https://the-oak-lounge.online/api/health
```

## Process observation — second Mac Terminal

```bash
ps -axo pid,etime,%cpu,command | grep -E '[r]unner.py|[s]sh .*oak-automation|[p]g_dump|[t]ar -czf'
```

## Coordinated funds workflow — status only for the completed migration

```bash
python3 tools/release-console/funds_control.py status
```

Prepare/apply/abandon are maintenance/recovery actions, not routine commands. See [recovery](08-recovery.md) and the installed current control documentation.

## VPS observation — after authorized SSH login

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
free -h
df -h /opt
docker logs --tail 80 oak-vps-api-1
docker logs --tail 80 oak-restaurant-website-1
```

Do not substitute a general root shell for a restricted automation endpoint. Do not change live Compose/Caddy/environment files as part of reading status.
