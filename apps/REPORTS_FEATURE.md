# Payment Reports Feature

This version adds reporting without changing the PostgreSQL schema.

## What was added

- `GET /reports/expenses`
- Report modes: `all`, `wechat`, `alipay`
- Optional `from` and `to` date filters (`YYYY-MM-DD`)
- Summary totals and transaction counts
- WeChat / Alipay / Other breakdown
- Pending reimbursement total
- Detailed report table
- CSV export (UTF-8, including Chinese merchant names)
- Browser Print / Save PDF support

## API examples

```text
GET http://localhost:4000/reports/expenses
GET http://localhost:4000/reports/expenses?payment_method=wechat
GET http://localhost:4000/reports/expenses?payment_method=alipay
GET http://localhost:4000/reports/expenses?payment_method=all&from=2026-10-01&to=2026-10-31
```

## Files changed

- `apps/api/src/index.js`
- `apps/web/app/page.js`
- `apps/web/app/style.css`

## Run after replacing the files

```bash
docker compose up --build
```

If your current containers are already running and Docker does not rebuild the changed web/API code, use:

```bash
docker compose down
docker compose up --build
```

No database migration is required for this feature.
