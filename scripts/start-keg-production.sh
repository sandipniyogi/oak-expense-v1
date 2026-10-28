#!/usr/bin/env bash
set -euo pipefail
export KEG_API_HOST_PORT=4200
docker compose -f docker-compose.yml -f docker-compose.keg.yml --env-file .env.production up -d --build db keg-api web
echo "Keg inventory PRODUCTION: http://localhost:3000/kegs"
echo "Keg API PRODUCTION:       http://localhost:4200/health"
