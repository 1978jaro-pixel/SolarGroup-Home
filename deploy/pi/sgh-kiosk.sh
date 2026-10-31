#!/usr/bin/env bash
# SolarGroup Home – kiosk: Chromium na celú obrazovku v labwc/Wayland.
#
#   sgh-kiosk.sh            spustí kiosk (iba jedna inštancia), pri páde Chromium znovu spustí
#   sgh-kiosk.sh --restart  reštartuje iba Chromium (napr. po obnove displeja)
#   sgh-kiosk.sh --stop     ukončí kiosk aj jeho Chromium
#   sgh-kiosk.sh --status   vypíše stav
#
# Spúšťa sa z ~/.config/labwc/autostart. Nemení HDMI ani úsporu energie displeja.
set -u
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
# shellcheck source=sgh-common.sh
. "$HERE/sgh-common.sh"

LOG="$SGH_STATE_DIR/kiosk.log"
CHROME_LOG="$SGH_STATE_DIR/chromium.log"
PIDFILE="$SGH_RUNTIME_DIR/sgh-kiosk.pid"
LOCK="$SGH_RUNTIME_DIR/sgh-kiosk.lock"

chromium_pids() {
  pgrep -f -- "--user-data-dir=$SGH_PROFILE_DIR" || true
}

kill_chromium() {
  pkill -f -- "--user-data-dir=$SGH_PROFILE_DIR"
}

case "${1:-}" in
  --stop)
    [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null
    kill_chromium
    sgh_log "$LOG" "kiosk zastavený (--stop)"
    exit 0
    ;;
  --restart)
    if kill_chromium; then
      sgh_log "$LOG" "Chromium reštartovaný na požiadanie (--restart)"
    fi
    exit 0
    ;;
  --status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "kiosk beží (PID $(cat "$PIDFILE")), procesy Chromium: $(chromium_pids | wc -w)"
    else
      echo "kiosk nebeží"
    fi
    sgh_backend_ok && echo "backend: OK" || echo "backend: NEODPOVEDÁ ($SGH_HEALTH_URL)"
    exit 0
    ;;
esac

# --- Iba jedna inštancia -------------------------------------------------------
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "SolarGroup Home kiosk už beží." >&2
  exit 0
fi
echo $$ >"$PIDFILE"
sgh_rotate "$LOG"
sgh_rotate "$CHROME_LOG"
sgh_log "$LOG" "=== štart kiosku (PID $$) ==="

CHROMIUM="$(sgh_chromium_bin)"
if [ -z "$CHROMIUM" ]; then
  sgh_log "$LOG" "CHYBA: Chromium nie je nainštalovaný (sudo apt install chromium)"
  exit 1
fi

# --- Čakanie na Wayland reláciu -----------------------------------------------
for _ in $(seq 1 90); do
  if [ -n "${WAYLAND_DISPLAY:-}" ] && [ -S "$SGH_RUNTIME_DIR/$WAYLAND_DISPLAY" ]; then break; fi
  sleep 1
done
if [ -z "${WAYLAND_DISPLAY:-}" ]; then
  sgh_log "$LOG" "CHYBA: WAYLAND_DISPLAY nie je nastavené – kiosk sa spúšťa mimo labwc?"
  exit 1
fi
sgh_log "$LOG" "Wayland pripravený ($WAYLAND_DISPLAY)"

# --- Čakanie na backend (najviac 3 min; aplikácia sa potom pripája sama) ---------
for i in $(seq 1 180); do
  if sgh_backend_ok; then
    sgh_log "$LOG" "backend odpovedá po ${i}s"
    break
  fi
  [ "$i" = 180 ] && sgh_log "$LOG" "UPOZORNENIE: backend neodpovedá ani po 3 min, spúšťam Chromium aj tak"
  sleep 1
done

# Úsporné nastavenia pre Raspberry Pi 4 / 1 GB RAM. Doplnky: SGH_CHROMIUM_EXTRA v kiosk.env
# shellcheck disable=SC2054
FLAGS=(
  --kiosk
  --start-fullscreen
  --ozone-platform=wayland
  "--user-data-dir=$SGH_PROFILE_DIR"
  --no-first-run
  --no-default-browser-check
  --noerrdialogs
  --disable-infobars
  --disable-session-crashed-bubble
  --disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication,InterestFeedContentSuggestions
  --disable-sync
  --disable-background-networking
  --disable-component-update
  --check-for-update-interval=31536000
  --password-store=basic
  --disk-cache-size=33554432
  --renderer-process-limit=2
  --disable-pinch
  --overscroll-history-navigation=0
  --touch-events=enabled
)
# shellcheck disable=SC2206
[ -n "${SGH_CHROMIUM_EXTRA:-}" ] && FLAGS+=($SGH_CHROMIUM_EXTRA)

clear_crash_bubble() {
  # Po páde by Chromium ponúkal „Obnoviť stránky?“ – v kiosku to nechceme.
  local prefs="$SGH_PROFILE_DIR/Default/Preferences"
  [ -f "$prefs" ] && sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"[^"]*"/"exit_type":"Normal"/' "$prefs"
}

trap 'sgh_log "$LOG" "kiosk ukončený signálom"; kill_chromium; rm -f "$PIDFILE"; exit 0' TERM INT

fails=0
while true; do
  # pozostatok predchádzajúcej inštancie s rovnakým profilom by blokoval štart
  pids="$(chromium_pids)"
  if [ -n "$pids" ]; then
    sgh_log "$LOG" "ukončujem starý Chromium s profilom kiosku: $pids"
    kill_chromium
    sleep 2
  fi
  clear_crash_bubble
  started=$(date +%s)
  sgh_log "$LOG" "štart Chromium: $CHROMIUM $SGH_KIOSK_URL"
  "$CHROMIUM" "${FLAGS[@]}" "$SGH_KIOSK_URL" >>"$CHROME_LOG" 2>&1 9>&- &
  wait $!
  code=$?
  ran=$(( $(date +%s) - started ))
  avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
  sgh_log "$LOG" "Chromium skončil: kód $code, beh ${ran}s, voľná RAM ${avail} MB"
  if [ "$ran" -lt 60 ]; then fails=$((fails + 1)); else fails=0; fi
  # postupné predlžovanie pauzy pri opakovaných pádoch: 2, 4, 8 … max 60 s
  delay=$(( 2 ** (fails < 6 ? fails : 6) ))
  [ "$delay" -gt 60 ] && delay=60
  if [ "$fails" -ge 3 ]; then
    "$HERE/sgh-diag.sh" --quiet --reason "Chromium padol ${fails}× za sebou" >/dev/null 2>&1 || true
  fi
  sgh_log "$LOG" "nový štart o ${delay}s"
  sleep "$delay"
done
