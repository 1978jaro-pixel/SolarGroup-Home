#!/usr/bin/env bash
# Zostaví nasaditeľný balík pre Raspberry Pi: build/solargroup-home-pi-<verzia>.tar.gz
# Spúšťa sa na PC (potrebný Node.js); na Pi sa Node nepotrebuje.
#   scripts/build-pi-package.sh [--no-build]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(sed -n 's/^__version__ = "\(.*\)"/\1/p' backend/app/__init__.py)"
NAME="solargroup-home-pi-$VERSION"
OUT="$ROOT/build"
STAGE="$OUT/$NAME"

if [ "${1:-}" != "--no-build" ]; then
  (cd frontend && npm ci && npm run build)
fi
[ -f frontend/dist/index.html ] || { echo "chýba frontend/dist – spustite bez --no-build" >&2; exit 1; }

rm -rf "$STAGE" "$OUT/$NAME.tar.gz"
mkdir -p "$STAGE/backend" "$STAGE/frontend"
cp -a backend/app "$STAGE/backend/app"
cp backend/requirements.txt backend/.env.example "$STAGE/backend/"
cp -a frontend/dist "$STAGE/frontend/dist"
cp -a deploy docs scripts "$STAGE/"
cp README.md "$STAGE/"
cp deploy/pi/install-pi-update.sh deploy/pi/sgh-rollback.sh deploy/pi/sgh-install-lib.sh deploy/pi/sgh-full-backup.sh deploy/pi/sgh-preflight.sh "$STAGE/"
find "$STAGE" -name '__pycache__' -prune -exec rm -rf {} +
echo "$VERSION" >"$STAGE/VERSION"
cat >"$STAGE/NAINSTALUJ.txt" <<TXT
SolarGroup Home $VERSION – aktualizácia na Raspberry Pi

1. Kontrola (nič nemení): ./sgh-preflight.sh
2. Úplná záloha:          ./sgh-full-backup.sh
3. Skúška (nič nemení):   ./install-pi-update.sh --dry-run
4. Aktualizácia:          ./install-pi-update.sh
5. Návrat späť:           ~/solargroup-home-backups/<záloha>/sgh-rollback.sh <záloha>

Podrobne: docs/NASADENIE_E2.md (kiosk: docs/RASPBERRY_PI_KIOSK.md)
TXT
tar -C "$OUT" -czf "$OUT/$NAME.tar.gz" "$NAME"
(cd "$OUT" && sha256sum "$NAME.tar.gz" >"$NAME.tar.gz.sha256")
echo "Balík: $OUT/$NAME.tar.gz ($(du -h "$OUT/$NAME.tar.gz" | cut -f1))"
