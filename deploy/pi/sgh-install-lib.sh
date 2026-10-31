# shellcheck shell=bash disable=SC2034
# Spoločné funkcie inštalátora a rollbacku SolarGroup Home (načítava sa cez `source`).

SGH_SERVICE="${SGH_SERVICE:-solargroup-home.service}"
# Pôvodný PV dashboard – nikdy sa ho nedotýkame (iba kontrolujeme, že sa nezmenil).
SGH_PROTECTED="${SGH_PROTECTED:-/home/solargroup/solar-dashboard-v1.4}"
SGH_BACKUP_ROOT="${SGH_BACKUP_ROOT:-$HOME/solargroup-home-backups}"
SGH_KIOSK_DIR="${SGH_KIOSK_DIR:-$HOME/solargroup-home-kiosk}"
# Časti aplikácie, ktoré aktualizácia nahrádza. Údaje (backend/data), .env a .venv sa NEMENIA.
SGH_PARTS_DIRS=(backend/app frontend/dist deploy docs scripts)
SGH_PARTS_FILES=(backend/requirements.txt backend/.env.example README.md)

c_red=$'\e[31m'
c_grn=$'\e[32m'
c_yel=$'\e[33m'
c_off=$'\e[0m'
info() { printf '%s\n' "$*"; }
ok() { printf '%s✔%s %s\n' "$c_grn" "$c_off" "$*"; }
warn() { printf '%s!%s %s\n' "$c_yel" "$c_off" "$*"; }
die() {
  printf '%s✘ %s%s\n' "$c_red" "$*" "$c_off" >&2
  exit 1
}

confirm() {
  [ "${ASSUME_YES:-0}" = 1 ] && return 0
  local a
  read -r -p "$1 [a/N] " a
  case "$a" in a | A | ano | ANO | y | Y) return 0 ;; esac
  return 1
}

# Zistí existujúcu inštaláciu zo systemd služby (nevytvára novú).
detect_install() {
  systemctl cat "$SGH_SERVICE" >/dev/null 2>&1 || die "Služba $SGH_SERVICE neexistuje. Tento skript iba aktualizuje existujúcu inštaláciu."
  local wd exec_path
  wd="$(systemctl show -p WorkingDirectory --value "$SGH_SERVICE")"
  if [ -z "${APP_DIR:-}" ]; then
    case "$wd" in
      */backend) APP_DIR="${wd%/backend}" ;;
      *) APP_DIR="$wd" ;;
    esac
  fi
  APP_DIR="$(readlink -f "$APP_DIR")"
  [ -f "$APP_DIR/backend/app/__init__.py" ] || die "V $APP_DIR nie je SolarGroup Home (chýba backend/app). Zadajte --app-dir."
  SVC_USER="$(systemctl show -p User --value "$SGH_SERVICE")"
  SVC_USER="${SVC_USER:-root}"
  APP_OWNER="$(stat -c %U:%G "$APP_DIR/backend")"
  exec_path="$(systemctl show -p ExecStart --value "$SGH_SERVICE" | sed -n 's/.*path=\([^ ;]*\).*/\1/p' | head -n1)"
  case "$exec_path" in
    *python*) PY="$exec_path" ;;
    *) PY="$APP_DIR/backend/.venv/bin/python" ;;
  esac
  OLD_VERSION="$(sed -n 's/^__version__ = "\(.*\)"/\1/p' "$APP_DIR/backend/app/__init__.py")"
  # port: Environment= v službe → backend/.env → 8080
  local port
  port="$(systemctl show -p Environment --value "$SGH_SERVICE" | tr ' ' '\n' | sed -n 's/^SGH_PORT=//p')"
  [ -z "$port" ] && [ -r "$APP_DIR/backend/.env" ] && port="$(sed -n 's/^SGH_PORT=\([0-9]*\).*/\1/p' "$APP_DIR/backend/.env" | tail -n1)"
  SGH_BASE_URL="${SGH_BASE_URL:-http://127.0.0.1:${port:-8080}}"
  # externý adresár údajov (ak je nastavený absolútne)
  DATA_EXT="$(systemctl show -p Environment --value "$SGH_SERVICE" | tr ' ' '\n' | sed -n 's/^SGH_DATA_DIR=//p')"
  if [ -z "$DATA_EXT" ] && sudo test -r "$APP_DIR/backend/.env"; then
    DATA_EXT="$(sudo sed -n 's/^SGH_DATA_DIR=//p' "$APP_DIR/backend/.env" | tail -n1 | tr -d '"'"'")"
  fi
  case "$DATA_EXT" in /*) ;; *) DATA_EXT="" ;; esac
}

guard_protected() {
  local p
  p="$(readlink -f "$SGH_PROTECTED" 2>/dev/null || echo "$SGH_PROTECTED")"
  case "$APP_DIR/" in "$p"/*) die "Adresár aplikácie je vnútri chráneného $p – končím." ;; esac
  case "$p/" in "$APP_DIR"/*) die "Chránený $p je vnútri adresára aplikácie – končím." ;; esac
}

# Odtlačok chráneného adresára (cesty, veľkosti, časy zmien) – na dôkaz, že sa nezmenil.
protected_fingerprint() {
  if [ -d "$SGH_PROTECTED" ]; then
    sudo find "$SGH_PROTECTED" -printf '%P %s %T@ %m\n' 2>/dev/null | sort | sha256sum | cut -d' ' -f1
  else
    echo "neexistuje"
  fi
}

health_ok() {
  curl -fsS -m 3 "$SGH_BASE_URL/api/health" 2>/dev/null | grep -q '"status" *: *"ok"'
}

installed_version() {
  sed -n 's/^__version__ = "\(.*\)"/\1/p' "$APP_DIR/backend/app/__init__.py" 2>/dev/null
}

wait_health() {
  # wait_health <očakávaná verzia> [sekundy] – služba bola reštartovaná, takže beží kód z APP_DIR
  local want="$1" secs="${2:-60}" v i
  v="$(installed_version)"
  if [ "$v" != "$want" ]; then
    warn "nainštalovaná verzia je $v (očakávaná $want)"
    return 1
  fi
  for i in $(seq 1 "$secs"); do
    health_ok && return 0
    sleep 1
  done
  return 1
}

# Nahradí adresár takmer atomicky: kópia vedľa → výmena → zmazanie starého.
replace_dir() {
  local src="$1" dst="$2"
  [ -d "$src" ] || return 0
  sudo mkdir -p "$(dirname "$dst")"
  sudo rm -rf "$dst.sgh-new" "$dst.sgh-old"
  sudo cp -a "$src" "$dst.sgh-new"
  [ -e "$dst" ] && sudo mv "$dst" "$dst.sgh-old"
  sudo mv "$dst.sgh-new" "$dst"
  sudo rm -rf "$dst.sgh-old"
}

install_kiosk_scripts() {
  # install_kiosk_scripts <adresár s sgh-*.sh>
  local src="$1"
  mkdir -p "$SGH_KIOSK_DIR"
  cp -f "$src"/sgh-*.sh "$SGH_KIOSK_DIR"/
  chmod +x "$SGH_KIOSK_DIR"/sgh-*.sh
  chmod -x "$SGH_KIOSK_DIR"/sgh-common.sh "$SGH_KIOSK_DIR"/sgh-install-lib.sh
  local env="$HOME/.config/solargroup-home/kiosk.env"
  if [ ! -f "$env" ]; then
    mkdir -p "$(dirname "$env")"
    cat >"$env" <<ENV
# Nastavenia kiosku SolarGroup Home (načítavajú skripty v $SGH_KIOSK_DIR)
SGH_BASE_URL=$SGH_BASE_URL
SGH_OUTPUT=HDMI-A-2
SGH_MODE=1024x600
# Uspávanie displeja v minútach (0 = vypnuté; experimentálne, pozri docs/RASPBERRY_PI_KIOSK.md)
SGH_SLEEP_MINUTES=0
# Ďalšie prepínače Chromia, napr. --force-device-scale-factor=1
SGH_CHROMIUM_EXTRA=
ENV
  fi
}
