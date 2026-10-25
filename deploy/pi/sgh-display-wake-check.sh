#!/usr/bin/env bash
# Po prebudení displeja overí, že výstup je naozaj zapnutý; inak spustí obnovu (bez reštartu Pi).
set -u
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
# shellcheck source=sgh-common.sh
. "$HERE/sgh-common.sh"
LOG="$SGH_STATE_DIR/sleep.log"
d="$(sgh_drm_dir)"
s="$(cat "$d"/{status,enabled,dpms} 2>/dev/null | tr '\n' ' ')"
if [ "$s" = "connected enabled On " ]; then
  sgh_log "$LOG" "prebudené OK ($s)"
else
  sgh_log "$LOG" "PREBUDENIE ZLYHALO ($s) – spúšťam sgh-display-recover.sh"
  "$HERE/sgh-display-recover.sh" >>"$LOG" 2>&1
fi
