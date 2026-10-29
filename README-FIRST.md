# Oak Social Studio v1.1 — Installation

This patch upgrades a working Oak Social Studio v1 installation. It changes only four Social Studio files and backs up the previous versions automatically.

## 1. Apply the patch

If Safari extracted the ZIP to `~/Downloads/oak-social-studio-v1.1-patch`:

```bash
cd ~/Downloads/oak-social-studio-v1.1-patch
chmod +x APPLY_PATCH.sh
./APPLY_PATCH.sh "/Users/sandip/Desktop/oak-expense-v1"
```

## 2. Rebuild only Social API + Web

```bash
cd "/Users/sandip/Desktop/oak-expense-v1"

docker compose \
  -f docker-compose.yml \
  -f docker-compose.social.yml \
  --env-file .env.staging \
  build social-api web
```

Then:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.social.yml \
  --env-file .env.staging \
  up -d --no-deps social-api web
```

Do not rebuild OCR, Expense API or Inventory for this patch.

## 3. Verify

```bash
curl http://localhost:4500/health
```

The build marker should be:

```text
oak-social-studio-v1.1-brand-editor
```

Open:

- Admin / Brand Kit: `http://localhost:3100/social/admin`
- Social Dashboard: `http://localhost:3100/social`
- Media Library: `http://localhost:3100/social/media`

Open any existing Social project to use the new editor.

## 4. Brand Kit setup

In **Social → Admin**, configure:

- Brand name
- Primary / accent / text colors
- Noto Sans CJK or Noto Serif CJK
- Default template
- Default subtitle mode
- Watermark/logo position
- Logo image from Media Library

Upload your Oak logo to the Media Library first if you want image-logo compositing. A PNG with transparency is ideal.

## 5. Better editor

Each project now supports:

- One-click platform presets
- 9:16 / 4:5 / 1:1 / 16:9
- Classic / Minimal / Clean template
- Bilingual subtitle mode
- Cover-image selection
- Background music from uploaded audio
- Music volume
- Scene ordering
- Crop position
- Text position
- Cut/fade transition
- English and Chinese subtitle text per scene

`Render cover` produces the project cover image. `Render MP4` produces the video.

## Database

The Social API adds new columns with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Existing Social Studio data is retained. Do not run `docker compose down -v`.
