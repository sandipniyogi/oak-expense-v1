# Oak Expense OCR NumPy Fix v6

## What this fixes

The OCR request could fail with:

`The truth value of an array with more than one element is ambiguous. Use a.any() or a.all()`

RapidOCR may return `txts`, `scores`, and `boxes` as NumPy arrays. Python cannot safely evaluate a multi-element NumPy array in code such as `result.txts or []`.

This patch adds `safe_list()` and converts all RapidOCR result fields without boolean-testing NumPy arrays.

## Install

Replace only:

`services/ocr/app.py`

Then rebuild staging OCR from source:

```bash
docker compose --env-file .env.staging build --no-cache ocr
docker compose --env-file .env.staging up -d ocr
```

Verify:

```bash
curl http://localhost:8101/health
```

Expected build marker:

`transaction-ocr-v6-numpy-safe`

Then upload the transaction screenshot and click **Read screenshot** again.

No frontend rebuild, Safari cache clear, API rebuild, or database migration is required for this fix.
