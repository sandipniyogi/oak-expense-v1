# Restaurant website: Mac staging → Mac live → VPS

This is the restaurant website, separate from Oak Expenses. Existing expense
ports 3000/3100, expense data and the running expense automation are untouched.

| Environment | Public page | Admin | Database/session scope |
|---|---|---|---|
| Mac restaurant staging | http://localhost:3180 | http://localhost:3180/admin | oak-restaurant-staging |
| Mac restaurant live | http://localhost:3080 | http://localhost:3080/admin | oak-restaurant-live |
| VPS restaurant live | https://the-oak-lounge.online | https://the-oak-lounge.online/admin | oak-restaurant |

## 1. Unzip the starter on your Mac

Download oak-restaurant-v1.zip into Downloads. Use a NEW restaurant
folder, separate from oak-expense-v1. In Mac Terminal:

```bash
python3 -m zipfile -e "$HOME/Downloads/oak-restaurant-v1.zip" "$HOME/Desktop"
cd "$HOME/Desktop/oak-restaurant"
python3 scripts/local.py staging
```

Keep Docker Desktop running. You do not need Node installed on the Mac; the
website runs inside Node 24 Docker containers. The Python helper uses only the
standard library and asks for a new staging-admin password (12+ characters).
Username is admin. Keep this password private. It is not your VPS/expense login.

The Docker build runs the Node HTTP/SQLite tests. The helper waits for a healthy
container and checks the public content endpoint and protected admin endpoint.
It then records the tested source fingerprint and image ID locally.

Open http://localhost:3180 and http://localhost:3180/admin. The public page has a
MAC STAGING banner; the admin panel is labeled MAC STAGING as well.

Test the homepage, all three menu tabs, menu search, draft/publish/unpublish,
photo/poster uploads, event scheduling and venue settings. Sample content starts
unpublished. Staging test items stay in its own database. Events broadcast on the
website, not through WeChat/SMS/email.

## 2. Promote the tested image to Mac live

When satisfied:

```bash
cd "$HOME/Desktop/oak-restaurant"
python3 scripts/local.py live
```

This refuses promotion if source changed since the staging build or its image
ID no longer matches. It uses the EXACT tested Docker image without rebuilding.
It asks you to choose a separate local-live admin password on first use.

Open http://localhost:3080 and http://localhost:3080/admin. The environment banner
says MAC LIVE. Menus, event data, uploads and session cookies remain separate from
staging. Code promotion does not copy test menu/event records into live.

Before replacing an existing running local-live version, a verified backup is
created under backups/live/. No Docker volumes are deleted.

If you change any source after staging, rerun staging, test it, then promote again.

## 3. Package the approved version for the VPS

After checking Mac live:

```bash
python3 scripts/local.py package
```

The command verifies the live release and source again and produces a file like:

```
backups/releases/oak-restaurant-release-ABC123.zip
```

Use the EXACT filename printed by the command. It includes a source-only release
manifest. It excludes admin passwords, local sessions, SQLite databases, uploads,
backups, preview state and staging test data. It does include your original logo
and the decorative generated hero image.

## 4. Upload the release, not the starter bundle

On your Mac, substitute the actual release filename:

```bash
scp "backups/releases/ACTUAL_RELEASE_FILENAME.zip" root@162.35.33.141:/opt/oak-migration/
ssh root@162.35.33.141
```

Then on the VPS:

```bash
python3 -m zipfile -e /opt/oak-migration/ACTUAL_RELEASE_FILENAME.zip /opt
python3 /opt/oak-restaurant/scripts/install-vps.py
```

The VPS installer requires a release manifest and checks that the extracted
source matches the approved Mac release. The VPS builds the SAME source for its
own architecture and reruns tests. It asks for a new production website-admin
password on first installation, persists menu/event content in its own volume,
backs up the new website, and validates Caddy before switching only the root/www
restaurant domain. The expenses hostname and all of its routes remain intact.

If a previous website source tree contains obsolete source files, the fingerprint
check may refuse it. Do not delete secrets or data to get past the check; retain
.env.restaurant and the named volume and investigate the extra source files.

The VPS uses the actual restaurant content entered in its admin panel. Staging
or Mac-live content is NOT automatically copied into VPS production. If you want
to promote a real menu dataset too, that is a separate explicit data migration;
this workflow avoids publishing staging test entries accidentally.

## Update routine

After editing code, repeat:

```bash
python3 scripts/local.py staging
# Test the updated website and admin.
python3 scripts/local.py live
# Check Mac live.
python3 scripts/local.py package
```

Then upload/install the printed release ZIP on the VPS. This first website
workflow is explicit and separate from the expense-system automatic Git pipeline.
It does not deploy restaurant code on every file save or Git commit.

Day-to-day menu/event updates are done in the VPS admin without code deployment.
No DNS changes are needed. Keep real menus/prices, photos, address, hours and
WeChat contact details current there.

Inspect local containers:

```bash
python3 scripts/local.py status
```

Restart/update using the helper rather than mixing the production compose file
with local settings. Access local admin via localhost (not 127.0.0.1) so its origin
matches the configured CSRF check.

## Validation limits

Source-level tests, HTTP/SQLite tests and compose/release helper unit tests run
in the development environment. Docker Desktop builds and live promotion need
to be checked on your Mac. The helpers perform those checks during setup and
fail closed on a mismatch. Local images/data are separate from your expense
containers; no down -v or database overwrite is used.
