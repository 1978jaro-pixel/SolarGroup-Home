# Grafický návrh

Frontend je upravený podľa **schváleného grafického návrhu** SolarGroup Home (obrazovka „Môj domov“,
dodaná 24. 10. 2026) – referenčný obrázok: [`docs/design/schvaleny-navrh-moj-domov.webp`](design/schvaleny-navrh-moj-domov.webp).

## Rozloženie podľa návrhu

- **Hlavička:** ikona domu, nadpis „Môj domov“; vpravo čas, deň a dátum a **meniny** (slovenský
  kalendár mien je súčasťou aplikácie a funguje bez internetu – `frontend/src/utils/meniny.ts`).
- **Ľavý stĺpec:** Počasie – Žilina (veľká teplota, ilustrácia, predpoveď na 4 dni) a Fotovoltika
  (3D dom s panelmi, batériou, garážou a nabíjačkou; hodnoty Výroba, Batéria + %, Dom, Sieť, Nabíjačka).
- **Mriežka 3 × 3:** Klíma, Kúrenie (Deň/Noc), Rolety · Svetlá (pôdorys), Kamery (Tapo C310), Vrátnik ·
  Rádio a hudba, Kalendár (meniny), Spotreba (kWh).
- **Spodná lišta:** Domov, Miestnosti, Kamery, Nastavenia; vpravo plaketa režimu (DEMO/LIVE).
- Tmavomodré pozadie, karty s jemným prechodom a okrajom, nadpisy kariet veľkými písmenami, ponuka ⋮,
  modré oblúkové regulátory teploty s ryskami a tlačidlami −/+.

Na nástennom displeji (šírka od 1500 px, výška od 880 px) sa stránka zmestí na jednu obrazovku ako
v návrhu. Na tablete (vrátane 7" 1024 × 600) a mobile sa karty preusporiadajú pod seba.

## Obrázky z návrhu

Fotorealistické ilustrácie sú vyrezané priamo zo schváleného návrhu (`frontend/src/assets/design/`):
dom s fotovoltikou, rolety, pôdorys (svetlá), kamera Tapo, videovrátnik a ilustrácia polojasna.

- Z ilustrácie domu boli **odstránené vpečené ukážkové hodnoty** (15.8 kW, 83 % …). Všetky čísla sa
  dopĺňajú zo skutočných (alebo jasne označených DEMO) údajov; bez údajov sa zobrazí „–“.
- Rozlíšenie výrezov zodpovedá rozlíšeniu dodaného návrhu (1846 × 852 px). Pre ostrejšie zobrazenie
  na veľkých displejoch stačí dodať podklady vo vyššom rozlíšení a nahradiť súbory s rovnakým názvom.

## Odchýlky od návrhu (zámerné)

| Návrh | Implementácia | Dôvod |
|---|---|---|
| Popisy „Solar, Battery, Home, Grid, Charger“ | Výroba, Batéria, Dom, Sieť, Nabíjačka | celé rozhranie je po slovensky |
| Prehráva sa „Nad krajinou – IMT Smile“ s obalom albumu | „Nič sa neprehráva / Prehrávač nie je pripojený“ | prehrávač zatiaľ nie je pripojený – nezobrazujeme vymyslené údaje ani cudzí obal albumu |
| Spotreba vždy ukazuje graf | graf hodinovej spotreby zo skutočných/DEMO údajov, inak „Bez merania“ | žiadne vymyslené hodnoty |
| Prepínač pri kamerách | zobrazuje, či je pripojený živý obraz (zatiaľ vypnutý, neaktívny) | kamery ešte nie sú integrované |
| Klíma bez vypínača | malý vypínač v hlavičke karty | zapnutie/vypnutie je požadovaná funkcia |
| Plaketa „NÁVRH“ vpravo dole | plaketa režimu **DEMO** / **LIVE** + „DEMO · simulované údaje“ v hlavičke | DEMO musí byť vždy jasne označené |
| Kúrenie: iba Deň/Noc | Deň/Noc na karte; Auto a Vyp. na detailnej stránke; pri Auto sa zvýrazní aktívny program | zachovanie funkcií |
| Pri iných stavoch počasia | farebné ikony v štýle predpovede (fotorealistická ilustrácia je k dispozícii iba pre polojasno) | návrh obsahuje iba jeden motív |

## V1.1 – Klíma a Kúrenie

Podľa predlohy [`schvaleny-navrh-v1-1-klima-kurenie.webp`](design/schvaleny-navrh-v1-1-klima-kurenie.webp):
jednotný kruhový regulátor (dizajn č. 8), rad dlaždíc režimov, detailné okná s týždenným programom
kúrenia a nastaveniami klimatizácie. Popis funkcií: [KURENIE_KLIMA.md](KURENIE_KLIMA.md).

Karty Klíma a Kúrenie sú vyššie, preto sa pravý blok hlavnej obrazovky usporiadal do troch stĺpcov
presne ako na predlohe V1.1 (Klíma–Svetlá–Rádio, Kúrenie–Kamery–Kalendár, Rolety–Vrátnik–Spotreba).
Obsah ostatných kariet sa nemenil.

| Predloha V1.1 | Implementácia | Dôvod |
|---|---|---|
| Karta a okno Kúrenie ukazujú režimy klimatizácie (Chladenie, Ventilátor, Dry) | režimy kúrenia: Auto, Manuál, Dočasná, ECO, Dovolenka | kotol Buderus nechladí – nezobrazujeme nepodporované funkcie; režimy podľa zadania V1.1 |
| Deň / Noc na karte Kúrenie | Deň / Noc = dočasne komfortná / útlmová teplota do ďalšieho prepínacieho času | zodpovedá správaniu regulátora Buderus |
| Riadok úseku: čas, teplota, prepínač | navyše výber času (24 h) a tlačidlo odstránenia | úsek musí byť možné upraviť |
| Kopírovať deň / Po–Pi / So–Ne | navyše „Celý týždeň“ | požiadavka „nastavenie celého týždňa“ |
| Prepínač zapnutia klímy | v hlavičke karty aj v okne | rovnaké ako na predlohe karty |

## Kde sa vzhľad upravuje

- `frontend/src/styles/tokens.css` – farby, zaoblenia, písmo
- `frontend/src/styles/global.css` – rozloženie a komponenty (sekcia „Môj domov“)
- `frontend/src/pages/Home.tsx` – karty hlavnej obrazovky
- `frontend/src/components/SolarScene.tsx`, `ThermostatDial.tsx`, `WeatherArt.tsx`, `Layout.tsx`

## Jedno pevné rozloženie pre všetky displeje na šírku (0.3.0)

Hlavná obrazovka má na každom displeji na šírku (7" 1024 × 600 až 15" Full HD a viac) rovnakú
kompozíciu podľa referencie „Môj domov“ – pozri [V0_3_0_AUDIT_A_PLAN.md](V0_3_0_AUDIT_A_PLAN.md).
Rozloženie 4 × 2 z verzie 0.2.0 sa zrušilo.
