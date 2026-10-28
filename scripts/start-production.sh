#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
echo "Starting PRODUCTION on http://localhost:3000"
docker compose --env-file .env.production up -d --build
