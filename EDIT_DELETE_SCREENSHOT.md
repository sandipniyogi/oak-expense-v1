# Edit / Delete / Screenshot Management

This patch adds full maintenance of saved expenses directly in the Oak Expense screen.

## New functions

In **Saved expenses**, every saved record now has:

- **Edit** — update amount, merchant, date, payment method, payer, category, description and reimbursement flag.
- **View** — open the currently stored screenshot.
- **Replace screenshot** — choose a different image and attach it to the same expense.
- **Add screenshot** — attach an image to an expense that currently has none.
- **Remove screenshot** — keep the expense but remove its image.
- **Delete** — permanently delete the expense and its unused screenshot.

After an update/delete, the normal report is generated again, so totals and Excel exports use the latest values.

## Files in this patch

- `apps/api/package.json`
- `apps/api/src/index.js`
- `apps/web/app/page.js`
- `apps/web/app/style.css`

No database migration is required.

## Install in Staging first

Back up staging only if you care about its test data, then replace the four individual files above. Do not replace whole `apps/api` or `apps/web` folders.

```bash
docker compose --env-file .env.staging up -d --build api web
```

Open:

```text
http://localhost:3100
```

Hard-refresh on Mac if needed:

```text
Command + Shift + R
```

## Test checklist

1. Add a test expense.
2. In **Saved expenses**, click **Edit**.
3. Change amount (for example 65 → 70), merchant, date or payer.
4. Click **Save changes** and confirm report totals change.
5. Edit again and choose **Replace screenshot**.
6. Click **View** and verify the replacement image is shown.
7. Export **Excel + screenshots** and confirm the updated amount and replacement screenshot appear.
8. Test **Remove screenshot** and export Excel again.
9. Create a disposable test expense and click **Delete**; confirm it disappears from the report and total.

## Production deployment

Only after staging behaves correctly:

```bash
./scripts/backup-production.sh
```

Then rebuild the API and Web for production:

```bash
docker compose --env-file .env.production up -d --build api web
```

Production URL:

```text
http://localhost:3000
```

## Important behavior

Deleting an expense is permanent. The UI asks for confirmation first. If the screenshot is not referenced by any other expense, the API removes the stored image file as well.

Replacing/removing a screenshot does not re-run OCR automatically. The values you save in the edit form are treated as the verified values. This is deliberate: editing is a correction workflow.
