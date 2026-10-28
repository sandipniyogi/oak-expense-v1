#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

POSTGRES_DB=oak_expenses
POSTGRES_USER=oak
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="backups/oak-production-${STAMP}.sql"

echo "Backing up production database to ${FILE}"
docker compose --env-file .env.production exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$FILE"
echo "Backup complete: ${FILE}"
