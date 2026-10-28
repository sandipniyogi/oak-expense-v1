#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export INVENTORY_API_HOST_PORT=4200
export AI_API_HOST_PORT=4401
export OLLAMA_MODEL="${OLLAMA_MODEL:-qwen3:8b}"
export OLLAMA_URL="${OLLAMA_URL:-http://host.docker.internal:11434}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.inventory.yml -f docker-compose.ai.yml --env-file .env.production)

echo "PRODUCTION deployment requested. Make a database backup first."
curl -fsS http://localhost:11434/api/tags >/dev/null || { echo "Ollama is not reachable on localhost:11434."; exit 1; }
"${COMPOSE[@]}" up -d --no-build db >/dev/null 2>&1 || true
"${COMPOSE[@]}" build inventory-api oak-ai web
"${COMPOSE[@]}" up -d --no-build --no-deps inventory-api oak-ai web

echo "Oak Inventory Production: http://localhost:3000/inventory"
echo "Inventory Operations:     http://localhost:3000/inventory/operations"
echo "Inventory API:            http://localhost:4200/health"
echo "Oak Local AI:             http://localhost:4401/health"
