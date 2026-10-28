#!/usr/bin/env bash
set -euo pipefail

echo "1/4 Ollama"
curl -fsS http://localhost:11434/api/tags >/dev/null && echo "  OK"
echo "2/4 Oak AI"
curl -fsS http://localhost:4400/health && echo
echo "3/4 Inventory API"
curl -fsS http://localhost:4300/health && echo
echo "4/4 Operations payload"
curl -fsS http://localhost:4300/operations | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  products:",len(d.get("products",[]))); print("  locations:",len(d.get("locations",[]))); print("  movements:",len(d.get("recent_movements",[]))); print("  build:",d.get("build"))'
