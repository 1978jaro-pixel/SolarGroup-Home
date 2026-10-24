# Kúrenie (Buderus) a klimatizácia (Sinclair) – V1.1

Grafická predloha: [`docs/design/schvaleny-navrh-v1-1-klima-kurenie.webp`](design/schvaleny-navrh-v1-1-klima-kurenie.webp)
Snímky obrazovky: [`docs/screenshots/`](screenshots/)

## Jednotný kruhový regulátor (dizajn č. 8)

Jeden komponent `frontend/src/components/Thermostat.tsx` pre klimatizáciu aj kúrenie – na karte
hlavnej obrazovky aj v detailnom okne. Je čisto grafický (nevie nič o zariadeniach); logika je
v hookoch `useHeating` / `useClimate` a v module `utils/schedule.ts`.

- Prstenec s farebným podsvietením po nastavenú hodnotu, biely jazdec, 3D drážka a vnútorný disk.
- Veľká nastavená teplota, pod ňou režim a aktuálna nameraná teplota.
- Tlačidlá − / + po stranách, ťahanie po prstenci (stred necháva posúvanie stránky), klávesnica.
- Farby: **chladenie** modrá · **kúrenie / komfort** oranžová · **útlm** tlmená modrá · **ECO** zelená · vypnuté sivá.
- Kým príkaz nepotvrdí server/zariadenie, zobrazí sa „Odosiela sa…“; pri chybe sa regulátor vráti
  na potvrdenú hodnotu (nepotvrdený príkaz sa nikdy neukazuje ako vykonaný).
- Animácie iba pri zmene (bez nekonečných animácií) – vhodné pre Raspberry Pi 4 / 1 GB.

## Kúrenie – programovateľný termostat (inšpirované Buderus Logamatic)

### Inštalácia

| | |
|---|---|
| Kotol | Buderus Logamax plus GB172-24 T50 |
| Regulátor | Buderus Logamatic **RC300** (zostáva funkčný ako hlavný regulátor) |
| Pripojenie regulátora | dvojžilové vedenie, zbernica **EMS/EMS+** |
| Brána KM200 | nie je k dispozícii |
| Plánovaná brána | BBQKees EMS Gateway E32 V2 KIT (Ethernet/Wi-Fi) – **kompatibilita sa ešte overí** |

Dashboard je zatiaľ iba v režime **DEMO** (simulácia, žiadne LIVE údaje). Po overení brány:
najprv iba čítanie z RC300, potom zápis s overením spätným čítaním. Kým je RC300 pripojený,
týždenné programy sú uložené v ňom – dashboard ich bude čítať a zapisovať, nespúšťa vlastný
paralelný program. Odstránenie alebo premiestnenie RC300 sa bude riešiť až po overení
kompatibility a otestovaní regulácie. Funkcie, ktoré RC300 cez bránu nepodporuje, sa v LIVE skryjú.

### Prevádzkové režimy

| Režim | Správanie |
|---|---|
| **AUTO** | podľa aktívneho týždenného programu (komfort / útlm) |
| **MANUÁL** | trvalá ručná teplota |
| **DOČASNÁ ZMENA** | ručná teplota do nasledujúceho prepínacieho času, potom automaticky AUTO. Zmena teploty v režime AUTO = dočasná zmena (ako na regulátore Buderus). |
| **ECO / ÚTLM** | trvalo útlmová teplota |
| **DOVOLENKA** | od–do s vlastnou teplotou (5–20 °C); po skončení automaticky AUTO |

V okne aj na karte je vždy uvedené, čo platí a kedy nastane ďalšia zmena, napr.
„Program 1 · teraz Komfort 22,0 °C · ďalšia zmena dnes 22:00 → Útlm 19,0 °C“.

### Týždenné programy

- 2 samostatné programy (Program 1 / Program 2), aktívny sa prepína v okne.
- Pondelok – nedeľa, samostatný program pre každý deň, **až 6 prepínacích časov denne**.
- Prepínací čas = „od tohto času platí komfort / útlm“. Pred prvým časom dňa platí posledná úroveň
  z predchádzajúcich dní (ako na regulátore).
- Kopírovanie: deň → iný deň, na Po–Pi, na So–Ne, na celý týždeň.
- Grafická 24-hodinová časová os s vyznačením aktuálneho času.
- Zmeny sú najprv návrh – **Uložiť** ich zapíše do SQLite, **Zrušiť** vráti uložený stav.
- Bezpečnosť: 5–28 °C, útlm nesmie byť vyšší ako komfort, dovolenka 5–20 °C a nesmie byť v minulosti.

### Viac vykurovacích okruhov

Každý okruh je samostatné zariadenie typu `heating` (napr. `heating-main`, neskôr `heating-2`)
s vlastným stavom a programami. Konfigurácia okruhu: `{"circuit": 1, "circuit_name": "…"}`.

## Klimatizácia – Sinclair

Režimy **AUTO, COOL (chladenie), HEAT (kúrenie), FAN (ventilátor), DRY (odvlhčovanie)**; zapnutie/
vypnutie, požadovaná teplota, rýchlosť ventilátora, smer prúdenia, tichý režim, ECO a časovač
zapnutia/vypnutia. Pri zmene COOL/HEAT sa zmení farba regulátora. Detailné okno pracuje s návrhom –
zmeny sa odošlú tlačidlom **Uložiť** a zobrazí sa „Uložené – potvrdené zariadením“.

### Konfigurovateľná podpora funkcií

Čo jednotka podporuje, sa nastavuje v `devices.config.capabilities` (SQLite), napr.:

```json
{
  "modes": ["auto", "cool", "heat", "fan", "dry"],
  "fan_speeds": 5,
  "swing_positions": 5,
  "quiet": true,
  "eco": true,
  "timer": true,
  "min_temp": 16,
  "max_temp": 30,
  "temp_step": 0.5
}
```

Predvolené hodnoty sú **konzervatívne** (bez smeru prúdenia, tichého režimu, ECO a časovača).
Nepodporované funkcie sa v rozhraní nezobrazia a API ich odmietne (HTTP 400) ešte pred odoslaním
do zariadenia – v DEMO aj LIVE režime. DEMO konfigurácia má zapnuté všetko; po overení skutočnej
jednotky sa nepodporované funkcie vypnú.

## Časové pásmo

Programy aj časovače používajú `Europe/Bratislava` (nastaviteľné `SGH_TIMEZONE`) vrátane letného
a zimného času. Neexistujúci čas pri prechode na letný čas (napr. 02:30) sa posunie na 03:30.
Na Windows sa databáza časových pásiem dodáva balíkom `tzdata`.

## API

| Metóda | Cesta | Popis |
|---|---|---|
| GET | `/api/heating` | stav všetkých okruhov |
| POST | `/api/heating/{id}` | `mode`, `target_temp`, `comfort_temp`, `eco_temp`, `active_program`, `holiday {start, end, temp}` |
| GET | `/api/heating/{id}/schedule` | oba týždenné programy + aktívny program + časové pásmo |
| PUT | `/api/heating/{id}/schedule/{1\|2}` | uloženie týždenného programu |
| GET | `/api/climate` | stav klimatizácií vrátane `capabilities` |
| POST | `/api/climate/{id}` | `power`, `mode`, `fan`, `swing`, `quiet`, `eco`, `target_temp`, `timer_on` / `timer_off` („HH:MM“, „“ = zrušiť) |

## DEMO a LIVE

- **DEMO:** všetko funkčné v simulácii, nastavenia (režimy, teploty, programy, dovolenka, stav
  klimatizácie, časovače) sa ukladajú do SQLite (`device_state`) a prežijú reštart.
- **LIVE:** adaptéry `adapters/buderus.py` (RC300 cez EMS/EMS+, brána sa overuje) a
  `adapters/sinclair.py` sú pripravené, ale zatiaľ sa nepripájajú – stav je **Nedostupné**, príkazy vrátia HTTP 503 a nič sa nezobrazí ako vykonané.
  Pri budúcej integrácii adaptér vráti iba stav potvrdený zariadením (spätným čítaním) a pri výpadku
  OFFLINE s časom poslednej úspešnej aktualizácie.
