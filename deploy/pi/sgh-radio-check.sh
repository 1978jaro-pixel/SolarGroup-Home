#!/usr/bin/env bash
# SolarGroup Home – overenie internetových rádií priamo na Raspberry Pi (alebo na PC s repozitárom).
#
#   sgh-radio-check.sh                      overí slovenské predvoľby
#   sgh-radio-check.sh --favorites          aj obľúbené a vlastné stanice
#   sgh-radio-check.sh --fix                nefunkčnú predvoľbu nahradí funkčnou z katalógu Radio Browser
#   sgh-radio-check.sh --search "rock" --country AT
#   sgh-radio-check.sh --url https://...    jedna adresa (nič sa neukladá)
#
# Výsledky (OK / NEDOSTUPNÁ / NEPODPOROVANÁ) sa uložia k staniciam a aplikácia ich zobrazí.
# Iba číta streamy (najviac ~32 kB z každého); nemení systém ani službu.
set -euo pipefail
SERVICE="${SGH_SERVICE:-solargroup-home.service}"
if [ -n "${SGH_APP_DIR:-}" ]; then
  APP_DIR="$SGH_APP_DIR"
elif command -v systemctl >/dev/null && systemctl cat "$SERVICE" >/dev/null 2>&1; then
  wd="$(systemctl show -p WorkingDirectory --value "$SERVICE")"
  APP_DIR="${wd%/backend}"
else
  APP_DIR="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"
fi
PY="$APP_DIR/backend/.venv/bin/python"
[ -x "$PY" ] || { echo "Nenašiel som $PY (nastavte SGH_APP_DIR)" >&2; exit 2; }
cd "$APP_DIR/backend"
# spustiť ako vlastník údajov, aby databáza ostala s rovnakými právami
OWNER="$(stat -c %U "$APP_DIR/backend/data" 2>/dev/null || id -un)"
if [ "$OWNER" != "$(id -un)" ]; then
  exec sudo -u "$OWNER" "$PY" -m app.cli radio-check "$@"
fi
exec "$PY" -m app.cli radio-check "$@"
