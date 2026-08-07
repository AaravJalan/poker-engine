#!/usr/bin/env bash
# Build frontend + run API from one server. Open http://localhost:8000
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/web"
npm run build 2>/dev/null || { echo "Run: cd web && npm install && npm run build"; exit 1; }
cd "$ROOT/backend"
# Use venv if it exists; otherwise create it
if [ ! -d .venv ]; then python3 -m venv .venv; fi
source .venv/bin/activate
pip install -q -r ../requirements.txt 2>/dev/null || true
echo ""
echo "  Poker Simulation: http://localhost:8000"
echo ""
exec python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
