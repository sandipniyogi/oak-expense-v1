# WeChat file picker fix

The browser file input no longer uses an `accept=` filter. This lets the macOS file chooser display all files, including WeChat images whose MIME/UTI metadata may not match the browser's image filter even when the file itself is a valid `.jpg`.

The API still validates the upload as an image and converts supported formats internally, so removing the browser-side filter does not bypass server-side validation.

Replace only:

- `apps/web/app/page.js`

Then rebuild the web container in staging:

```bash
docker compose --env-file .env.staging up -d --build web
```

Open `http://localhost:3100` and try the same WeChat image.
