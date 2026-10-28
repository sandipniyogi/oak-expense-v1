#!/usr/bin/env bash
set -euo pipefail

echo "1/4 Native Ollama"
curl -fsS http://localhost:11434/api/tags >/dev/null
echo "OK"

echo "2/4 Oak Social API"
curl -fsS http://localhost:4500/health
echo

echo "3/4 Oak Social dashboard data"
curl -fsS http://localhost:4500/dashboard
echo

echo "4/4 Qwen campaign planning smoke test"
curl -fsS -X POST http://localhost:4500/ai/plan \
  -H 'Content-Type: application/json' \
  -d '{"brief":"Create a simple Oak Lounge Friday atmosphere post. Do not invent discounts.","objective":"Awareness","platforms":["instagram"],"languages":["English"],"asset_ids":[]}'
echo
echo "Social Studio test completed."
