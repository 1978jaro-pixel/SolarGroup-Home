#!/usr/bin/env bash
# SolarGroup Home – kontrola Raspberry Pi pred aktualizáciou na E2 (0.4.0). NIČ NEMENÍ.
#
#   ./sgh-preflight.sh [--app-dir <cesta>]
#
# Overí: verziu a stav služby, Python, RAM, swap, miesto na disku, dostupnosť hotových Python
# balíkov pre túto architektúru (bez inštalácie), internet (PyPI, Radio Browser, Google),
# adresu kiosku (kvôli prihláseniu Google) a že SolarGroup PV Dashboard v1.4 ostáva nedotknutý.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=sgh-install-lib.sh
. "$HERE/sgh-install-lib.sh"
PKG="$HERE"
APP_DIR=""
[ "${1:-}" = "--app-dir" ] && APP_DIR="${2:-}"
FAIL=0
bad() { printf '%s✘%s %s\n' "$c_red" "$c_off" "$*"; FAIL=1; }

info "== SolarGroup Home – predbežná kontrola (nič sa nemení)"
detect_install
info "  aplikácia: $APP_DIR, služba $SGH_SERVICE, používateľ $SVC_USER, Python $PY"
info "  nainštalovaná verzia: $OLD_VERSION, nová: $(cat "$PKG/VERSION" 2>/dev/null || echo ?)"
health_ok && ok "backend odpovedá na $SGH_BASE_URL" || bad "backend neodpovedá na $SGH_BASE_URL/api/health"

"$PY" -c 'import sys; assert sys.version_info >= (3, 11)' 2>/dev/null && ok "Python $("$PY" -c 'import platform; print(platform.python_version())') ($(uname -m))" || bad "potrebný Python 3.11+"

mem_total=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
mem_avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
swap=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
info "  RAM: ${mem_total} MB, voľná ${mem_avail} MB, swap ${swap} MB"
[ "$mem_avail" -ge 250 ] && ok "dostatok voľnej RAM na aktualizáciu" || warn "menej ako 250 MB voľnej RAM – pred aktualizáciou zatvorte Chromium (kiosk)"
[ "$swap" -ge 200 ] || warn "swap menší ako 200 MB – pri 1 GB RAM odporúčame aspoň 512 MB (docs/NASADENIE_E2.md)"
pid=$(systemctl show -p MainPID --value "$SGH_SERVICE")
[ -n "$pid" ] && [ "$pid" != 0 ] && info "  backend teraz používa $(awk '/VmRSS/ {print int($2/1024)}' "/proc/$pid/status" 2>/dev/null) MB RAM"

for p in "$APP_DIR" "$HOME"; do
  f=$(df -Pm "$p" | awk 'NR==2 {print $4}')
  [ "$f" -ge 500 ] && ok "voľné miesto pri $p: ${f} MB" || bad "pri $p je iba ${f} MB (potrebných aspoň 500 MB: záloha + nové balíky)"
done

# Hotové balíky (wheels) pre túto architektúru – bez inštalácie, bez kompilácie
if [ -f "$PKG/backend/requirements.txt" ]; then
  # shellcheck disable=SC2024 # záznam patrí používateľovi, ktorý kontrolu spustil
  if sudo -u "$SVC_USER" "$PY" -m pip install --dry-run --disable-pip-version-check --no-cache-dir -q --only-binary=:all: -r "$PKG/backend/requirements.txt" >/tmp/sgh-preflight-pip.log 2>&1; then
    ok "všetky Python balíky E2 sú dostupné ako hotové balíky (nič sa nenainštalovalo)"
  else
    bad "niektorý Python balík nie je dostupný – pozri /tmp/sgh-preflight-pip.log"
  fi
fi

# PyPI je nutné (inštalácia balíkov); rádio a Google iba pre nové funkcie – ich výpadok aktualizáciu neblokuje
code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' https://pypi.org/simple/cryptography/)
[ "$code" != 000 ] && ok "internet: PyPI (HTTP $code)" || bad "PyPI nedostupné – aktualizácia potrebuje internet"
for u in https://all.api.radio-browser.info/json/servers https://oauth2.googleapis.com https://www.googleapis.com/calendar/v3/ https://calendar.google.com; do
  code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' "$u")
  [ "$code" != 000 ] && ok "internet: $u (HTTP $code)" || warn "nedostupné: $u (aktualizáciu neblokuje, funkcia nebude fungovať)"
done

env="$HOME/.config/solargroup-home/kiosk.env"
if [ -f "$env" ]; then
  url=$(sed -n 's/^SGH_BASE_URL=//p' "$env" | tail -n1)
  case "$url" in
    http://127.0.0.1:* | http://localhost:*) ok "kiosk otvára $url – prihlásenie Google na displeji bude fungovať" ;;
    *) warn "kiosk otvára $url – na prihlásenie Google musí kiosk otvárať http://127.0.0.1:<port> (docs/GOOGLE_KALENDAR.md)" ;;
  esac
fi
if sudo test -r "$APP_DIR/backend/.env"; then
  sudo grep -q '^SGH_GOOGLE_CLIENT_ID=.' "$APP_DIR/backend/.env" && ok "Google Client ID je v backend/.env" || info "  Google Kalendár zatiaľ nie je nastavený (voliteľné, dá sa neskôr)"
fi
command -v aplay >/dev/null && { info "  zvukové výstupy:"; aplay -l 2>/dev/null | sed -n 's/^card/    card/p'; }

info "  odtlačok $SGH_PROTECTED: $(protected_fingerprint | cut -c1-16)…"
[ "$FAIL" = 0 ] && ok "kontrola prešla – môžete pokračovať zálohou (sgh-full-backup.sh)" || { warn "niektoré kontroly zlyhali – NEPOKRAČUJTE, pošlite výstup"; exit 1; }
