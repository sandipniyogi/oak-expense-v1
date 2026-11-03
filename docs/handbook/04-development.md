# 04 — Develop and test a feature

[Handbook index](README.md)

## Worked example: improve a company-funds label

Start with a small visible change before modifying settlement rules. A label lives in the web interface; a financial calculation lives in the API model. The browser should not invent its own conflicting monthly-balance formula.

## Step 1 — Establish the current state

Mac, observation only:

```bash
cd "$HOME/Desktop/oak-expense-v1"
git status --short --branch
git fetch origin
git log -3 --oneline --decorate
git diff --stat
git diff --cached --stat
```

If there are existing changes, identify their purpose first. `git diff --stat` does not list every untracked file, so also read `git status`. Do not stash, discard, reset or commit somebody else's work automatically.

Run the installed read-only readiness check before starting work that depends on a synchronized production baseline:

```bash
python3 "$HOME/Library/Application Support/OakAutomation/automatic-code/service/manage.py" check
```

If it fails because data differs, follow [data synchronization](06-data-sync.md). This manual check cannot stop every future edit; it is a point-in-time prerequisite, not a permanent lock on your editor.

## Step 2 — Select and update the intended development branch

Use an approved branch with the intended history. For an already reviewed staging branch:

```bash
git switch staging
git merge --ff-only origin/main
```

If `--ff-only` refuses, stop and inspect history. A maintainer may choose a reviewed merge of `origin/main`, then resolve conflicts and rerun tests. Do not use force push or reset to make the branch look current. If staging contains unrelated strict-sync work, isolate the feature rather than releasing the entire branch.

A feature branch does not have to be named staging to run the staging Docker stack. The **Git branch** identifies source history; the **Docker project** identifies the runtime environment. Both must be checked.

## Step 3 — Edit and understand the request path

For the example, inspect `apps/web/app/company-funds/page.js` and change the label. If changing financial behavior, follow the data from that page to `apps/api/src/company-funds.mjs`, then `company-funds-model.mjs`, schema and sync scope. Record the intended before/after behavior before editing.

For a new stored field or table, stop treating the change as UI-only. Review database migration, validation, reports, permissions, sync keys/tombstones, backups, existing records and rollback compatibility. Automatic code deployment blocks schema/initialization changes.

## Step 4 — Test the right staging stack

Docker Desktop must be running. Existing expense staging containers are used by integration-test helpers. Choose the starter matching your change:

```bash
python3 scripts/start-company-funds-staging.py
```

This helper runs funds integration tests, validates staging project/ports/storage, builds API/web, backs up the staging database, applies the funds migration to **staging** and restarts staging API/web. It is not a read-only command and does not migrate production.

For testing the complete application suite, the repository has:

```bash
python3 scripts/start-all-staging.py
```

It builds/starts the staging apps and checks module proxies. Read its Compose overlay list before use. The general starter and company-funds starter use different overlay lists; do not assume a general restart preserves every feature flag added by a specific starter. If funds returns 404 after a general staging restart, inspect `OAK_COMPANY_FUNDS` and the overlay choice rather than migrating live.

Restaurant staging is separate:

```bash
python3 restaurant/scripts/local.py staging
```

This can ask for a separate staging-admin password. Test the public site at port 3180 and admin there. Do not run `local.py live` as a shortcut to deploy an unfinished branch into the currently managed Mac production stack.

## Step 5 — Run focused tests

Company-funds changes, Mac, disposable staging databases:

```bash
python3 scripts/test-company-funds.py
python3 scripts/test-company-funds-scope.py --project "$PWD"
python3 scripts/test-company-funds-sync.py --project "$PWD"
```

The scope helper's installed CLI should be checked with `--help` if it differs from this source version. The sync test creates two temporary databases and exercises bridge/merge behavior; they are not the real Mac/VPS databases. Passing it does not synchronize live records.

Model tests and CI source checks can run with a compatible local Node 24 installation. The exact authoritative list is `.github/workflows/checks.yml`. It covers expense AI/API/web tests, Python automation tests, automation save/sync tests and restaurant JS/Python checks. These do not replace Docker builds, real network checks or browser review. Avoid `docker exec` tests against a stale built image if your purpose is to test newly edited source; use the repository's copying/build helpers.

Browser acceptance should cover the actual user journey: create/edit/validate a record, refresh, verify reports, test invalid input and retry behavior, then check mobile layout. Use test entries only in staging. For money changes, test cents, dates/month boundaries, duplicate submits, voids, review invalidation, payer/currency restrictions and carry-forward balance.

## Step 6 — Review and commit only your change

```bash
git status --short --branch
git diff --check
git diff -- apps/web/app/company-funds/page.js
git add apps/web/app/company-funds/page.js
git diff --cached --stat
git diff --cached
git commit -m "Clarify company funds balance label"
```

Add tests/docs explicitly when needed. If gitleaks reports a secret, stop and remove it from the change; rotate any real exposed credential. Do not silence the scanner. A successful commit is local only.

## Step 7 — Push and create a PR

For the approved `staging` branch only:

```bash
git push -u origin staging
gh pr create --base main --head staging \
  --title "Clarify company funds balance label" \
  --body "Clarifies the displayed balance label. Validation: staging browser review and focused tests. No schema or sync-protocol changes."
```

If working on `feature/company-funds`, use that branch in both `push` and `--head`; do not copy the staging example literally. For another branch name, obtain a reviewed hook-policy update first.

The hook may take time because it checks GitHub, Docker and VPS. If it refuses because the tree is dirty, review and commit the intended remaining changes. If content differs, reconcile through the supported sync workflow. Hook success is a push permission decision, not a data-write permit.

## Step 8 — Check the exact PR and merge

Replace `PR_NUMBER`:

```bash
gh pr view PR_NUMBER
gh pr diff PR_NUMBER
gh pr checks PR_NUMBER --watch
```

The workflow runs on pushes to `staging` and `main`, and on PRs targeting `main`. A feature push may show no push workflow until a PR exists. Immediately after pushing, checks may not yet appear. Also, `gh pr checks` shows checks for the current PR head, not proof that a later merge commit passed.

Only merge after reviewing scope and results:

```bash
gh pr merge PR_NUMBER --merge
git fetch origin
git log -1 origin/main --format="%H %s"
gh run list --branch main --limit 3
```

Merging to main can start an automatic nine-app deployment. It is not just filing paperwork. For schema/control changes, use an explicitly planned migration/infrastructure path instead. Do not merge unrelated draft strict-sync code.

## Step 9 — Verify delivery

Use automatic-code `status` and eventually `check`, then review both websites. Record the new approved commit, release outcome, test results and any observed limitation. A green PR is not proof that VPS deployed. The roadmap calls for keeping these distinctions visible.
