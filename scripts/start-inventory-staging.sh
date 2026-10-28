#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export INVENTORY_API_HOST_PORT=4300
export AI_API_HOST_PORT=4400
export OLLAMA_MODEL="${OLLAMA_MODEL:-qwen3:8b}"
export OLLAMA_URL="${OLLAMA_URL:-http://host.docker.internal:11434}"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.inventory.yml -f docker-compose.ai.yml --env-file .env.staging)

echo "Checking native Ollama..."
curl -fsS http://localhost:11434/api/tags >/dev/null || { echo "Ollama is not reachable on localhost:11434. Start the Ollama app first."; exit 1; }

echo "Ensuring staging database is running without rebuilding Expense/OCR services..."
"${COMPOSE[@]}" up -d --no-build db >/dev/null 2>&1 || true

echo "Building only Oak Inventory + Oak AI + Web..."
"${COMPOSE[@]}" build inventory-api oak-ai web

echo "Starting only changed services (no OCR/API rebuild)..."
"${COMPOSE[@]}" up -d --no-build --no-deps inventory-api oak-ai web

echo
printf '%s\n' \
  "Oak Inventory Dashboard:  http://localhost:3100/inventory" \
  "Inventory Operations:     http://localhost:3100/inventory/operations" \
  "Receive Stock:            http://localhost:3100/inventory/receive" \
  "Barcode Scanner:          http://localhost:3100/inventory/scan" \
  "Batch Labels:             http://localhost:3100/inventory/labels" \
  "Admin + Local AI:         http://localhost:3100/inventory/admin" \
  "Inventory API:            http://localhost:4300/health" \
  "Oak Local AI:             http://localhost:4400/health"
