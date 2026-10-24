# Integrácie zariadení (adaptéry)

Každá integrácia je samostatná trieda v `backend/app/adapters/` implementujúca rozhranie
z `adapters/base.py`. Aplikácia o hardvéri nevie nič iné.

| Modul | Rozhranie | DEMO | LIVE (stav) |
|---|---|---|---|
| Fotovoltika | `EnergyAdapter` | simulácia dňa (FV 9,8 kWp, batéria 10 kWh, EV 7,4 kW) | `SolarGroupEnergy` – pripravený HTTP klient, **čaká na overenie API** |
| Kúrenie | `HeatingAdapter` | programovateľný termostat (2 týždenné programy, režimy, dovolenka), ukladá sa do SQLite | `BuderusHeating` (`adapters/buderus.py`) – pripravený, *Nedostupné* |
| Klimatizácia | `ClimateAdapter` | simulácia všetkých funkcií podľa `capabilities`, ukladá sa do SQLite | `SinclairClimate` (`adapters/sinclair.py`) – pripravený, *Nedostupné* |
| Svetlá | `LightAdapter` | simulácia | kostra, *Nedostupné* |
| Žalúzie | `BlindAdapter` | simulácia | kostra, *Nedostupné* |
| Kamery | `CameraAdapter` | iba info o kamere, **bez falošného obrazu** | `TapoCameras` – kostra |
| Počasie | `WeatherAdapter` | simulácia | `OpenMeteoWeather` – **funkčné** (Žilina, vyžaduje internet) |

## SolarGroup Dashboard (iba čítanie)

Kód dashboardu sa nekopíruje ani nemení. Adaptér volá jeho HTTP API:

- `GET {SGH_SOLARGROUP_URL}/api/home/snapshot` → objekt v tvare `EnergySnapshot`
  (`pv_kw, house_kw, battery_kw, battery_soc, grid_kw, ev_kw, ev_connected, today_*_kwh,
  self_sufficiency`, voliteľne `updated_at` v ISO 8601)
- `GET {SGH_SOLARGROUP_URL}/api/home/history?date=YYYY-MM-DD` → zoznam `EnergySample`

Znamienka: `battery_kw > 0` = nabíjanie, `grid_kw > 0` = odber zo siete.

**Tieto cesty sú návrh.** Skutočné API dashboardu sme zatiaľ nevideli – po jeho dodaní sa upraví iba
`SNAPSHOT_PATH`, `HISTORY_PATH` a funkcia `map_snapshot` v `adapters/live.py`. Pri chybe spojenia
adaptér vráti OFFLINE s časom poslednej úspešnej aktualizácie.

Podrobnosti ku kúreniu a klimatizácii: [KURENIE_KLIMA.md](KURENIE_KLIMA.md).

## Ako pridať novú integráciu

1. Vytvorte triedu, napr. `class KM200Heating(HeatingAdapter)` v novom súbore `adapters/buderus.py`.
2. `state()` vracia `ok("live", data, updated_at)`, pri chybe `offline(...)`, nikdy odhad.
3. `command()` pri nedostupnosti vyhodí `AdapterUnavailable` (API vráti 503).
4. Prihlasovacie údaje čítajte z `Settings` (premenné `SGH_*` v `.env`), nie z kódu ani z DB.
5. Zaregistrujte ju v `build_live()` a pridajte test do `backend/tests/`.

## Poznámky k budúcim integráciám

- **Buderus**: typicky brána KM200 / MX300 (lokálne HTTP API so šifrovaním) – overiť model kotla.
- **Sinclair**: Wi-Fi moduly používajú lokálny protokol Gree (UDP 7000) – bez cloudu.
- **Tapo C310**: RTSP stream (`stream1`/`stream2`) s lokálnym kontom kamery; do prehliadača
  cez lokálny prevod (napr. go2rtc → WebRTC/MSE). Heslá kamier iba v `.env`.
- **Videovrátnik**: výber zariadenia otvorený; otvorenie dverí bude vždy vyžadovať prihlásenie a záznam v audit logu.
