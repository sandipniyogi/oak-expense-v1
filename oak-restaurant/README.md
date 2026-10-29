# The Oak Lounge — restaurant website & Oak Studio

Prepared for the existing Docker VPS at 162.35.33.141 and the domain
https://the-oak-lounge.online. This is a separate application from Oak Expenses.

## Included

- Black/gold restaurant landing page using your uploaded logo, Bengali cuisine
  positioning, story, food/cocktail/shisha menu tabs with search, events, visit
  details, WeChat QR and optional reservation link.
- Password-protected Oak Studio at /admin. Add/edit/delete items, set real prices,
  availability and ordering, upload photos, save drafts and publish.
- Event titles, descriptions, posters, start/end dates in Shanghai time, scheduled
  announcement dates, featured events and booking links. Events without an end
  time expire from the homepage 12 hours after their start.
- Homepage announcement strip, editable brand/story copy, address, hours, phone,
  WeChat ID and QR, reservation and social links.
- Durable SQLite storage and image uploads in a Docker named volume. Server-side
  admin sessions, password hashing, CSRF protection and login rate limiting.
- Daily verified database/image backups at 03:15 Shanghai time. Retain at least
  seven verified sets and all sets from the last 14 days.
- An installer that changes only the root/www Caddy block. The existing expenses
  hostname, API route, phone route, password, database and automation are preserved.

## Content and images

Your uploaded gold logo is included as-is. The hero photograph is AI-generated
editorial concept artwork, not a photograph of your actual venue or an actual
menu item. Replace it with your own photography in Website settings when ready.
ASSETS.md records the generation brief.

No prices, opening hours, address, bookings or actual event dates were invented.
Sample menu/event entries start UNPUBLISHED. Add the actual menus before
publishing; a price is required for a published item and a date for an event.
The public menu displays a preparation message until real entries are published.

Publishing broadcasts events ON THE WEBSITE. It does not send WeChat/SMS/email
messages. The existing WeChat receipt integration is a separate project. A
reservation button links to your configured booking service or phone number;
this version does not pretend to confirm bookings or take payments.

## Deployment order

**Start with [LOCAL-FIRST.md](LOCAL-FIRST.md): Mac staging → Mac live → VPS.**

The starter bundle cannot be deployed directly by the VPS installer. Build and
test on Mac staging at localhost:3180, promote the exact tested image to Mac live
at localhost:3080, then generate a verified source release ZIP for the VPS.
No staging test data or passwords are included in that release.

## Sign in and populate

- Public website: https://the-oak-lounge.online
- Admin: https://the-oak-lounge.online/admin
- Username: admin
- Password: the NEW restaurant password chosen during installation

1. Website settings: enter your real address, hours, phone/WeChat, reservation
   link and contact QR. Replace the generated hero with a real venue/food photo.
2. Food, drinks & shisha: add the real items, descriptions, prices, photographs
   and optional tags. Keep draft examples unpublished or delete them.
3. Events: add a real event and poster. Dates are entered and displayed in
   Shanghai time (UTC+8). Set Announce from to schedule the public release.
4. Preview drafts opens an authenticated preview containing unpublished entries.
   Ordinary visitors cannot fetch that preview data without an admin session.
5. Publish an item/event explicitly to make it visible publicly.

The preview link itself is not a credential and does not bypass login. The
restaurant admin is separate from the expense login at the expenses subdomain.

## Updates and backup operations

Menu/event changes take effect from the database, without rebuilding the code.
The app does not cache the content API. Visitors already on the page need a
refresh to see changes; there is no live push connection in this version.

Code for this restaurant lives separately at /opt/oak-restaurant. It is NOT part
of the earlier expense Git deployment/data-sync pipeline. Keep it separate so
its routes and content do not overwrite the expense module. To update website
code, back up first, replace only source/assets, then rebuild; keep
.env.restaurant and the named volume. A future release can add its own automatic Git deployment pipeline. A tested explicit local-first release
workflow is already included; see LOCAL-FIRST.md.

Manual backup on the VPS:

```bash
python3 /opt/oak-restaurant/scripts/backup.py
systemctl list-timers oak-restaurant-backup.timer
journalctl -u oak-restaurant-backup.service --no-pager -n 30
```

Backups are in /opt/oak-restaurant/backups, with a SQLite snapshot and uploads
archive. Failed backups are not pruned; only old verified sets are removed.
Same-server backups do not protect against loss of that VPS. Copy these backups
to your Mac or another private destination periodically. This package does not
silently include restaurant records in the expense database sync.

Inspect application logs:

```bash
cd /opt/oak-restaurant
docker compose logs --tail=60 website
```

## Local development

Requires Node 24+. There are no npm runtime dependencies.

```bash
npm run check
npm test
python3 test/router.test.py
npm run dev
```

The development script creates an ephemeral private preview password under
.preview/password and keeps preview data under .preview/data. These files,
production .env files, uploaded content and live databases are excluded from the
release ZIP and Docker build. Development credentials are not shipped or used
in production. Use your own local preview credential only for that environment.

## Validation

15 automated Node HTTP/SQLite tests passed: draft privacy, admin access, CRUD,
price/date validation, announcement scheduling, expiration, CSRF/origin checks,
session expiration/logout, login throttling, upload storage and online backup
integrity. Six Python tests passed for local environment isolation, source-only releases,
source-change detection, Caddy route preservation/idempotence and refusal to
overwrite unexpected sites. JavaScript/Python syntax checks passed.
The public homepage and menu navigation were visually checked in the browser.
Admin login page was visually checked; the authenticated admin UI was not
browser-tested. Its backend operations were tested through HTTP against SQLite.
Docker image build, live-domain deployment and systemd timer need verification
on your VPS; no claim is made that this ZIP is already installed there.

## Security notes

Only the existing Caddy gateway publishes ports. Public content endpoints expose
published menu/events and the venue contact settings you enter. Admin endpoints
require a server-side session cookie and mutations also require a matching
origin and CSRF token. Image uploads accept JPG/PNG/WebP up to 8 MB; SVG, arbitrary
HTML and remote image URLs are rejected. The public UI uses textContent for your
content instead of evaluating HTML. Admin sessions expire after 12 hours.

Uploads and old menu photos are retained, so content updates cannot break a
backup. Monitor available space. This first version has one shared admin account;
it does not provide separate staff roles or a customer account database.
