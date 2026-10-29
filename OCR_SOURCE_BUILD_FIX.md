# OCR Source Build Fix

## Root cause

The current Compose file starts OCR with a prebuilt image:

```yaml
ocr:
  image: oak-ocr-debug
```

That means replacing `services/ocr/app.py` does not change the running OCR container. `docker compose ... --build ocr` has nothing to build when no `build:` context is configured.

## What this patch changes

The OCR service now uses:

```yaml
ocr:
  build: ./services/ocr
  image: ${STACK_NAME:-oak-expense-v1}-ocr:latest
```

This gives Production and Staging separate OCR images and builds directly from your current `services/ocr/app.py`.

The included `app.py` contains the transaction-detail OCR parser and reports this build identifier from `/health`:

```text
transaction-ocr-v5-source-build
```

## Install

Replace only:

- `docker-compose.yml`
- `services/ocr/app.py`

Do not replace whole folders.

## Test in Staging

Force a clean OCR rebuild once:

```bash
docker compose --env-file .env.staging build --no-cache ocr
docker compose --env-file .env.staging up -d ocr api web
```

Verify the exact OCR code now running:

```bash
curl http://localhost:8101/health
```

Expected output includes:

```json
{"ok":true,"engine":"rapidocr","runtime":"onnxruntime","build":"transaction-ocr-v5-source-build"}
```

If that build value is missing, the new OCR code is still not the container being called.

Then upload the structured transaction screenshot again at `http://localhost:3100`.

## Production

Only after Staging works:

```bash
docker compose --env-file .env.production build --no-cache ocr
docker compose --env-file .env.production up -d ocr api web
curl http://localhost:8001/health
```

The production health response should contain the same build identifier.
