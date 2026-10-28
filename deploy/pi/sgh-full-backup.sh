#!/usr/bin/env bash
# SolarGroup Home – ÚPLNÁ záloha aktuálnej inštalácie pred aktualizáciou (napr. E1 0.3.0 pred E2 0.4.0).
#
#   ./sgh-full-backup.sh            záloha (na ~1 minútu zastaví službu kvôli konzistentnej databáze)
#   ./sgh-full-backup.sh --live     bez zastavenia služby (databáza sa skopíruje cez SQLite backup)
#   voľby: --app-dir <cesta>  --yes  --dest <adresár>   (predvolene ~/solargroup-home-backups)
#
# Na rozdiel od zálohy inštalátora obsahuje AJ Python prostredie (.venv), súbor služby systemd
# a jej doplnky, nastavenia kiosku, labwc autostart, crontab a zoznam Python balíkov.
# Iba ČÍTA: nič v aplikácii nemení. Adresár SolarGroup PV Dashboard v1.4 sa nezálohuje ani nemení –
# iba sa pred a po porovná jeho odtlačok.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=sgh-install-lib.sh
. "$HERE/sgh-install-lib.sh"

LIVE=0
APP_DIR=""
DEST=""
while [ $# -gt 0 ]; do
  case "$1" in
    --live) LIVE=1 ;;
    --yes) ASSUME_YES=1 ;;
    --app-dir) APP_DIR="$2"; shift ;;
    --dest) DEST="$2"; shift ;;
    -h | --help) sed -n '2,12p' "$0"; exit 0 ;;
    *) die "neznáma voľba $1" ;;
  esac
  shift
done

info "== SolarGroup Home – úplná záloha"
detect_install
guard_protected
DEST="${DEST:-$SGH_BACKUP_ROOT}"
TS="$(date +%Y%m%d-%H%M%S)"
BK="$DEST/UPLNA-$TS-v$OLD_VERSION"
info "  aplikácia: $APP_DIR (verzia $OLD_VERSION, služba $SGH_SERVICE, používateľ $SVC_USER)"
info "  cieľ:      $BK"

need_mb=$(($(sudo du -sm "$APP_DIR" | cut -f1) + 50))
mkdir -p "$DEST"
free_mb=$(df -Pm "$DEST" | awk 'NR==2 {print $4}')
info "  potrebné miesto ~${need_mb} MB, voľné ${free_mb} MB"
[ "$free_mb" -gt "$need_mb" ] || die "málo miesta v $DEST"
fp_before="$(protected_fingerprint)"
ok "odtlačok $SGH_PROTECTED: ${fp_before:0:16}…"
if [ "$LIVE" = 0 ]; then
  confirm "Služba sa na chvíľu zastaví (kiosk ukáže chybu pripojenia). Pokračovať?" || die "Zrušené."
fi

mkdir -p "$BK"
restart() { [ "$LIVE" = 0 ] && { sudo systemctl start "$SGH_SERVICE" || true; }; }
trap 'warn "záloha zlyhala"; restart' ERR

if [ "$LIVE" = 0 ]; then
  sudo systemctl stop "$SGH_SERVICE"
  sudo tar -C "$(dirname "$APP_DIR")" -czf "$BK/aplikacia-uplna.tar.gz" --exclude='__pycache__' --exclude='node_modules' "$(basename "$APP_DIR")"
else
  sudo tar -C "$(dirname "$APP_DIR")" -czf "$BK/aplikacia-uplna.tar.gz" --exclude='__pycache__' --exclude='node_modules' \
    --exclude="$(basename "$APP_DIR")/backend/data/*.sqlite3*" "$(basename "$APP_DIR")"
  for db in "$APP_DIR"/backend/data/*.sqlite3; do
    [ -f "$db" ] || continue
    sudo -u "$SVC_USER" "$PY" -c 'import sqlite3,sys; s=sqlite3.connect(sys.argv[1]); d=sqlite3.connect(sys.argv[2]); s.backup(d); d.close()' "$db" "/tmp/sgh-$TS-$(basename "$db")"
    sudo mv "/tmp/sgh-$TS-$(basename "$db")" "$BK/$(basename "$db")"
  done
fi
[ -n "$DATA_EXT" ] && sudo tar -C "$(dirname "$DATA_EXT")" -czf "$BK/udaje-externe.tar.gz" "$(basename "$DATA_EXT")"

# systémová konfigurácia služby (súbor + doplnky drop-in)
mkdir -p "$BK/system"
systemctl cat "$SGH_SERVICE" >"$BK/system/sluzba-systemctl-cat.txt" 2>&1 || true
frag="$(systemctl show -p FragmentPath --value "$SGH_SERVICE")"
[ -n "$frag" ] && [ -f "$frag" ] && sudo cp -p "$frag" "$BK/system/"
for d in $(systemctl show -p DropInPaths --value "$SGH_SERVICE"); do [ -f "$d" ] && sudo cp -p "$d" "$BK/system/dropin-$(basename "$d")"; done
echo "$frag" >"$BK/system/cesta-sluzby.txt"

# kiosk, autostart, crontab
[ -d "$SGH_KIOSK_DIR" ] && tar -C "$(dirname "$SGH_KIOSK_DIR")" -czf "$BK/kiosk-skripty.tar.gz" "$(basename "$SGH_KIOSK_DIR")"
[ -d "$HOME/.config/solargroup-home" ] && tar -C "$HOME/.config" -czf "$BK/kiosk-nastavenia.tar.gz" solargroup-home
[ -f "$HOME/.config/labwc/autostart" ] && cp -p "$HOME/.config/labwc/autostart" "$BK/labwc-autostart"
crontab -l >"$BK/crontab.txt" 2>/dev/null || echo "(žiadny crontab)" >"$BK/crontab.txt"

# zoznam balíkov a prostredia (na porovnanie a obnovu)
# shellcheck disable=SC2024 # výstup patrí používateľovi, ktorý zálohuje
sudo -u "$SVC_USER" "$PY" -m pip freeze >"$BK/python-balicky.txt" 2>/dev/null || true
"$PY" --version >"$BK/python-verzia.txt" 2>&1 || true

restart
trap - ERR
sudo chown -R "$(id -u):$(id -g)" "$BK"
chmod 700 "$BK"
tar -tzf "$BK/aplikacia-uplna.tar.gz" >/dev/null || die "archív aplikácie je poškodený"
(cd "$BK" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum >SHA256SUMS)

cat >"$BK/OBNOVA.txt" <<TXT
Úplná záloha SolarGroup Home $OLD_VERSION z $TS
Aplikácia: $APP_DIR   služba: $SGH_SERVICE   používateľ: $SVC_USER

Bežný návrat po aktualizácii robí sgh-rollback.sh (záloha inštalátora). Táto úplná záloha je
posledná možnosť – obnoví aplikáciu vrátane .venv, údajov a .env presne do stavu pri zálohe:

  cd "$BK" && sha256sum -c SHA256SUMS
  sudo systemctl stop $SGH_SERVICE
  sudo mv "$APP_DIR" "$APP_DIR.pred-obnovou-\$(date +%Y%m%d-%H%M%S)"
  sudo tar -C "$(dirname "$APP_DIR")" -xzf aplikacia-uplna.tar.gz
$( [ "$LIVE" = 1 ] && echo "  sudo cp -p *.sqlite3 \"$APP_DIR/backend/data/\" && sudo chown $APP_OWNER \"$APP_DIR/backend/data/\"*.sqlite3" )
$( [ -n "$frag" ] && echo "  # iba ak sa zmenil súbor služby: sudo cp system/$(basename "$frag") \"$frag\" && sudo systemctl daemon-reload" )
  [ -f kiosk-skripty.tar.gz ] && tar -C "$(dirname "$SGH_KIOSK_DIR")" -xzf kiosk-skripty.tar.gz
  [ -f kiosk-nastavenia.tar.gz ] && tar -C "\$HOME/.config" -xzf kiosk-nastavenia.tar.gz
  [ -f labwc-autostart ] && cp -p labwc-autostart "\$HOME/.config/labwc/autostart"
  sudo systemctl start $SGH_SERVICE
  curl -s $SGH_BASE_URL/api/health

$SGH_PROTECTED sa nezálohuje ani neobnovuje (nikdy sa ho nedotýkame).
TXT

fp_after="$(protected_fingerprint)"
[ "$fp_before" = "$fp_after" ] && ok "$SGH_PROTECTED nezmenený" || warn "odtlačok $SGH_PROTECTED sa zmenil počas zálohy (tento skript doň nezapisuje)"
if [ "$LIVE" = 0 ]; then
  for _ in $(seq 1 60); do health_ok && break; sleep 1; done
  health_ok && ok "služba znova beží" || warn "služba po zálohe neodpovedá – skontrolujte: sudo systemctl status $SGH_SERVICE"
fi
ok "úplná záloha: $BK ($(du -sh "$BK" | cut -f1))"
info "  kontrola: cd \"$BK\" && sha256sum -c SHA256SUMS"
info "  obnova:   $BK/OBNOVA.txt"
