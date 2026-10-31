# Nasadenie SolarGroup Home E2 (0.4.0) na Raspberry Pi 4

Cieľ: aktualizovať funkčnú verziu **E1 (0.3.0)** na **E2 (0.4.0)** bez straty nastavení,
s úplnou zálohou a s možnosťou návratu. **SolarGroup PV Dashboard v1.4 sa nemení** – skripty
ho iba čítajú (odtlačok pred a po).

Zariadenie: Raspberry Pi 4 (1 GB RAM), Debian 13, labwc, Chromium kiosk, displej Waveshare 7" 1024 × 600,
adresa `http://192.168.1.192:8080`, používateľ `solargroup`.

Odhadovaný čas: 20–30 minút (z toho výpadok dashboardu ~2–5 minút pri zálohe a aktualizácii).
Potrebný internet (Python balíky z PyPI, ~10 MB).

---

## 0. Overenie pred nasadením (urobené)

| Kontrola | Stav |
|---|---|
| Všetky zmeny v GitHube, vetva `claude/epic-einstein-cmyx90` | ✅ lokálny a vzdialený stav sú zhodné |
| GitHub Actions (backend, frontend, scripts) | ✅ úspešné |
| Testy: pytest 78/78, vitest 54/54, e2e 85/85, `npm audit` 0, shellcheck | ✅ |
| Simulácia 0.3.0 → 0.4.0, návrat, `--keep-data`, obnova z úplnej zálohy | ✅ |
| Python balíky E2 pre Pi (aarch64, Python 3.13) | ✅ všetky ako hotové balíky (bez kompilácie); `cryptography` vyžaduje glibc ≥ 2.34, Debian 13 má 2.41 |

## 1. Výkonové nároky (Pi 4, 1 GB RAM)

| Časť | E1 (0.3.0) | E2 (0.4.0) | Poznámka |
|---|---|---|---|
| Backend po štarte | 52 MB | 63 MB | nové knižnice kalendára (+9 MB) |
| Backend po dlhšom používaní | 74 MB | **100 MB** (strop) | meranie: 10× relácia so 13 obrazovkami; ďalej nerastie. Bez obmedzenia pamäťových arén glibc to bolo 133 MB – v 0.4.0 je preto obmedzenie zabudované |
| Stránka v Chromiu (JS heap) | 9–21 MB | 5–19 MB | merané v Chromiu na PC |
| Synchronizácia kalendára | – | 1× za 10 min, na pozadí | neblokuje dashboard |
| Rádio | – | 1 zvukový stream 128–320 kbit/s | dekódovanie MP3/AAC je pre Pi 4 nenáročné |
| Inštalácia | – | ~10 MB balíkov, ~40 MB na disku | potrebná RAM počas pip < 100 MB |

Merané na PC (x86_64). **Na Pi neoverené** – po nasadení skontrolujeme kroky 6 a 7.
Chromium kiosk na Pi 4 bežne používa 300–450 MB; spolu s backendom a systémom ostáva rezerva.
Odporúčame swap aspoň 512 MB (kontrola `free -h`; meniť ho nebudeme bez vášho súhlasu).

---

## 2. Stiahnutie balíka

Na PC (prehliadač, prihlásený na GitHub):

- [solargroup-home-pi-0.4.0.tar.gz](https://github.com/1978jaro-pixel/SolarGroup-Home/raw/claude/epic-einstein-cmyx90/kontrola/solargroup-home-pi-0.4.0.tar.gz)
- [solargroup-home-pi-0.4.0.tar.gz.sha256](https://github.com/1978jaro-pixel/SolarGroup-Home/raw/claude/epic-einstein-cmyx90/kontrola/solargroup-home-pi-0.4.0.tar.gz.sha256)

Skopírovanie na Pi (Windows PowerShell alebo Linux/macOS terminál, v priečinku so stiahnutými súbormi):

```bash
scp solargroup-home-pi-0.4.0.tar.gz solargroup-home-pi-0.4.0.tar.gz.sha256 solargroup@192.168.1.192:~/
```

Ďalšie príkazy sa zadávajú na Pi (SSH: `ssh solargroup@192.168.1.192`):

```bash
cd ~
sha256sum -c solargroup-home-pi-0.4.0.tar.gz.sha256      # musí vypísať: OK
mkdir -p ~/sgh-e2 && tar -xzf solargroup-home-pi-0.4.0.tar.gz -C ~/sgh-e2
cd ~/sgh-e2/solargroup-home-pi-0.4.0
cat VERSION                                                # 0.4.0
```

## 3. Predbežná kontrola (nič nemení)

```bash
./sgh-preflight.sh
```

Overí verziu a beh služby, Python, RAM, swap, voľné miesto, **dostupnosť všetkých Python balíkov pre Pi
bez inštalácie**, internet (PyPI, Radio Browser, Google), adresu kiosku (kvôli prihláseniu Google),
zvukové výstupy a odtlačok PV Dashboardu v1.4. Ak skončí riadkom „NEPOKRAČUJTE“, pošlite mi výstup.

Ďalej informatívne (nič nemení):

```bash
free -h
systemctl status solargroup-home --no-pager | head -5
curl -s http://127.0.0.1:8080/api/health; echo
```

## 4. Úplná záloha verzie E1

```bash
./sgh-full-backup.sh
```

- na ~1 minútu zastaví službu (kiosk zobrazí chybu pripojenia a potom sa obnoví), aby bola databáza konzistentná;
- zálohuje **celú aplikáciu vrátane `.venv`, `backend/.env`, `backend/data` (databáza, `secret.key`)**,
  súbor služby systemd a jej doplnky, skripty a nastavenia kiosku, labwc autostart, crontab, zoznam Python balíkov;
- vytvorí `SHA256SUMS` a návod `OBNOVA.txt`;
- uloží do `~/solargroup-home-backups/UPLNA-<dátum>-v0.3.0/`;
- PV Dashboard v1.4 nezálohuje ani nemení (iba porovná odtlačok).

Kontrola zálohy:

```bash
B=$(ls -d ~/solargroup-home-backups/UPLNA-* | tail -1); echo "$B"
cd "$B" && sha256sum -c --quiet SHA256SUMS && echo ZALOHA-OK; cd -
```

Odporúčanie: skopírujte zálohu aj mimo Pi (z PC):
`scp -r solargroup@192.168.1.192:~/solargroup-home-backups/UPLNA-* .`

## 5. Aktualizácia

Najprv skúška (nič nemení, ukáže plán):

```bash
cd ~/sgh-e2/solargroup-home-pi-0.4.0
./install-pi-update.sh --dry-run
```

Plán musí obsahovať: zastavenie služby, zálohu, nahradenie `backend/app frontend/dist deploy docs scripts`,
**NEMENÍ SA: backend/data, backend/.env, .venv, služba systemd, solar-dashboard-v1.4**, `pip install`.

Aktualizácia (opýta sa na potvrdenie):

```bash
./install-pi-update.sh
```

Čo robí: druhá (rýchla) záloha do `~/solargroup-home-backups/<čas>-v0.3.0/`, nahradenie súborov,
inštalácia 3 nových Python balíkov (`cryptography`, `icalendar`, `recurring-ical-events` + závislosti),
spustenie služby a overenie verzie 0.4.0. **Ak čokoľvek zlyhá, automaticky vráti 0.3.0.**
Nastavenia (`backend/.env`), databáza, používateľské účty, autostart a `kiosk.env` ostávajú.
Databáza sa pri prvom štarte automaticky rozšíri (schéma v2 → v3; pôvodné údaje sa nemenia).

## 6. Kontrola po aktualizácii

```bash
curl -s http://127.0.0.1:8080/api/health; echo
systemctl status solargroup-home --no-pager | head -5
journalctl -u solargroup-home -n 30 --no-pager
free -h
ps -o rss=,cmd= -C python3 | awk '{printf "%d MB %s\n", $1/1024, $2}' | head
```

Kiosk má ešte načítanú starú stránku – reštartujte iba Chromium (kiosk ho hneď spustí znova
s novou verziou), prípadne celé Pi:

```bash
~/solargroup-home-kiosk/sgh-kiosk.sh --status
~/solargroup-home-kiosk/sgh-kiosk.sh --restart     # alebo: sudo reboot
```

Na displeji skontrolujte:

- [ ] hlavná obrazovka bez posúvania, dom s bielym Porsche, 5 hodnôt fotovoltiky (alebo OFFLINE, ak PV Dashboard nedodáva údaje);
- [ ] ťuknutie na kartu Fotovoltika otvorí detail;
- [ ] karta Rádio: „Pripravené – ťuknite na Prehrať“ (**rádio samo nehrá**);
- [ ] karta Kalendár: dátum, meniny, „Kalendár nie je prepojený“;
- [ ] Nastavenia → Tento displej: FPS a pamäť stránky (zapíšte hodnoty);
- [ ] ostatné moduly (Klíma, Kúrenie, Rolety, Svetlá, Kamery, Vrátnik, Spotreba) ako predtým;
- [ ] PV Dashboard v1.4 funguje ako predtým.

## 7. Internetové rádio

1. Overenie slovenských staníc priamo na Pi (iba číta streamy):
   ```bash
   ~/solargroup-home-kiosk/sgh-radio-check.sh
   ```
   Výsledok pri každej stanici: OK / NEDOSTUPNÁ / NEPODPOROVANÁ.
2. Ak je niektorá NEDOSTUPNÁ, nahradenie funkčnou adresou z katalógu Radio Browser:
   ```bash
   ~/solargroup-home-kiosk/sgh-radio-check.sh --fix
   ```
3. Zvukový výstup systému (3,5 mm, HDMI, USB/externý reproduktor):
   ```bash
   wpctl status          # PipeWire: zoznam výstupov (Sinks), * = predvolený
   wpctl set-default <ID>  # iba ak treba zmeniť predvolený výstup
   aplay -l              # zoznam zvukových kariet
   ```
   Waveshare 7" HDMI nemá reproduktory – zvuk pôjde cez 3,5 mm jack alebo USB/HDMI zosilňovač.
   V aplikácii: **Rádio a hudba → Zvuk → výstup** (ak ho Chromium ponúka).
4. Test: Rádio a hudba → Slovenské → ťuknúť na stanicu → Prehrať; prepnúť na Domov – hrá ďalej.
5. Reštart Pi (`sudo reboot`) → rádio **nehrá**, ale pamätá si stanicu a hlasitosť.
6. Počas prehrávania zapíšte vyťaženie: `top -bn1 | head -15`.

## 8. Google Kalendár (voliteľné, dá sa kedykoľvek neskôr)

Podrobný návod: [GOOGLE_KALENDAR.md](GOOGLE_KALENDAR.md).

**Možnosť A – Google OAuth** (výber kalendárov):

1. Na PC v Google Cloud Console vytvoriť projekt, zapnúť Calendar API, súhlasovú obrazovku
   **In production**, klienta typu **Desktop app** (kroky v návode).
2. Na Pi doplniť údaje (iba do `backend/.env`, nikdy nie do kódu):
   ```bash
   APP=$(systemctl show -p WorkingDirectory --value solargroup-home | sed 's#/backend$##'); echo "$APP"
   sudo cp -p "$APP/backend/.env" "$APP/backend/.env.pred-google"     # záloha
   sudo nano "$APP/backend/.env"
   ```
   Pridať na koniec:
   ```ini
   SGH_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   SGH_GOOGLE_CLIENT_SECRET=GOCSPX-...
   SGH_GOOGLE_REDIRECT_URI=http://127.0.0.1:8080/api/calendar/google/callback
   ```
   ```bash
   sudo chmod 600 "$APP/backend/.env"
   sudo systemctl restart solargroup-home
   curl -s http://127.0.0.1:8080/api/health; echo
   ```
3. **Na displeji Pi** s dočasne pripojenou USB klávesnicou: Kalendár → **Pripojiť Google Kalendár** →
   prihlásenie na stránke Google → povoliť „iba zobrazenie“ → návrat s „Google Kalendár je prepojený“.
4. Zapnúť kalendáre, ktoré sa majú zobrazovať.

**Možnosť B – súkromná iCal adresa** (bez Cloud Console, bez klávesnice na Pi):
Google Kalendár na PC → Nastavenia → kalendár → **Tajná adresa vo formáte iCal** → skopírovať →
v prehliadači na PC otvoriť `http://192.168.1.192:8080/kalendar` → **Pridať iCal kalendár**.

Tokeny a iCal adresy sa ukladajú šifrovane; kľúč je `backend/data/secret.key` (zálohuje sa s údajmi).

---

## 9. Návrat k predchádzajúcej verzii

**A. Bežný návrat** (záloha inštalátora z kroku 5, vráti kód aj údaje do stavu pred aktualizáciou):

```bash
ls -d ~/solargroup-home-backups/*-v0.3.0
BK=$(ls -d ~/solargroup-home-backups/2*-v0.3.0 | tail -1); echo "$BK"
"$BK/sgh-rollback.sh" "$BK"
```

Ak chcete ponechať údaje vytvorené v E2 (obľúbené rádiá, prepojené kalendáre), pridajte `--keep-data`
(verzia 0.3.0 s novšou databázou funguje – overené v simulácii).

**B. Úplná obnova** (posledná možnosť, vrátane `.venv`): postupujte podľa
`~/solargroup-home-backups/UPLNA-<dátum>-v0.3.0/OBNOVA.txt`.

Po návrate: `curl -s http://127.0.0.1:8080/api/health` a kontrola displeja.

## 10. Čo sa nemení

- SolarGroup PV Dashboard v1.4 (`/home/solargroup/solar-dashboard-v1.4`) a jeho záloha autostartu;
- `backend/.env`, `backend/data`, používateľské účty, nastavenia klímy a kúrenia;
- súbor služby systemd, `~/.config/solargroup-home/kiosk.env`, labwc autostart (inštalátor ho mení iba
  s voľbou `--autostart`, ktorú nepoužívame).

## 11. Neoverené do nasadenia

Skutočné streamy rádií a katalóg, zvuk na Pi, prihlásenie Google so skutočným účtom, spotreba pamäte
a FPS na Pi 4, inštalácia balíkov z PyPI na Pi. Overia ich kroky 3, 6, 7 a 8.
