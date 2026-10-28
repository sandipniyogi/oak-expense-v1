#!/usr/bin/env bash
set -euo pipefail
BASE=http://localhost:4300
echo "Health:"
curl -s "$BASE/health"; echo
echo "Setup demo:"
curl -s -X POST "$BASE/setup-demo"; echo
echo "Stations:"
curl -s "$BASE/stations"; echo
