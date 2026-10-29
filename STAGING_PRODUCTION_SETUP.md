# Oak Expense — Production + Staging Local Setup

This setup keeps two completely separate local environments while using the same source code.

## Production

Use for real expenses, calculations and Excel reports sent to partners.

- Web: http://localhost:3000
- API: http://localhost:4000
- PostgreSQL host port: 5432
- OCR host port: 8001
- Database: `oak_expenses`
- Docker project/volume prefix: `oak-expense-v1`
- Screenshots: `storage/uploads`
- Reports: `storage/reports`

The production stack deliberately keeps the project name `oak-expense-v1`, matching the current project. This lets Docker reuse the existing `oak-expense-v1_pgdata` volume instead of creating an empty production database.

## Staging

Use only for development and test data.

- Web: http://localhost:3100
- API: http://localhost:4100
- PostgreSQL host port: 5433
- OCR host port: 8101
- Database: `oak_expenses_staging`
- Docker project/volume prefix: `oak-expense-staging`
- Screenshots: `storage-staging/uploads`
- Reports: `storage-staging/reports`

The staging page displays a yellow `STAGING — TEST DATA ONLY` banner.

## Installation

Copy these patch files into the matching locations of the existing `oak-expense-v1` project. Replace only the listed files; do not replace the whole `apps` folders.

Files:

- `docker-compose.yml`
- `.env.production`
- `.env.staging`
- `apps/web/Dockerfile`
- `apps/web/app/layout.js`
- `scripts/*`

Create staging storage directories if needed:

```bash
mkdir -p storage-staging/uploads storage-staging/reports backups
```

## Start both environments

Production:

```bash
./scripts/start-production.sh
```

Staging:

```bash
./scripts/start-staging.sh
```

They can run at the same time because their ports, databases and screenshot directories are different.

Check them:

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.staging ps
```

## Recommended development workflow

1. Keep Production running with real data.
2. Modify code in the project.
3. Rebuild only Staging:

```bash
./scripts/start-staging.sh
```

4. Test uploads, OCR, manual entries, reports and Excel exports at `http://localhost:3100`.
5. When satisfied, back up Production:

```bash
./scripts/backup-production.sh
```

6. Rebuild Production with the tested source code:

```bash
./scripts/start-production.sh
```

7. Generate partner Excel files only from `http://localhost:3000`.

## Important database rule

Never use this for Production:

```bash
docker compose --env-file .env.production down -v
```

`-v` deletes the production PostgreSQL volume.

Normal stop is safe:

```bash
./scripts/stop-production.sh
```

## Resetting Staging

Because staging contains test data, it can be reset when needed:

```bash
docker compose --env-file .env.staging down -v
rm -rf storage-staging/uploads storage-staging/reports
mkdir -p storage-staging/uploads storage-staging/reports
./scripts/start-staging.sh
```

This deletes only the staging database because the staging Docker project name is different from Production.

## Database/schema changes during future development

`db/init/001_schema.sql` runs automatically only when PostgreSQL creates a brand-new volume. Editing that file does not update an existing Production database.

For a future schema change:

1. Develop the migration SQL.
2. Apply/test it on Staging first.
3. Back up Production.
4. Apply the same migration to Production.
5. Rebuild Production only after Staging is verified.

Do not delete the Production volume just to make a schema change.

## Partner names

Your current payer list should be Sandip, Vicky and Yolanda (plus Company if you keep that payer). Apply the partner-name migration separately to both databases if required.
