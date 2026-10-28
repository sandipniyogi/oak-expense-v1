#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export SOCIAL_API_HOST_PORT="${SOCIAL_API_HOST_PORT:-4501}"
export SOCIAL_STORAGE_DIR="${SOCIAL_STORAGE_DIR:-./storage/social}"
export OLLAMA_MODEL="${OLLAMA_MODEL:-qwen3:8b}"
export OLLAMA_URL="${OLLAMA_URL:-http://host.docker.internal:11434}"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.social.yml --env-file .env.production)

echo "Checking native Ollama..."
curl -fsS http://localhost:11434/api/tags >/dev/null || { echo "Ollama is not reachable on localhost:11434. Start the Ollama app first."; exit 1; }

echo "Ensuring production database is running without rebuilding Expense/OCR services..."
"${COMPOSE[@]}" up -d --no-build db >/dev/null 2>&1 || true

echo "Building only Oak Social API + Web..."
"${COMPOSE[@]}" build social-api web

echo "Starting only Social API + Web..."
"${COMPOSE[@]}" up -d --no-build --no-deps social-api web

echo
printf '%s\n' \
  "Oak Social Dashboard:  http://localhost:3000/social" \
  "Social API Health:     http://localhost:4501/health"
