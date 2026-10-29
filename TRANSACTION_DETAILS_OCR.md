# Structured Transaction Details OCR patch

This patch extends the existing Oak Expense OCR flow for screenshots that contain a structured transaction detail page, for example:

- `Transaction Details`
- merchant / recipient name
- `-7,000.00`
- `Transaction successful`
- `Payment time 2026-09-21 11:48:02`
- `Payment method BOC Debit Card(4503)`
- `Item description ...`
- `Full name of payee ...`
- `Transactions Category Food`

## What it extracts

The OCR service now detects this layout and attempts to return:

- amount as a positive expense value (`7000.00` even when the screenshot displays `-7,000.00`)
- merchant / recipient
- expense date
- transaction time
- transaction status
- payment instrument / card text
- payee name
- item description
- category suggestion
- a useful description assembled from the payment instrument/payee/item
- `source_type = transaction_details`

If the screenshot itself says WeChat or Alipay, that is used as the payment grouping. If the source app is not written in the screenshot, the current database has no separate `source_app` field, so the patch groups it as `Other app` and preserves the actual bank/card text inside the OCR data and description.

## Files to replace

Replace only:

```text
services/ocr/app.py
apps/web/app/page.js
```

Do not replace the whole folders.

## Test in Staging

```bash
docker compose --env-file .env.staging up -d --build ocr web
```

Open:

```text
http://localhost:3100
```

Upload the structured transaction screenshot and click **Read screenshot**.

For the supplied sample, the expected result is approximately:

```text
Amount:       7000.00
Merchant:     Shaan
Date:         2026-09-21
Payment:      Other app (unless OCR text identifies WeChat/Alipay)
Category:     Food (when the category exists in Oak categories)
Description:  BOC Debit Card(4503) · Payee: M. SANTANU(个人) · Item: 收钱码收款
```

The exact result still depends on what RapidOCR recognizes from the pixels, so always use the Verify Expense form before saving.

## Production deployment

After Staging is correct:

```bash
docker compose --env-file .env.production up -d --build ocr web
```

No database migration is required.
