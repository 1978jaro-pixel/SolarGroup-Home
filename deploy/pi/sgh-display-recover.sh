#!/usr/bin/env bash
# SolarGroup Home – obnova čiernej obrazovky BEZ reštartu Raspberry Pi.
#
#   sgh-display-recover.sh            postupne skúša šetrnejšie kroky, po každom overí stav
#   sgh-display-recover.sh --lightdm  ak nič nepomôže, ponúkne reštart grafickej relácie (s potvrdením)
#
# Najprv uloží diagnostiku (stav pred zásahom). Spúšťajte cez SSH alebo z grafickej relácie.
set -u
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
# shellcheck source=sgh-common.sh
. "$HERE/sgh-common.sh"
LOG="$SGH_STATE_DIR/recover.log"

if [ -z "${WAYLAND_DISPLAY:-}" ]; then
  for s in "$SGH_RUNTIME_DIR"/wayland-[0-9]; do
    [ -S "$s" ] && { export WAYLAND_DISPLAY="${s##*/}"; break; }
  done
fi

say() { echo "$*"; sgh_log "$LOG" "$*"; }

display_on() {
  local d
  d="$(sgh_drm_dir)"
  [ -n "$d" ] || return 1
  [ "$(cat "$d/status" 2>/dev/null)" = connected ] &&
    [ "$(cat "$d/enabled" 2>/dev/null)" = enabled ] &&
    [ "$(cat "$d/dpms" 2>/dev/null)" = On ]
}

"$HERE/sgh-diag.sh" display --quiet --reason "sgh-display-recover (pred zásahom)" || true
say "obnova displeja $SGH_OUTPUT – stav pred: $(cat "$(sgh_drm_dir)"/{status,enabled,dpms} 2>/dev/null | tr '\n' ' ')"

if display_on && pgrep -f -- "--user-data-dir=$SGH_PROFILE_DIR" >/dev/null; then
  say "Výstup je podľa DRM zapnutý a Chromium beží. Ak je obraz čierny, problém môže byť v zobrazení Chromia – reštartujem iba Chromium."
  "$HERE/sgh-kiosk.sh" --restart
  exit 0
fi

step() {
  say "krok: $1"
  shift
  "$@" >>"$LOG" 2>&1 || say "  (príkaz skončil chybou)"
  sleep 3
  if display_on; then say "  → výstup je zapnutý"; return 0; fi
  return 1
}

if [ -n "${WAYLAND_DISPLAY:-}" ]; then
  command -v wlopm >/dev/null && step "wlopm --on $SGH_OUTPUT" wlopm --on "$SGH_OUTPUT" && exit 0
  command -v wlr-randr >/dev/null && step "wlr-randr --on (opätovné zapnutie výstupu)" wlr-randr --output "$SGH_OUTPUT" --on && exit 0
  command -v wlr-randr >/dev/null && step "wlr-randr off/on + režim $SGH_MODE (nové nastavenie režimu)" \
    bash -c "wlr-randr --output '$SGH_OUTPUT' --off; sleep 2; wlr-randr --output '$SGH_OUTPUT' --on --mode '$SGH_MODE'" && exit 0
else
  say "Wayland relácia nenájdená (labwc nebeží?) – wlopm/wlr-randr nemožno použiť."
fi

if pgrep -x labwc >/dev/null; then
  step "reštart Chromia kiosku" "$HERE/sgh-kiosk.sh" --restart && exit 0
fi

say "Šetrné kroky nepomohli. Posledná možnosť bez reštartu Raspberry: reštart grafickej relácie"
say "  sudo systemctl restart lightdm"
say "Diagnostika je uložená v $SGH_STATE_DIR/diag/ – prosím uschovajte ju."
if [ "${1:-}" = "--lightdm" ]; then
  read -r -p "Reštartovať grafickú reláciu (lightdm) teraz? Napíšte ANO: " ans
  if [ "$ans" = ANO ]; then
    say "reštart lightdm na žiadosť používateľa"
    sudo systemctl restart lightdm
  fi
fi
exit 1
