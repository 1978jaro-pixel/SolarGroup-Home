#!/usr/bin/env bash
# SolarGroup Home – návrat na verziu zo zálohy, ktorú vytvoril install-pi-update.sh.
#
#   sgh-rollback.sh                       použije najnovšiu zálohu v ~/solargroup-home-backups
#   sgh-rollback.sh <adresár-zálohy>
#   voľby: --keep-data   ponechať súčasné údaje (inak sa vrátia aj údaje zo zálohy)
#          --code-only   nevracať autostart ani skripty kiosku
#          --yes         bez otázok
#
# Súčasný stav sa pred návratom odloží vedľa ako <aplikácia>.pred-rollback-<čas> (nič sa nemaže).
# Nedotýka sa služby systemd ani /home/solargroup/solar-dashboard-v1.4.
set -Eeuo pipefail
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
# shellcheck source=sgh-install-lib.sh
. "$HERE/sgh-install-lib.sh"

ASSUME_YES=0
KEEP_DATA=0
CODE_ONLY=0
BK=""
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) ASSUME_YES=1 ;;
    --keep-data) KEEP_DATA=1 ;;
    --code-only) CODE_ONLY=1 ;;
    -h | --help) sed -n '2,12p' "$0"; exit 0 ;;
    *) BK="$1" ;;
  esac
  shift
done
[ "$(id -u)" = 0 ] && die "Nespúšťajte ako root."
if [ -z "$BK" ]; then
  BK="$(find "$SGH_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -n1)"
  [ -n "$BK" ] || die "Žiadna záloha v $SGH_BACKUP_ROOT"
fi
BK="$(readlink -f "$BK")"
[ -f "$BK/manifest.env" ] && [ -f "$BK/app.tar.gz" ] || die "$BK nie je záloha SolarGroup Home"
# shellcheck disable=SC1091
. "$BK/manifest.env"
guard_protected

info "== Návrat SolarGroup Home =="
info "  záloha:      $BK (vytvorená $CREATED)"
info "  verzia:      $NEW_VERSION → $OLD_VERSION"
info "  aplikácia:   $APP_DIR"
if [ "$KEEP_DATA" = 1 ]; then info "  údaje:       ponechajú sa súčasné"; else warn "  údaje:       vrátia sa zo zálohy (zmeny po $CREATED sa stratia; súčasné ostanú v odloženej kópii)"; fi
[ "$CODE_ONLY" = 1 ] || info "  autostart a skripty kiosku: vrátia sa zo zálohy (ak boli zálohované)"
confirm "Vykonať návrat?" || die "Zrušené."
sudo -v

sudo systemctl stop "$SGH_SERVICE" || true
TS="$(date +%Y%m%d-%H%M%S)"
PARENT="$(dirname "$APP_DIR")"
NAME="$(basename "$APP_DIR")"
STAGE="$PARENT/.$NAME.restore-$TS"
ASIDE="$APP_DIR.pred-rollback-$TS"

sudo mkdir -p "$STAGE"
sudo tar -C "$STAGE" -xzf "$BK/app.tar.gz"
[ -d "$STAGE/$NAME/backend" ] || die "záloha neobsahuje $NAME/backend"
# virtuálne prostredie Pythonu sa prenesie (nie je v zálohe)
[ -d "$APP_DIR/backend/.venv" ] && sudo mv "$APP_DIR/backend/.venv" "$STAGE/$NAME/backend/.venv"
if [ "$KEEP_DATA" = 1 ] && [ -d "$APP_DIR/backend/data" ]; then
  sudo rm -rf "$STAGE/$NAME/backend/data"
  sudo cp -a "$APP_DIR/backend/data" "$STAGE/$NAME/backend/data"
fi
sudo mv "$APP_DIR" "$ASIDE"
sudo mv "$STAGE/$NAME" "$APP_DIR"
sudo rmdir "$STAGE"
ok "kód obnovený, predchádzajúci stav odložený v $ASIDE"

if [ -n "${DATA_EXT:-}" ] && [ "$KEEP_DATA" = 0 ] && [ -f "$BK/data-ext.tar.gz" ]; then
  sudo mv "$DATA_EXT" "$DATA_EXT.pred-rollback-$TS"
  sudo tar -C "$(dirname "$DATA_EXT")" -xzf "$BK/data-ext.tar.gz"
  ok "externé údaje obnovené ($DATA_EXT)"
fi

if [ "$CODE_ONLY" = 0 ]; then
  if [ -f "$BK/labwc-autostart" ]; then
    cp -p "$HOME/.config/labwc/autostart" "$HOME/.config/labwc/autostart.pred-rollback-$TS" 2>/dev/null || true
    cp -p "$BK/labwc-autostart" "$HOME/.config/labwc/autostart"
    ok "autostart labwc obnovený (prejaví sa po novom prihlásení)"
  fi
  if [ -f "$BK/kiosk-scripts.tar.gz" ]; then
    tar -C "$(dirname "$SGH_KIOSK_DIR")" -xzf "$BK/kiosk-scripts.tar.gz"
    ok "skripty kiosku obnovené"
  fi
  [ -f "$BK/kiosk-config.tar.gz" ] && tar -C "$HOME/.config" -xzf "$BK/kiosk-config.tar.gz" && ok "nastavenia kiosku obnovené"
fi

sudo systemctl start "$SGH_SERVICE"
if wait_health "$OLD_VERSION" 90; then
  ok "backend beží, verzia $OLD_VERSION"
else
  warn "backend neodpovedá s verziou $OLD_VERSION – pozrite: journalctl -u $SGH_SERVICE -n 50"
  exit 1
fi
fp="$(protected_fingerprint)"
[ "$fp" = "${PROTECTED_FINGERPRINT:-}" ] && ok "$SGH_PROTECTED nezmenený" || warn "odtlačok $SGH_PROTECTED sa líši od stavu pri zálohe (tento skript doň nezapisuje)"
info "Odloženú kópiu $ASIDE môžete po overení zmazať: sudo rm -rf '$ASIDE'"
