#!/usr/bin/env bash
# SolarGroup Home – zapnutie/vypnutie kiosku v ~/.config/labwc/autostart (vždy so zálohou a potvrdením).
#
#   sgh-autostart.sh status
#   sgh-autostart.sh enable  [--yes]   pridá blok SolarGroup Home, zakomentuje iné spúšťanie Chromia/swayidle
#   sgh-autostart.sh disable [--yes]   odstráni blok a vráti zakomentované riadky
#
# Riadky pôvodného PV dashboardu (solar-dashboard-v1.4) sa NIKDY nemenia.
# Zmena sa prejaví po novom prihlásení grafickej relácie alebo reštarte.
set -u
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
AUTOSTART="${SGH_AUTOSTART:-$HOME/.config/labwc/autostart}"
PROTECTED_NAME="solar-dashboard-v1.4"
BEGIN="# >>> SolarGroup Home kiosk >>>"
END="# <<< SolarGroup Home kiosk <<<"
MARK="#[SGH-vypnuté] "
ACTION="${1:-status}"
YES=0
[ "${2:-}" = "--yes" ] && YES=1

confirm() {
  [ "$YES" = 1 ] && return 0
  read -r -p "$1 [a/N] " a
  case "$a" in a | A | ano | ANO | y | Y) return 0 ;; esac
  return 1
}

render() {
  # render enable|disable <vstup> – výsledok na stdout
  awk -v mode="$1" -v begin="$BEGIN" -v end="$END" -v mark="$MARK" -v prot="$PROTECTED_NAME" -v dir="$HERE" '
    $0 == begin { skip = 1; next }
    $0 == end { skip = 0; next }
    skip { next }
    {
      line = $0
      if (index(line, mark) == 1) line = substr(line, length(mark) + 1)   # vrátiť skôr vypnuté
      if (mode == "enable" && index(line, prot) == 0 && line !~ /^[ \t]*#/ && line ~ /(chromium|swayidle|squeekboard|wvkbd)/)
        line = mark line
      print line
    }
    END {
      if (mode == "enable") {
        print begin
        print "# Spúšťa SolarGroup Home v režime kiosku (pridal sgh-autostart.sh; odstránenie: sgh-autostart.sh disable)"
        print dir "/sgh-kiosk.sh >/dev/null 2>&1 &"
        print dir "/sgh-watch.sh >/dev/null 2>&1 &"
        print "# Voliteľné uspávanie displeja (experimentálne, predvolene vypnuté):"
        print "# " dir "/sgh-display-sleep.sh >/dev/null 2>&1 &"
        print end
      }
    }' "$2"
}

case "$ACTION" in
  status)
    echo "súbor: $AUTOSTART"
    if [ -f "$AUTOSTART" ] && grep -qF "$BEGIN" "$AUTOSTART"; then echo "kiosk SolarGroup Home: ZAPNUTÝ"; else echo "kiosk SolarGroup Home: vypnutý"; fi
    [ -f "$AUTOSTART" ] && echo "riadkov vypnutých kvôli kiosku: $(awk -v m="$MARK" 'index($0, m) == 1' "$AUTOSTART" | wc -l)"
    exit 0
    ;;
  enable | disable) ;;
  *) sed -n '2,8p' "$0"; exit 2 ;;
esac

mkdir -p "$(dirname "$AUTOSTART")"
[ -f "$AUTOSTART" ] || : >"$AUTOSTART"
tmp="$(mktemp)"
render "$ACTION" "$AUTOSTART" >"$tmp"
if cmp -s "$tmp" "$AUTOSTART"; then
  echo "Bez zmeny ($ACTION už platí)."
  rm -f "$tmp"
  exit 0
fi
if [ "$ACTION" = enable ] && grep -v '^[[:space:]]*#' "$tmp" | grep -qF "$PROTECTED_NAME"; then
  echo "UPOZORNENIE: autostart obsahuje AKTÍVNY riadok pôvodného dashboardu ($PROTECTED_NAME)."
  echo "             Tento skript ho nemení – oba programy by sa spustili naraz na jednom displeji."
fi
echo "Navrhovaná zmena $AUTOSTART:"
diff -u "$AUTOSTART" "$tmp" | tail -n +3
if ! confirm "Uložiť zmenu (pôvodný súbor sa zálohuje)?"; then
  echo "Nič sa nezmenilo."
  rm -f "$tmp"
  exit 1
fi
backup="$AUTOSTART.sgh-backup-$(date +%Y%m%d-%H%M%S)"
cp -p "$AUTOSTART" "$backup"
cat "$tmp" >"$AUTOSTART"
rm -f "$tmp"
echo "Uložené. Záloha: $backup"
echo "Prejaví sa po novom prihlásení grafickej relácie (alebo reštarte)."
