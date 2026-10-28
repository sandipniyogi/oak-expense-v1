#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
echo "Stopping PRODUCTION (data volume is preserved)"
docker compose --env-file .env.production down
