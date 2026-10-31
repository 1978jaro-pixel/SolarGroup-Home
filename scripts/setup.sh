#!/usr/bin/env bash
# SolarGroup Home – inštalácia na Linux / Raspberry Pi OS / macOS (lokálne).
#   ./scripts/setup.sh            – backend + frontend (vyžaduje Node.js)
#   ./scripts/setup.sh --no-build – iba backend (frontend/dist skopírujete z PC)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/backend"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip >/dev/null
.venv/bin/pip install -r requirements.txt
if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  echo "Vytvorený backend/.env (režim DEMO)."
fi

if [[ "${1:-}" != "--no-build" ]]; then
  cd "$ROOT/frontend"
  npm ci
  npm run build
fi
echo "Hotovo. Spustenie: ./scripts/start.sh"
