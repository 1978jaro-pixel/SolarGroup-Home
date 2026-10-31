# SolarGroup Home 0.5.1 = E4 (počasie) + optimalizácia výkonu 0.4.1

Stav: **pripravené a otestované v projektovej vetve, čaká na schválenie nasadenia.**
Na Raspberry Pi sa nič neinštalovalo. SolarGroup PV Dashboard v1.4 sa nemení (skripty ho iba čítajú).

Verzia 0.5.1 spája schválenú etapu E4 (0.5.0) s optimalizáciou 0.4.1 do jedného balíka – na Pi sa
aktualizuje **priamo z 0.4.0 na 0.5.1**. Vzhľad dashboardu, dom s bielym Porsche Taycan a všetky funkcie ostávajú.

## 1. Optimalizácia 0.4.1 – čo sa zmenilo

| Príčina (diagnostika) | Úprava |
|---|---|
| Svetlo tokov energie sa posúvalo SVG animáciou `stroke-dashoffset` – Chromium pri každej snímke (60×/s) prepočítal štýly, prekreslil a znova rasterizoval celú scénu domu (GPU proces ~100 %, renderer ~50 % na Pi) | Vedenia ostávajú v SVG (vykreslia sa raz); svetlo je samostatný prvok s rovnakým tyrkysovo-zeleným prechodom posúvaný iba cez `transform` – animáciu robí GPU kompozítor **bez prekresľovania**. Smer, rýchlosť podľa výkonu, vypnutie pri nule aj OFFLINE ostávajú. |
| Rýchlosť toku sa menila pri každej aktualizácii údajov (každé 3 s) | rýchlosť zaokrúhlená na 0,4 s – animácia sa prepočíta iba pri výraznej zmene výkonu |
| Animácie bežali aj pod čiernym šetričom obrazovky | počas šetriča sa toky vypnú, po dotyku sa hneď obnovia |
| Pamäťové arény glibc pri dlhom behu (z prípravy E2) | obmedzené v backende (už v 0.4.0) |
| Vyrovnávacia pamäť mapových dlaždíc radaru by mohla rásť | najviac 3 000 dlaždíc (~45 MB), staršie ako 30 dní sa mažú |

Prepínač **Nastavenia → Tento displej → Bez animácií** naďalej vypne všetky animácie.

## 2. Výsledky meraní a testov

Prekresľovanie v Chromiu (10 s nečinnosti, 1024 × 600, DEMO s aktívnymi tokmi; meranie na PC):

| Obrazovka | 0.4.0 – prekreslenia / rasterizácia / hlavné vlákno | 0.5.1 |
|---|---|---|
| Môj domov | **1 200** / 600 / 3,3 % | **0** / 0 / 0,6 % |
| Fotovoltika – detail | **1 200** / 600 / 2,4 % | **0** / 0 / 0,5 % |
| Počasie, detail dňa, radar | – | 0 / 0 / 0,1–0,2 % |
| Rádio, Kalendár | 0 | 0 |

Snímky 0,65 s po sebe potvrdzujú, že svetlo sa pohybuje (animácia beží, iba bez prekresľovania).

| Test | Výsledok |
|---|---|
| Backend `ruff`, `pytest` | ✅ **86 / 86** (vrátane obmedzenia vyrovnávacej pamäte mapy) |
| Frontend `tsc`, `vitest`, `vite build` | ✅ **61 / 61** |
| `npm audit` | ✅ 0 zraniteľností |
| `shellcheck` | ✅ |
| E2E (Playwright, Chromium) | ✅ **126 / 126** – 5 rozlíšení + mobil, všetky moduly, toky animované iba cez `transform` (svetiel = aktívnych tokov), počasie (karta → stránka → deň → radar → uvoľnenie mapy), rádio bez autoštartu, klávesnica |
| Dlhý beh 5 min (pamäť stránky) | ✅ JS heap 9,5 → 9,5 MB |
| Pamäť backendu | ✅ ustáli sa na ~115 MB (6× opakované prechádzanie všetkých obrazoviek vrátane počasia a radaru) |
| Simulácia na „Pi“ (náhradné systemctl/sudo) | ✅ predbežná kontrola → úplná záloha → dry-run → **0.4.0 → 0.5.1** (bez pip) → všetky API 200 → **návrat inštalátorom na 0.4.0** → znovu 0.5.1 → **úplná obnova zo zálohy na 0.4.0**; PV Dashboard v1.4 nezmenený |

## 3. Riziká a neoverené body

| Riziko | Dopad | Opatrenie |
|---|---|---|
| Zaťaženie GPU na skutočnom Pi 4 (ANGLE/GLES, Wayland) nie je zmerané | animácia na kompozítore je rádovo lacnejšia, ale skladanie snímok 60×/s ostáva | meranie v kroku 7; ak by bolo stále vysoké, prepínač **Bez animácií** okamžite (a potom ladenie prepínačov Chromia) |
| Skutočné údaje Open-Meteo, radar RainViewer a mapa OpenStreetMap neoverené (blokované vo vývojovom prostredí) | bez internetu stránka ukáže OFFLINE / poslednú predpoveď | kontrola dostupnosti v kroku 3, overenie v kroku 8 |
| Farby legendy radaru a limit priblíženia RainViewer | legenda nemusí presne zodpovedať | nastaviteľné v `backend/.env` (`SGH_RADAR_COLOR`, `SGH_RADAR_MAX_ZOOM`) |
| Posúvanie a priblíženie mapy dotykom na Pi 4 | môže byť menej plynulé | radar sa otvára iba na požiadanie, pri odchode sa uvoľní |
| Nová databáza / súbory | žiadne zmeny schémy oproti 0.4.0; pribudne `data/weather-cache.json` a `data/map-tiles/` | návrat na 0.4.0 ich ignoruje |
| Výpadok pri aktualizácii | ~1–2 min bez dashboardu (záloha + reštart služby) | automatický návrat pri chybe |

## 4. Presný postup nasadenia (až po schválení)

Pi: Raspberry Pi 4, Debian 13, používateľ `solargroup`, adresa `192.168.1.192`, nainštalovaná **0.4.0**.
Čas: ~20 minút. Python balíky sa nemenia (bez `pip`).

**1. Stiahnutie na PC** (prehliadač, prihlásený na GitHub):
- [solargroup-home-pi-0.5.1.tar.gz](https://github.com/1978jaro-pixel/SolarGroup-Home/raw/claude/epic-einstein-cmyx90/kontrola/solargroup-home-pi-0.5.1.tar.gz)
- [solargroup-home-pi-0.5.1.tar.gz.sha256](https://github.com/1978jaro-pixel/SolarGroup-Home/raw/claude/epic-einstein-cmyx90/kontrola/solargroup-home-pi-0.5.1.tar.gz.sha256)

```bash
scp solargroup-home-pi-0.5.1.tar.gz solargroup-home-pi-0.5.1.tar.gz.sha256 solargroup@192.168.1.192:~/
```

**2. Rozbalenie na Pi** (`ssh solargroup@192.168.1.192`):
```bash
cd ~
sha256sum -c solargroup-home-pi-0.5.1.tar.gz.sha256        # musí vypísať: OK
mkdir -p ~/sgh-051 && tar -xzf solargroup-home-pi-0.5.1.tar.gz -C ~/sgh-051
cd ~/sgh-051/solargroup-home-pi-0.5.1 && cat VERSION         # 0.5.1
```

**3. Meranie pred aktualizáciou a predbežná kontrola** (nič nemení):
```bash
top -b -n 3 -d 5 | grep -E "Cpu|chromium|python" | tail -12 > ~/meranie-pred-0.5.1.txt; cat ~/meranie-pred-0.5.1.txt
free -h
./sgh-preflight.sh
```
Očakávané: „Python balíky sa nemenia“, dostupné api.open-meteo.com, api.rainviewer.com,
tile.openstreetmap.org a riadok „kontrola prešla“. Pri „NEPOKRAČUJTE“ mi pošlite výstup.

**4. Úplná záloha verzie 0.4.0** (služba stojí ~1 minútu):
```bash
./sgh-full-backup.sh
B=$(ls -d ~/solargroup-home-backups/UPLNA-* | tail -1); (cd "$B" && sha256sum -c --quiet SHA256SUMS && echo ZALOHA-OK)
```
Odporúčané aj kópia mimo Pi (z PC): `scp -r solargroup@192.168.1.192:~/solargroup-home-backups/UPLNA-* .`

**5. Skúška a aktualizácia:**
```bash
./install-pi-update.sh --dry-run      # plán; musí obsahovať „NEMENÍ SA: backend/data, backend/.env, .venv …“, bez pip
./install-pi-update.sh                # potvrdenie „a“; pri chybe sa sám vráti na 0.4.0
```

**6. Načítanie novej verzie na displeji:**
```bash
~/solargroup-home-kiosk/sgh-kiosk.sh --restart        # reštart iba Chromia (alebo: sudo reboot)
curl -s http://127.0.0.1:8080/api/health; echo
```

**7. Meranie po aktualizácii** (porovnať s krokom 3):
```bash
sleep 60; top -b -n 3 -d 5 | grep -E "Cpu|chromium|python" | tail -12 > ~/meranie-po-0.5.1.txt; cat ~/meranie-po-0.5.1.txt
free -h
```
Nastavenia → Tento displej: zapíšte FPS a pamäť stránky. Výstupy z krokov 3 a 7 mi pošlite.

**8. Kontrola na displeji:**
- [ ] Môj domov: dom s bielym Porsche, 5 hodnôt, svetlo tokov sa pohybuje (pri výkone), ostatné karty ako predtým;
- [ ] karta Počasie: svetlá obloha, teplota, 4 dni; ťuknutie → stránka počasia (7 dní, graf, dlaždice);
- [ ] ťuknutie na deň → hodinový prehľad; ‹ Počasie späť;
- [ ] karta Radar → mapa Žiliny, posun prstom, +/−, Prehrať; ‹ Počasie späť;
- [ ] rádio sa samo nespustí; kalendár, klíma, kúrenie, rolety, svetlá, kamery, vrátnik, spotreba fungujú;
- [ ] PV Dashboard v1.4 funguje ako predtým.

## 5. Návrat k predchádzajúcej verzii (0.4.0)

**A. Bežný návrat** (záloha inštalátora z kroku 5, kód aj údaje do stavu pred aktualizáciou):
```bash
BK=$(ls -d ~/solargroup-home-backups/2*-v0.4.0 | tail -1); echo "$BK"
"$BK/sgh-rollback.sh" "$BK"
~/solargroup-home-kiosk/sgh-kiosk.sh --restart
```

**B. Úplná obnova** (posledná možnosť, vrátane `.venv`, `.env`, systemd a kiosku) podľa
`~/solargroup-home-backups/UPLNA-<dátum>-v0.4.0/OBNOVA.txt`.

**C. Okamžitá úľava bez návratu:** Nastavenia → Tento displej → **Bez animácií**.

Obe cesty A a B sú overené v simulácii; po návrate: `curl -s http://127.0.0.1:8080/api/health` a kontrola displeja.
