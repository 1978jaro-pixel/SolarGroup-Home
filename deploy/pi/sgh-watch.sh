#!/usr/bin/env bash
# SolarGroup Home – ľahký strážca stavu displeja a kiosku (iba zaznamenáva, nič neopravuje).
#
# Každých SGH_WATCH_INTERVAL s (predvolene 10) zistí stav HDMI výstupu, labwc, Chromia a backendu.
# Do ~/.local/state/solargroup-home/watch.log zapíše IBA ZMENY a raz za hodinu súhrnný riadok
# (RAM, RSS Chromia) – vhodné aj na dlhodobý test. Pri prechode do zlého stavu spustí sgh-diag.sh,
# takže zostane záznam presne z okamihu výpadku.
set -u
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
# shellcheck source=sgh-common.sh
. "$HERE/sgh-common.sh"

LOG="$SGH_STATE_DIR/watch.log"
INTERVAL="${SGH_WATCH_INTERVAL:-10}"
exec 9>"$SGH_RUNTIME_DIR/sgh-watch.lock"
flock -n 9 || { echo "sgh-watch už beží." >&2; exit 0; }

state() {
  local d st="?" en="?" dp="?" lab chr be
  d="$(sgh_drm_dir)"
  if [ -n "$d" ]; then
    st=$(cat "$d/status" 2>/dev/null || echo "?")
    en=$(cat "$d/enabled" 2>/dev/null || echo "?")
    dp=$(cat "$d/dpms" 2>/dev/null || echo "?")
  fi
  pgrep -x labwc >/dev/null && lab=on || lab=OFF
  pgrep -f -- "--user-data-dir=$SGH_PROFILE_DIR" >/dev/null && chr=on || chr=OFF
  sgh_backend_ok && be=ok || be=FAIL
  echo "hdmi=$st/$en/dpms:$dp labwc=$lab chromium=$chr backend=$be"
}

bad() {
  case "$1" in *disconnected* | *disabled* | *dpms:Off* | *labwc=OFF* | *chromium=OFF* | *backend=FAIL*) return 0 ;; esac
  return 1
}

sgh_log "$LOG" "=== sgh-watch štart (interval ${INTERVAL}s) ==="
prev=""
last_summary=0
while true; do
  sgh_rotate "$LOG"
  cur="$(state)"
  if [ "$cur" != "$prev" ]; then
    sgh_log "$LOG" "ZMENA: $cur"
    if bad "$cur" && { [ -z "$prev" ] || ! bad "$prev"; }; then
      "$HERE/sgh-diag.sh" --quiet --reason "sgh-watch: $cur" >/dev/null 2>&1 &
    fi
    prev="$cur"
  fi
  now=$(date +%s)
  if [ $((now - last_summary)) -ge 3600 ]; then
    avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
    rss=$(ps -C chromium,chromium-browser -o rss= 2>/dev/null | awk '{s+=$1} END {printf "%d", s/1024}')
    thr=$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2)
    sgh_log "$LOG" "súhrn: voľná RAM ${avail} MB, Chromium spolu ${rss:-0} MB, throttled=${thr:-?}, $cur"
    last_summary=$now
  fi
  sleep "$INTERVAL"
done
