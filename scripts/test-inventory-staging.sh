#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-http://localhost:4300}"
echo "== Health =="
curl -fsS "$BASE/health"; echo
echo "== Dashboard =="
curl -fsS "$BASE/dashboard"; echo
