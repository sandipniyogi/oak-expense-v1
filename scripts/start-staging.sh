#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p storage-staging/uploads storage-staging/reports
echo "Starting STAGING on http://localhost:3100"
docker compose --env-file .env.staging up -d --build
