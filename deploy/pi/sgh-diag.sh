#!/usr/bin/env bash
# SolarGroup Home – diagnostika. Iba ČÍTA stav, nič nemení.
#
#   sgh-diag.sh [all|backend|display] [--reason "text"] [--quiet]
#
# Výstup: ~/.local/state/solargroup-home/diag/diag-<čas>.log (ponechá sa 30 najnovších).
# Spustite ho HNEĎ pri čiernej obrazovke – cez SSH z iného počítača:
#   ssh solargroup@<ip> ~/solargroup-home-kiosk/sgh-diag.sh --reason "čierna obrazovka"
# Skript neoznačuje príčinu za potvrdenú; uvádza iba, ktorým hypotézam namerané údaje zodpovedajú.
set -u
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
# shellcheck source=sgh-common.sh
. "$HERE/sgh-common.sh"

SCOPE=all
REASON=""
QUIET=0
while [ $# -gt 0 ]; do
  case "$1" in
    all | backend | display) SCOPE="$1" ;;
    --reason) REASON="${2:-}"; shift ;;
    --quiet) QUIET=1 ;;
    -h | --help) sed -n '2,10p' "$0"; exit 0 ;;
  esac
  shift
done

# Mimo grafickej relácie (SSH) dohľadáme premenné Waylandu používateľa
if [ -z "${WAYLAND_DISPLAY:-}" ]; then
  for s in "$SGH_RUNTIME_DIR"/wayland-[0-9]; do
    [ -S "$s" ] && { export WAYLAND_DISPLAY="${s##*/}"; break; }
  done
fi

OUT="$SGH_STATE_DIR/diag/diag-$(date +%Y%m%d-%H%M%S).log"
HINTS=()

section() { printf '\n===== %s =====\n' "$*"; }
run() {
  # run <popis> <príkaz…> – chýbajúci príkaz nevadí
  printf -- '--- %s\n' "$1"
  shift
  if command -v "$1" >/dev/null 2>&1; then timeout 10 "$@" 2>&1 | tail -n 80; else echo "(príkaz $1 nie je dostupný)"; fi
}

collect() {
  section "SolarGroup Home diagnostika ($SCOPE)"
  echo "čas:      $(date -Is)"
  echo "dôvod:    ${REASON:-ručné spustenie}"
  echo "hostname: $(hostname)  používateľ: $(id -un)"
  echo "uptime:   $(uptime)"
  [ -f /etc/os-release ] && . /etc/os-release && echo "systém:   ${PRETTY_NAME:-?}"
  echo "jadro:    $(uname -r)"
  [ -r /proc/device-tree/model ] && echo "model:    $(tr -d '\0' </proc/device-tree/model)"

  section "Pamäť a napájanie"
  run "free -m" free -m
  avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
  [ "${avail:-999}" -lt 150 ] && HINTS+=("Málo voľnej RAM (${avail} MB) – možná príčina pádu Chromia (OOM).")
  run "vcgencmd get_throttled" vcgencmd get_throttled
  run "vcgencmd measure_temp" vcgencmd measure_temp
  if command -v vcgencmd >/dev/null 2>&1; then
    t=$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2)
    [ -n "$t" ] && [ "$t" != "0x0" ] && HINTS+=("vcgencmd get_throttled=$t – podpätie/prehrievanie v minulosti alebo teraz (napájanie môže ovplyvniť HDMI).")
  fi

  if [ "$SCOPE" != display ]; then
    section "Backend"
    run "systemctl status $SGH_SERVICE" systemctl --no-pager status "$SGH_SERVICE"
    printf -- '--- %s\n' "health"
    if out=$(curl -fsS -m 5 "$SGH_HEALTH_URL" 2>&1); then echo "$out"; else
      echo "NEODPOVEDÁ: $out"
      HINTS+=("Backend neodpovedá na $SGH_HEALTH_URL – obrazovka by ukazovala chybu pripojenia, nie čiernu plochu.")
    fi
    run "journal backendu (posledných 40)" journalctl -u "$SGH_SERVICE" -n 40 --no-pager
  fi

  if [ "$SCOPE" != backend ]; then
    section "Procesy grafiky"
    for p in lightdm labwc chromium chromium-browser swayidle wlopm squeekboard wvkbd-mobintl; do
      n=$(pgrep -c -x "$p" 2>/dev/null || echo 0)
      printf '%-18s %s\n' "$p" "$n"
    done
    pgrep -x labwc >/dev/null || HINTS+=("labwc nebeží – zodpovedá pádu kompozitora (alebo odhláseniu relácie).")
    if pgrep -x labwc >/dev/null && ! pgrep -f -- "--user-data-dir=$SGH_PROFILE_DIR" >/dev/null; then
      HINTS+=("labwc beží, Chromium kiosku nie – zodpovedá pádu/ukončeniu Chromia (pozri kiosk.log).")
    fi
    pgrep -x swayidle >/dev/null && HINTS+=("swayidle beží – displej mohol vypnúť plánovač nečinnosti.")
    printf -- '--- %s\n' "Chromium RSS (MB)"
    ps -C chromium,chromium-browser -o pid=,rss=,etimes=,args= 2>/dev/null | awk '{printf "%s %6.0f MB  beh %ss  %s\n",$1,$2/1024,$3,substr($0,index($0,$4),80)}' | head -n 12
    printf 'WAYLAND_DISPLAY=%s  XDG_RUNTIME_DIR=%s\n' "${WAYLAND_DISPLAY:-}" "$SGH_RUNTIME_DIR"

    section "Displej ($SGH_OUTPUT)"
    d="$(sgh_drm_dir)"
    if [ -n "$d" ]; then
      for f in status enabled dpms; do printf '%-8s %s\n' "$f:" "$(cat "$d/$f" 2>/dev/null || echo '?')"; done
      st=$(cat "$d/status" 2>/dev/null)
      en=$(cat "$d/enabled" 2>/dev/null)
      dp=$(cat "$d/dpms" 2>/dev/null)
      [ "$st" = disconnected ] && HINTS+=("DRM hlási $SGH_OUTPUT disconnected – zodpovedá strate HDMI signálu/HPD (kábel, displej, napájanie displeja).")
      [ "$st" = connected ] && [ "$en" = disabled ] && HINTS+=("$SGH_OUTPUT je pripojený, ale vypnutý kompozitorom (enabled=disabled) – zodpovedá vypnutiu výstupu (wlopm/wlr-randr).")
      [ "$st" = connected ] && [ "$dp" = Off ] && HINTS+=("$SGH_OUTPUT má DPMS Off – zodpovedá uspatiu displeja (blanking).")
    else
      echo "výstup $SGH_OUTPUT v /sys/class/drm nenájdený; dostupné:"
      for x in /sys/class/drm/card*-*; do [ -e "$x" ] && echo "  ${x##*/}"; done
    fi
    run "wlopm" wlopm
    run "wlr-randr" wlr-randr
    run "kmsprint" kmsprint
    run "dmesg (drm/vc4/hdmi, posledných 40)" bash -c "dmesg 2>/dev/null | grep -iE 'drm|vc4|hdmi|hotplug|edid|oom|killed process' | tail -n 40 || echo '(dmesg vyžaduje sudo – spustite: sudo $0)'"
    run "journal grafickej relácie (posledných 60)" bash -c "journalctl -b --no-pager -n 400 2>/dev/null | grep -iE 'lightdm|labwc|chromium|wayland|drm|vc4|hdmi|oom|segfault' | tail -n 60"
    run "systemctl status lightdm" systemctl --no-pager status lightdm
    printf -- '--- %s\n' "kiosk.log (posledných 30)"
    tail -n 30 "$SGH_STATE_DIR/kiosk.log" 2>/dev/null || echo "(žiadny)"
    printf -- '--- %s\n' "watch.log (posledných 30)"
    tail -n 30 "$SGH_STATE_DIR/watch.log" 2>/dev/null || echo "(sgh-watch nebeží alebo nič nezaznamenal)"
    printf -- '--- %s\n' "chromium.log (posledných 20)"
    tail -n 20 "$SGH_STATE_DIR/chromium.log" 2>/dev/null || echo "(žiadny)"
  fi

  section "Zhrnutie (hypotézy, NIE potvrdené príčiny)"
  if [ ${#HINTS[@]} -eq 0 ]; then
    echo "Namerané údaje nezodpovedajú žiadnemu známemu vzoru. Uložte tento súbor a porovnajte so záznamom z bežnej prevádzky."
  else
    for h in "${HINTS[@]}"; do echo "• $h"; done
  fi
}

collect >"$OUT" 2>&1
# ponechať 30 najnovších záznamov
ls -1t "$SGH_STATE_DIR"/diag/diag-*.log 2>/dev/null | tail -n +31 | xargs -r rm -f
[ "$QUIET" = 1 ] || cat "$OUT"
echo "Uložené: $OUT" >&2
