# SolarGroup Home E2 – Fotovoltika + Internetové rádio + Google Kalendár

**Etapa A – analýza a plán.** Žiadny kód sa nemenil, nič sa nenasadilo. Čaká na schválenie.

Východisko: v0.3.0 E1 (vetva `claude/epic-einstein-cmyx90`, commit `cc7c901`).

## 1. Zistený stav

| Oblasť | Čo funguje | Čo chýba |
|---|---|---|
| Fotovoltika – karta | E1: večerný dom + SVG toky (modré), dlaždice Výroba/Dom/Sieť, DEMO/LIVE stav | nový schválený obrázok, 5 hodnôt okolo domu, tyrkysovo-zelené toky bez bodiek, OFFLINE namiesto starých hodnôt, celá karta ako odkaz |
| Fotovoltika – detail | stránka `/fotovoltika` (scéna + štatistiky + graf) | zobrazenie na celú obrazovku s novou scénou |
| Rádio | iba vzhľad karty (`MusicCard`), tlačidlá sú vypnuté; stránka `/hudba` je prázdna | prehrávač, stanice, hlasitosť, obľúbené, katalóg, prehrávanie na pozadí |
| Kalendár | karta: dnešný dátum + **slovenské meniny** (offline tabuľka); stránka `/kalendar`: mesačná mriežka bez udalostí | Google Calendar, udalosti, týždeň/mesiac, štátne sviatky, synchronizácia, offline cache |
| Bezpečnosť | CSP `default-src 'self'`, `media-src` nie je povolený, `img-src` iba vlastné | povolenie zvukových streamov, logá staníc cez backend, OAuth tokeny na backende |
| Kiosk | Chromium bez nastavenia automatického prehrávania | voľba pre obnovenie rádia po reštarte (`--autoplay-policy`) |

## 2. Schválený obrázok domu – posúdenie

- Rozlíšenie **1536 × 1024 px** (nie 3000 px). Na 7" karte (~370 px) aj na 13,3" Full HD karte (~680 px) je
  ostrý; na celoobrazovkovom detaile pri 1920 px by bol mierne zväčšený (0,8×). Obrázok nebudem umelo zväčšovať.
- **Čísla a popisy** („Solar 15.8 kW“ …) sú na hladkom tmavom pozadí → dajú sa čisto odstrániť (retuš okolitého
  prechodu, nie rozmazaná plocha). Odkazové čiary s bodmi ostanú – popisy v Reacte sa k nim zarovnajú.
- **Zapečená žiara panelov a vedení**: na splnenie „pri nulovom výkone tok neaktívny“ pripravím dve vrstvy
  z toho istého obrázka:
  1. **základ** – panely a vedenia v nesvietiacom stave (stlmená tyrkysová farba, tvar a textúra zostanú),
  2. **svietiaca vrstva** – presne vyrezané svietiace panely z originálu; ich jas sa riadi výkonom FV.
  Toky: plynulé tyrkysovo-zelené svetelné línie (SVG, pohybujúci sa svetelný prechod, **žiadne bodky**), smer podľa toku.
- Ak by retuš niektorej časti nebola čistá, **oznámim to a vyžiadam čistý podklad** – nebudem nič prekrývať rozmazanou plochou.
- Upozornenie: auto má viditeľné **logo Tesla** – pre komerčné nasadenie u zákazníkov odporúčam logo odstrániť (ochranná známka). Rozhodnutie je na vás.

## 3. Návrh riešenia

### 3.1 Fotovoltika (etapa C)
- `HouseScene` → nový obrázok (2 veľkosti: 768 a 1536 px, WebP), vrstva svietiacich panelov, SVG toky.
- 5 hodnôt okolo domu presne podľa obrázka (Solar hore vľavo, Battery + SOC hore vpravo, Home, Grid, Charger dole).
- Karta: celá je odkaz na detail; bez nadpisu v scéne. Detail `/fotovoltika` na celú obrazovku (bez rolovania na 1024 × 600).
- **OFFLINE**: ak údaje nie sú `ok` (offline/stale/unavailable), hodnoty sa nezobrazia (namiesto nich „OFFLINE“
  a čas posledných údajov), toky a žiara panelov sú vypnuté.
- Animácia: jedna CSS animácia na tok (posun prechodu), žiadne filtre rozmazania v reálnom čase; „Bez animácií“ platí.

### 3.2 Internetové rádio (etapa D, vrátane doplnenia o zahraničné stanice)
- **Prehrávač na úrovni celej aplikácie** (jeden `<audio>` mimo stránok) → hrá ďalej pri prepínaní obrazoviek.
- Ovládanie: Play/Pause, Stop, hlasitosť, ďalšia/predchádzajúca stanica, stav (načítava, hrá, chyba pripojenia,
  stanica nedostupná). Karta: názov stanice, logo, Play/Pause, hlasitosť; ťuknutie na kartu otvorí detail.
- **Katalóg Radio Browser** cez **backend** (`/api/radio/...`): vyhľadávanie podľa názvu, krajiny (SK, CZ, AT, DE,
  IT, FR, GB, US a ďalšie), jazyka a žánru (Pop, Rock, Dance, 80s, 90s, Oldies, Jazz, Chillout, Classical, News).
  Backend: výber funkčného zrkadla, vlastný User-Agent, vyrovnávacia pamäť (menej požiadaviek, funguje aj pri
  krátkom výpadku), zjednotenie formátu, iba stanice s `lastcheckok`.
- **Overenie streamu** (backend): krátke pripojenie k streamu, kontrola typu obsahu a formátu (MP3, AAC, OGG/Opus);
  playlisty `.m3u/.pls` sa rozbalia. Nefunkčné stanice sa označia ako **nedostupné**. HLS (`.m3u8`) Chromium bez
  knižnice neprehrá → načíta sa `hls.js` iba pri takejto stanici, alebo sa stanica označí ako nepodporovaná.
- **Logá staníc** cez backend (stiahnutie, obmedzenie veľkosti, cache) – CSP ostane prísny, logo funguje aj offline.
- **Slovenské predvoľby**: Rádio Expres, Fun rádio, Rádio Slovensko, Europa 2, Rádio Vlna, Rádio Melody, Rádio_FM –
  URL podľa katalógu a oficiálnych stránok, **každá overená** pred zaradením (pozri kap. 5).
- **Obľúbené (hviezdička), vlastné URL, posledná stanica, hlasitosť** – ukladá backend v SQLite (prežije reštart
  aj vymazanie profilu prehliadača).
- Automatické prehrávanie: po štarte kiosku sa rádio samo nespustí (obmedzenie Chromium). Voliteľne prepínač
  „Obnoviť rádio po reštarte“ + prepínač kiosku `--autoplay-policy=no-user-gesture-required`.
- Zvukový výstup: predvolený výstup systému (HDMI alebo 3,5 mm jack Pi 4). Príprava na externý reproduktor/zosilňovač:
  výber výstupného zariadenia v Nastaveniach (`setSinkId`, ak ho systém ponúka – USB zvuková karta, DAC, Bluetooth).
- CSP: doplniť `media-src 'self' http: https:` (iba zvuk, nie skripty).

### 3.3 Google Kalendár (etapa E)
- **OAuth 2.0** (bez hesla Google), rozsah **iba na čítanie** `calendar.readonly`.
- Dôležité obmedzenie: Google nepovoľuje presmerovanie na adresu `http://192.168.1.192:8080` (iba HTTPS alebo
  `localhost`). Prihlásenie preto prebehne **priamo na dotykovom displeji Pi** (presmerovanie na
  `http://localhost:8080/api/calendar/oauth/callback`) alebo cez SSH tunel z PC. Zjednodušený „TV“ režim
  (kód na telefóne) Google pre Kalendár nepodporuje.
- Tokeny ukladá **iba backend** (súbor s oprávnením 0600 v dátovom adresári, obnovovací token zašifrovaný),
  frontend ich nikdy nedostane. Client ID/Secret iba v `.env`, nie v kóde.
- Synchronizácia na pozadí (každých 10 min + tlačidlo), prírastková (`syncToken`), neblokuje dashboard;
  udalosti v SQLite → pri výpadku sa zobrazia posledné uložené s označením **„Nesynchronizované od …“**.
- Výber kalendárov, dnešné a najbližšie udalosti, týždenné a mesačné zobrazenie, slovenské dni a mesiace,
  meniny (existujúca tabuľka), **štátne sviatky a dni pracovného pokoja SR** (vrátane Veľkej noci) – zoznam
  podľa platného zákona overím pri implementácii, časové pásmo Europe/Bratislava.
- Návod pre Google Cloud Console (projekt, Calendar API, súhlasová obrazovka, OAuth klient, test users).
  Pozor: v režime „Testing“ Google ruší obnovovacie tokeny po 7 dňoch → treba prepnúť na „In production“
  (pre osobné použitie bez overenia aplikácie, so zobrazeným upozornením Google).
- Alternatíva bez OAuth (voliteľná): tajná adresa iCal z Google Kalendára – iba čítanie, jednoduchšie nastavenie.

## 4. Súbory, ktorých sa zmeny dotknú

**Frontend**
- `src/components/HouseScene.tsx`, `SolarScene.tsx` – nová scéna, vrstvy, popisy, OFFLINE
- `src/pages/HomeBoard.tsx` – karty Fotovoltika, Rádio, Kalendár
- `src/pages/Solar.tsx` – detail na celú obrazovku
- `src/pages/Home.tsx` – `MusicCard`, `CalendarCard` (pôvodné verzie pre mobil)
- `src/pages/Misc.tsx` – `MusicPage`, `CalendarPage` presun do nových súborov, nastavenia rádia/kalendára
- nové: `src/radio/RadioProvider.tsx`, `src/pages/Radio.tsx`, `src/pages/Calendar.tsx`, `src/utils/holidays.ts`
- `src/main.tsx` (RadioProvider), `src/App.tsx` (trasy), `src/api/types.ts`, `src/styles/global.css`
- `src/assets/design/` – nový obrázok domu (základ + svietiace panely), pôvodný zdroj do `docs/design/`
- testy: `src/test/*.test.tsx`, `e2e/kiosk-check.mjs`

**Backend**
- nové: `app/routers/radio.py`, `app/radio_catalog.py` (Radio Browser, overenie streamov, logá),
  `app/routers/calendar.py`, `app/google_calendar.py` (OAuth, synchronizácia), `app/secrets_store.py`
- `app/db.py` – migrácia schémy v2 → v3 (stanice, obľúbené, nastavenia rádia, kalendáre, udalosti, stav synchronizácie)
- `app/main.py` (CSP `media-src`, registrácia routerov, úloha synchronizácie), `app/config.py` (Google, Radio Browser)
- `.env.example`, `requirements.txt` (bez nových ťažkých balíkov – httpx už je; prípadne `cryptography` na šifrovanie tokenov)
- testy: `tests/test_radio.py`, `tests/test_calendar.py`, `tests/test_holidays.py`

**Nasadenie a dokumentácia**
- `deploy/pi/sgh-kiosk.sh` (voliteľné `--autoplay-policy`), `docs/E2_*.md`, `docs/GOOGLE_KALENDAR.md`, `README.md`

**Nemení sa:** počasie, kúrenie, klíma, kamery, svetlá, rolety, navigácia, inštalátor (iba verzia),
SolarGroup PV Dashboard v1.4.

## 5. Obmedzenia, ktoré treba vedieť vopred

- **Sieť v mojom prostredí**: politika siete tohto cloudového prostredia blokuje `de1.api.radio-browser.info`
  aj streamy (`stream.bauermedia.sk`) – odpoveď 403. Bez povolenia **nemôžem overiť** streamy ani katalóg.
  Možnosti: (a) povoliť v nastaveniach prostredia (Network access → Allowed domains, napr.
  `*.radio-browser.info` a domény streamov), alebo (b) overenie urobí skript priamo na Pi/PC
  (`sgh-radio-check`) a výsledky mi pošlete. Neoverené stanice nebudem vydávať za funkčné.
- **Google OAuth** neotestujem bez vášho Google Cloud projektu – kód otestujem proti simulovanému API; skutočné
  prihlásenie bude **neoverené**, kým ho neurobíte na Pi.
- **Zvuk na Pi** (HDMI/jack) a výkon prehrávania – iba na zariadení, **neoverené**.

## 6. Postup etáp (po schválení)

| Etapa | Obsah | Výstup na kontrolu |
|---|---|---|
| B | záloha E1: ZIP + referencia commitu (`kontrola/`), bez zmien kódu | odkaz |
| C | vyčistený obrázok + vrstvy, scéna s 5 hodnotami, OFFLINE | náhľad 1024 × 600 a 13,3" **pred** zapracovaním |
| D | rádio (SK predvoľby + katalóg, obľúbené, vlastné URL, overovanie) | náhľady, testy |
| E | Google Kalendár (OAuth, synchronizácia, offline, sviatky) + návod | náhľady, testy |
| F | testy: jednotkové, e2e (1024 × 600, 1920 × 1080), výpadok internetu, simulácia inštalácie | správa |

Po každej etape môžem zastaviť na kontrolu. Na Raspberry Pi sa nič nenasadí bez vášho schválenia.

## 7. Otázky na rozhodnutie

1. Logo Tesla na aute: ponechať, alebo odstrániť pri retuši?
2. Sieť pre overenie rádií: povolíte domény v nastaveniach prostredia, alebo overenie skriptom na Pi/PC?
3. Kalendár: OAuth s prihlásením na displeji Pi (podľa zadania), prípadne aj alternatíva cez tajnú iCal adresu?
4. Má sa rádio po reštarte Pi automaticky obnoviť (vyžaduje prepínač kiosku), alebo až po ťuknutí?
