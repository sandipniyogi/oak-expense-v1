#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT="${1:-}"
if [[ -z "$PROJECT" ]]; then
  echo "Usage: $0 /path/to/oak-expense-v1"
  exit 1
fi
PROJECT="$(cd "$PROJECT" && pwd)"
if [[ ! -f "$PROJECT/docker-compose.yml" ]]; then
  echo "Not an Oak project: $PROJECT"
  exit 1
fi

FILES=(
  "services/social-api/src/index.js"
  "apps/web/app/social/projects/[id]/page.js"
  "apps/web/app/social/admin/page.js"
  "apps/web/app/social/social.module.css"
)

for rel in "${FILES[@]}"; do
  if [[ ! -f "$PROJECT/$rel" ]]; then
    echo "Missing existing Social Studio file: $PROJECT/$rel"
    echo "Install Oak Social Studio v1 first, then apply v1.1."
    exit 1
  fi
done

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$PROJECT/backups/social-v1.1-before-$STAMP"
mkdir -p "$BACKUP"

for rel in "${FILES[@]}"; do
  mkdir -p "$BACKUP/$(dirname "$rel")" "$PROJECT/$(dirname "$rel")"
  cp "$PROJECT/$rel" "$BACKUP/$rel"
  cp "$PATCH_DIR/$rel" "$PROJECT/$rel"
done

echo "Oak Social Studio v1.1 patch applied."
echo "Backup: $BACKUP"
echo "Only Social Studio files were changed."
echo "No database reset is required."
echo
echo "Next:"
echo "  cd \"$PROJECT\""
echo "  docker compose -f docker-compose.yml -f docker-compose.social.yml --env-file .env.staging build social-api web"
echo "  docker compose -f docker-compose.yml -f docker-compose.social.yml --env-file .env.staging up -d --no-deps social-api web"
