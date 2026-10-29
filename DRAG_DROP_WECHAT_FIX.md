# Drag & Drop + WeChat OCR Fix

This patch updates three files only:

- `apps/web/app/page.js`
- `apps/web/app/style.css`
- `services/ocr/app.py`

## What changes

### 1. Real drag and drop
The screenshot area now accepts a file dropped directly from Finder. It also shows the filename, MIME type, size, and a green confirmation that the image was selected.

### 2. Reliable re-selection
The file input is reset before each browse action. This means selecting the same filename again still triggers the UI, which is useful when a WeChat image was replaced or re-exported under the same name.

### 3. No browser file-type filter
The browser picker is not restricted with an `accept` attribute. The server still validates/normalizes the actual image.

### 4. WeChat-specific OCR recognition
The OCR parser recognizes both sample styles:

- `Weixin Transfer` / `You've made a transfer` / `¥65.00`
- `Payment successful` / `Awaiting shan to confirm receipt` / `¥65.00`

For the second style it can suggest the recipient (`shan`) as the merchant/recipient. For a WeChat chat-transfer screenshot it prefers the first business-looking chat title such as `bhoomi store`.

## Install in staging first

Copy the three files into the matching paths of your Oak project. Do not replace the complete `apps/web` or `services/ocr` folders.

Then rebuild Web + OCR in staging:

```bash
docker compose --env-file .env.staging up -d --build web ocr
```

Open:

```text
http://localhost:3100
```

After the page loads, do a hard refresh on Mac:

```text
Command + Shift + R
```

Test both:

1. Drag `Weixin Image_20261008124650_1594_377.jpg` from Finder into the upload box.
2. Confirm the green `Image selected successfully` message appears.
3. Click `Read screenshot`.
4. Verify the amount is `65.00` and Payment is `WeChat`.

After staging works, rebuild Web + OCR in production:

```bash
docker compose --env-file .env.production up -d --build web ocr
```
