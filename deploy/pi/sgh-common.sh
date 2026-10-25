# shellcheck shell=bash disable=SC2034
# Spoločné nastavenia skriptov SolarGroup Home pre Raspberry Pi (načítava sa cez `source`).
# Hodnoty sa dajú prepísať v ~/.config/solargroup-home/kiosk.env

SGH_ENV_FILE="${SGH_ENV_FILE:-$HOME/.config/solargroup-home/kiosk.env}"
# shellcheck disable=SC1090
[ -f "$SGH_ENV_FILE" ] && . "$SGH_ENV_FILE"

SGH_BASE_URL="${SGH_BASE_URL:-http://127.0.0.1:8080}"
SGH_KIOSK_URL="${SGH_KIOSK_URL:-$SGH_BASE_URL/?kiosk=1}"
SGH_HEALTH_URL="${SGH_HEALTH_URL:-$SGH_BASE_URL/api/health}"
SGH_SERVICE="${SGH_SERVICE:-solargroup-home.service}"
SGH_OUTPUT="${SGH_OUTPUT:-HDMI-A-2}"
SGH_MODE="${SGH_MODE:-1024x600}"
SGH_STATE_DIR="${SGH_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/solargroup-home}"
SGH_PROFILE_DIR="${SGH_PROFILE_DIR:-$HOME/.local/share/solargroup-home/chromium-kiosk}"
SGH_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp}"

mkdir -p "$SGH_STATE_DIR" "$SGH_STATE_DIR/diag"

sgh_log() {
  # sgh_log <súbor> <správa…>
  local file="$1"
  shift
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$file"
}

sgh_rotate() {
  # Rotácia logu nad 2 MB (ponechá jednu starú kópiu) – šetrí SD kartu.
  local file="$1"
  if [ -f "$file" ] && [ "$(stat -c %s "$file" 2>/dev/null || echo 0)" -gt 2097152 ]; then
    mv -f "$file" "$file.1"
  fi
}

sgh_backend_ok() {
  curl -fsS -m 3 "$SGH_HEALTH_URL" >/dev/null 2>&1
}

sgh_chromium_bin() {
  command -v chromium || command -v chromium-browser || true
}

sgh_drm_dir() {
  # /sys/class/drm/card?-HDMI-A-2 (číslo karty sa môže líšiť)
  local d
  for d in /sys/class/drm/card*-"$SGH_OUTPUT"; do
    [ -d "$d" ] && { echo "$d"; return; }
  done
}
