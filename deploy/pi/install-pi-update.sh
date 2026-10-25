#!/usr/bin/env bash
# SolarGroup Home – aktualizácia EXISTUJÚCEJ inštalácie na Raspberry Pi (Debian 13, labwc).
#
#   ./install-pi-update.sh --dry-run     iba kontroly a plán, nič nemení
#   ./install-pi-update.sh               kontroly → záloha → aktualizácia → overenie (pýta potvrdenie)
#   voľby: --app-dir <cesta>  --yes  --skip-kiosk  --autostart
#
# Spúšťajte ako používateľ grafickej relácie (napr. solargroup), nie ako root; sudo si skript vypýta.
# - Nevytvára novú službu – použije existujúcu solargroup-home.service.
# - Nemení údaje (backend/data), .env ani prihlasovacie účty.
# - Nedotýka sa /home/solargroup/solar-dashboard-v1.4 (overí odtlačkom pred a po).
# - Autostart kiosku mení iba s voľbou --autostart a po potvrdení (so zálohou).
# - Pri zlyhaní overenia automaticky vráti predchádzajúcu verziu kódu.
set -Eeuo pipefail
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
# shellcheck source=sgh-install-lib.sh
. "$HERE/sgh-install-lib.sh"

DRY=0
ASSUME_YES=0
DO_KIOSK=1
DO_AUTOSTART=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --yes) ASSUME_YES=1 ;;
    --app-dir) APP_DIR="$2"; shift ;;
    --skip-kiosk) DO_KIOSK=0 ;;
    --autostart) DO_AUTOSTART=1 ;;
    -h | --help) sed -n '2,14p' "$0"; exit 0 ;;
    *) die "Neznáma voľba $1" ;;
  esac
  shift
done

[ "$(id -u)" = 0 ] && die "Nespúšťajte ako root – spustite ako používateľ grafickej relácie (sudo sa vypýta)."

# Balík: buď koreň balíka (backend/, frontend/dist, deploy/pi), alebo deploy/pi v repozitári
if [ -d "$HERE/backend/app" ]; then PKG="$HERE"; else PKG="$(cd "$HERE/../.." && pwd)"; fi
[ -f "$PKG/frontend/dist/index.html" ] || die "V balíku chýba zostavený frontend ($PKG/frontend/dist). Použite balík z build-pi-package.sh."
NEW_VERSION="$(sed -n 's/^__version__ = "\(.*\)"/\1/p' "$PKG/backend/app/__init__.py")"

info "== SolarGroup Home – aktualizácia na $NEW_VERSION =="
[ "$DRY" = 1 ] && warn "SKÚŠOBNÝ REŽIM (--dry-run): nič sa nezmení"
sudo -v || die "Potrebné sudo."

# ---------------------------------------------------------------- 1. kontroly
info ""
info "-- 1/6 Kontroly"
detect_install
guard_protected
ok "inštalácia: $APP_DIR (verzia $OLD_VERSION, služba $SGH_SERVICE, používateľ $SVC_USER)"
ok "python služby: $PY"
[ -n "$DATA_EXT" ] && ok "externý adresár údajov: $DATA_EXT"
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  info "  systém: ${PRETTY_NAME:-?}, $(uname -m)"
  [ "${VERSION_ID:-}" = 13 ] || warn "testované pre Debian 13 – zistené ${VERSION_ID:-?}"
fi
mem_total=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
mem_avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
info "  RAM: spolu ${mem_total} MB, voľná ${mem_avail} MB"
[ "$mem_avail" -lt 300 ] && warn "menej ako 300 MB voľnej RAM – zatvorte nepotrebné programy pred aktualizáciou"
disk_app=$(df -Pm "$APP_DIR" | awk 'NR==2 {print $4}')
disk_home=$(df -Pm "$HOME" | awk 'NR==2 {print $4}')
info "  voľné miesto: aplikácia ${disk_app} MB, domov ${disk_home} MB"
[ "$disk_app" -lt 300 ] && die "málo miesta pri aplikácii (< 300 MB)"
[ "$disk_home" -lt 300 ] && die "málo miesta na zálohu v $HOME (< 300 MB)"
[ -x "$PY" ] || die "python služby $PY neexistuje"
"$PY" -c 'import sys; assert sys.version_info >= (3, 11)' || die "potrebný Python 3.11+"
missing=()
for c in curl flock tar sha256sum; do command -v "$c" >/dev/null || missing+=("$c"); done
[ ${#missing[@]} -gt 0 ] && die "chýbajú príkazy: ${missing[*]} (sudo apt install ${missing[*]})"
if [ "$DO_KIOSK" = 1 ]; then
  command -v chromium >/dev/null || command -v chromium-browser >/dev/null || warn "Chromium nie je nainštalovaný (sudo apt install chromium) – kiosk nepôjde"
  for c in wlopm wlr-randr; do command -v "$c" >/dev/null || warn "$c chýba – obnova displeja ho nepoužije (voliteľné: sudo apt install $c)"; done
fi
if health_ok; then info "  backend teraz: odpovedá"; else warn "backend teraz neodpovedá na $SGH_BASE_URL/api/health"; fi
fp_before="$(protected_fingerprint)"
ok "odtlačok $SGH_PROTECTED: ${fp_before:0:16}…"
need_pip=0
if ! cmp -s "$PKG/backend/requirements.txt" "$APP_DIR/backend/requirements.txt" ||
  ! sudo -u "$SVC_USER" "$PY" -c 'import fastapi, uvicorn, pydantic_settings, httpx, tzdata' 2>/dev/null; then
  need_pip=1
  warn "zmenené alebo chýbajúce Python balíky – bude potrebný internet (pip install)"
fi

TS="$(date +%Y%m%d-%H%M%S)"
BK="$SGH_BACKUP_ROOT/$TS-v$OLD_VERSION"
info ""
info "-- Plán"
info "  1. zastaviť $SGH_SERVICE (kiosk na chvíľu ukáže chybu pripojenia)"
info "  2. záloha do $BK"
info "  3. nahradiť: ${SGH_PARTS_DIRS[*]} ${SGH_PARTS_FILES[*]}"
info "     NEMENÍ SA: backend/data, backend/.env, .venv, služba systemd, $SGH_PROTECTED"
[ "$need_pip" = 1 ] && info "  3b. pip install -r backend/requirements.txt"
info "  4. spustiť službu a overiť /api/health (verzia $NEW_VERSION) (inak automatický návrat)"
[ "$DO_KIOSK" = 1 ] && info "  5. skripty kiosku do $SGH_KIOSK_DIR"
[ "$DO_AUTOSTART" = 1 ] && info "  6. autostart labwc (zobrazí rozdiel a opýta sa)"
if [ "$DRY" = 1 ]; then
  ok "skúšobný režim dokončený – nič sa nezmenilo"
  exit 0
fi
confirm "Pokračovať?" || die "Zrušené používateľom."

# ---------------------------------------------------------------- 2. záloha
info ""
info "-- 2/6 Zastavenie služby a záloha"
sudo systemctl stop "$SGH_SERVICE"
restart_old() { warn "spúšťam pôvodnú verziu"; sudo systemctl start "$SGH_SERVICE" || true; }
trap 'restart_old' ERR
mkdir -p "$BK"
sudo tar -C "$(dirname "$APP_DIR")" -czf "$BK/app.tar.gz" \
  --exclude="$(basename "$APP_DIR")/backend/.venv" --exclude='node_modules' --exclude='__pycache__' \
  "$(basename "$APP_DIR")"
[ -n "$DATA_EXT" ] && sudo tar -C "$(dirname "$DATA_EXT")" -czf "$BK/data-ext.tar.gz" "$(basename "$DATA_EXT")"
sudo chown "$(id -u):$(id -g)" "$BK"/*.tar.gz
systemctl cat "$SGH_SERVICE" >"$BK/service.txt" 2>&1 || true
[ -f "$HOME/.config/labwc/autostart" ] && cp -p "$HOME/.config/labwc/autostart" "$BK/labwc-autostart"
[ -d "$HOME/.config/solargroup-home" ] && tar -C "$HOME/.config" -czf "$BK/kiosk-config.tar.gz" solargroup-home
[ -d "$SGH_KIOSK_DIR" ] && tar -C "$(dirname "$SGH_KIOSK_DIR")" -czf "$BK/kiosk-scripts.tar.gz" "$(basename "$SGH_KIOSK_DIR")"
cp -f "$HERE/sgh-rollback.sh" "$HERE/sgh-install-lib.sh" "$BK/"
cat >"$BK/manifest.env" <<EOF
APP_DIR='$APP_DIR'
APP_OWNER='$APP_OWNER'
SVC_USER='$SVC_USER'
PY='$PY'
DATA_EXT='$DATA_EXT'
OLD_VERSION='$OLD_VERSION'
NEW_VERSION='$NEW_VERSION'
SGH_BASE_URL='$SGH_BASE_URL'
CREATED='$TS'
PROTECTED_FINGERPRINT='$fp_before'
EOF
tar -tzf "$BK/app.tar.gz" >/dev/null || die "záloha je poškodená"
ok "záloha: $BK ($(du -sh "$BK" | cut -f1))"

# ---------------------------------------------------------------- 3. aktualizácia
info ""
info "-- 3/6 Aktualizácia súborov"
revert() {
  warn "VRACIAM pôvodnú verziu zo zálohy…"
  trap - ERR
  ASSUME_YES=1 bash "$BK/sgh-rollback.sh" --yes --keep-data --code-only "$BK" || warn "automatický návrat zlyhal – použite: $BK/sgh-rollback.sh $BK"
  exit 1
}
trap 'revert' ERR
for d in "${SGH_PARTS_DIRS[@]}"; do replace_dir "$PKG/$d" "$APP_DIR/$d"; done
for f in "${SGH_PARTS_FILES[@]}"; do [ -f "$PKG/$f" ] && sudo cp -f "$PKG/$f" "$APP_DIR/$f"; done
sudo chown -R "$APP_OWNER" "$APP_DIR/backend/app" "$APP_DIR/frontend" "$APP_DIR/deploy" "$APP_DIR/docs" "$APP_DIR/scripts" "$APP_DIR/backend/requirements.txt"
ok "súbory nahradené"
if [ "$need_pip" = 1 ]; then
  sudo -u "$SVC_USER" "$PY" -m pip install --disable-pip-version-check -q -r "$APP_DIR/backend/requirements.txt"
  ok "Python balíky aktualizované"
fi

# ---------------------------------------------------------------- 4. overenie
info ""
info "-- 4/6 Spustenie a overenie"
sudo systemctl start "$SGH_SERVICE"
if ! wait_health "$NEW_VERSION" 90; then
  sudo journalctl -u "$SGH_SERVICE" -n 30 --no-pager || true
  false
fi
trap - ERR
ok "backend beží, verzia $NEW_VERSION"

# ---------------------------------------------------------------- 5. kiosk
if [ "$DO_KIOSK" = 1 ]; then
  info ""
  info "-- 5/6 Skripty kiosku"
  install_kiosk_scripts "$PKG/deploy/pi"
  ok "skripty: $SGH_KIOSK_DIR, nastavenia: ~/.config/solargroup-home/kiosk.env"
fi
if [ "$DO_AUTOSTART" = 1 ]; then
  info ""
  info "-- 6/6 Autostart"
  ASSUME_YES=0 "$SGH_KIOSK_DIR/sgh-autostart.sh" enable || warn "autostart nezmenený"
else
  info "  autostart nezmenený (zapnutie: $SGH_KIOSK_DIR/sgh-autostart.sh enable)"
fi

fp_after="$(protected_fingerprint)"
if [ "$fp_after" = "$fp_before" ]; then ok "$SGH_PROTECTED nezmenený"; else warn "odtlačok $SGH_PROTECTED sa ZMENIL – skontrolujte (tento skript doň nezapisuje)"; fi
info ""
ok "Hotovo. Návrat na predchádzajúcu verziu: $BK/sgh-rollback.sh $BK"
