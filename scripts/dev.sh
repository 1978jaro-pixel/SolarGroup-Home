#!/usr/bin/env bash
# Vývojový režim: backend (8080) + Vite s automatickým obnovením (5173).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
(cd "$ROOT/backend" && .venv/bin/python -m app) &
BACK=$!
trap 'kill $BACK' EXIT
cd "$ROOT/frontend" && npm run dev
