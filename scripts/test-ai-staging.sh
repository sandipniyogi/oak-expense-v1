#!/usr/bin/env bash
set -euo pipefail

echo "1) Native Ollama"
curl -fsS http://localhost:11434/api/tags >/dev/null
echo "   OK"

echo "2) Oak Local AI"
curl -fsS http://localhost:4400/health
echo

echo "3) Inventory API"
curl -fsS http://localhost:4300/health
echo

echo "4) Structured product proposal"
curl -fsS -X POST http://localhost:4400/product-proposal \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt":"Add Double Apple shisha flavor. We buy 200g and 1kg boxes, reorder below 400g and target 2kg.",
    "categories":[
      {"name":"Kitchen","code":"KITCHEN"},
      {"name":"Bar","code":"BAR"},
      {"name":"Shisha","code":"SHISHA"},
      {"name":"General","code":"GENERAL"}
    ],
    "existing_products":[]
  }'
echo
