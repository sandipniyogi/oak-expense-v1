#!/usr/bin/env bash
set -euo pipefail
export KEG_API_HOST_PORT=4300
docker compose -f docker-compose.yml -f docker-compose.keg.yml --env-file .env.staging up -d --build db keg-api web
echo "Keg simulator STAGING: http://localhost:3100/kegs"
echo "Keg API STAGING:       http://localhost:4300/health"
