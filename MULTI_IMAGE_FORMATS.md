# Multi-image-format upload update

This patch expands screenshot uploads beyond JPG/PNG. The API uses Sharp to decode the uploaded image and normalize it to PNG before saving/OCR. This keeps OCR and the Excel screenshot exporter compatible.

## Supported

Typical formats include JPG/JPEG, PNG, WebP, GIF, TIFF, BMP, AVIF, and other formats supported by Sharp/libvips. HEIC/HEIF is accepted by the picker and will work when the installed Sharp/libvips build supports decoding it.

## Files changed

- `apps/api/package.json` — adds `sharp`
- `apps/api/src/index.js` — validates/normalizes uploads to PNG
- `apps/web/app/page.js` — broadens the file picker text/extensions

## Install

Replace only those three files, then rebuild API + web:

```bash
docker compose up -d --build api web
```

For staging:

```bash
docker compose --env-file .env.staging up -d --build api web
```

For production:

```bash
docker compose --env-file .env.production up -d --build api web
```

No database migration is required.
