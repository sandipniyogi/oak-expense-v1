#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
echo "Stopping STAGING (test data volume is preserved)"
docker compose --env-file .env.staging down
