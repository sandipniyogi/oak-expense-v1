# Oak Expense Report — Total Row Update

This patch adds a grand total to both the on-screen report table and the CSV export.

## Changed files
- `apps/web/app/page.js`
- `apps/web/app/style.css`

## CSV behavior
The final CSV row is now `TOTAL` and contains the report total in the Amount column, plus the report period in Description.

Example:

`TOTAL,,, , ,1112.78,CNY,,Report total: 2026-10-06 to 2026-10-07`

## Install
Replace only the two files listed above in your existing project, then run:

```bash
docker compose up -d --build web
```

No database or API changes are required.
