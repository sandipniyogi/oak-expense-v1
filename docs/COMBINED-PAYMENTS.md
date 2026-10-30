# Combined payments: automatic manual attachments

Save as one expense now uploads any missing screenshots before submitting one combined expense. Read screenshots remains available for OCR. Attach now is optional. Enter at least two positive payment amounts overall and review vendor, payer, payment method and dates.

Reviewed amounts/dates are preserved, existing attachments are reused, duplicates remain blocked, and partial-upload failure prevents final submission while retaining successful attachments for retry. If the final save result is uncertain, check saved expenses before retrying.

## Mac staging acceptance

Apply on the staging branch, then rebuild web staging:

```bash
node --test apps/web/test/combinedSave.test.mjs
docker compose --env-file .env.staging -f docker-compose.yml -f automation/compose.local.yaml up -d --build web
```

At http://localhost:3100 test a fresh screenshot with two amounts without clicking Read or Attach; test two screenshots and mixed OCR/manual entry; verify one saved total and working screenshot links. Check missing-field messages, confirmation cancellation and duplicates. Review an Excel export. Real browser/API/database acceptance is required before promotion; automated save-flow tests use stubbed requests.

No database migration, existing expense changes or deployment is included in patch application. Unsaved uploaded files retain the existing upload retention policy.

After staging acceptance only:

```bash
git add apps/web/app/CombinedExpenses.js apps/web/app/combinedSave.mjs apps/web/test/combinedSave.test.mjs .github/workflows/checks.yml docs/COMBINED-PAYMENTS.md
git commit -m "Automatically attach screenshots when saving combined payments"
git push origin staging
```

Create a staging-to-main PR, wait for Source checks and merge after approval. Merging main can trigger the Mac-live-first release workflow.
