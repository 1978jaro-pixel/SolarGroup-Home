#!/usr/bin/env bash
# SolarGroup Home – VOLITEĽNÉ uspávanie displeja (predvolene VYPNUTÉ, experimentálne).
#
# Uspí HDMI výstup po SGH_SLEEP_MINUTES minútach nečinnosti (swayidle + wlopm) a pri dotyku ho zobudí.
# Po prebudení OVERUJE stav v /sys/class/drm a pri neúspechu skúša ďalšie kroky (sgh-display-recover.sh).
#
# Pozor: na tejto zostave bolo pozorované, že `wlopm --on` výstup nie vždy zapne. Kým sa nezistí príčina,
# odporúčame namiesto toho šetrič obrazovky v aplikácii (Nastavenia → Tento displej), ktorý HDMI nevypína.
#
# Zapnutie: v ~/.config/solargroup-home/kiosk.env nastavte SGH_SLEEP_MINUTES=10 a odkomentujte riadok
# sgh-display-sleep.sh v ~/.config/labwc/autostart (inštalátor ho tam pridá zakomentovaný).
set -u
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
# shellcheck source=sgh-common.sh
. "$HERE/sgh-common.sh"
LOG="$SGH_STATE_DIR/sleep.log"
MIN="${SGH_SLEEP_MINUTES:-0}"

if [ "$MIN" = 0 ]; then
  sgh_log "$LOG" "uspávanie vypnuté (SGH_SLEEP_MINUTES=0)"
  exit 0
fi
if ! command -v swayidle >/dev/null || ! command -v wlopm >/dev/null; then
  sgh_log "$LOG" "CHYBA: chýba swayidle alebo wlopm (sudo apt install swayidle wlopm)"
  exit 1
fi
exec 9>"$SGH_RUNTIME_DIR/sgh-sleep.lock"
flock -n 9 || exit 0

sgh_log "$LOG" "uspávanie po $MIN min nečinnosti, výstup $SGH_OUTPUT"
exec swayidle -w \
  timeout $((MIN * 60)) "echo \"\$(date '+%F %T') uspávam\" >>'$LOG'; wlopm --off '$SGH_OUTPUT'" \
  resume "wlopm --on '$SGH_OUTPUT'; sleep 2; '$HERE/sgh-display-wake-check.sh'" 9>&-
