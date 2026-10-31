# SolarGroup Home

Osobný **local-first** systém na ovládanie inteligentnej domácnosti – fotovoltika, kúrenie,
klimatizácia, svetlá, žalúzie, kamery a ďalšie moduly v jednom prémiovom tmavom dashboarde.

> Nejde o zákaznícky **SolarGroup Dashboard** pre fotovoltiku. Ten zostáva samostatným projektom;
> SolarGroup Home z neho iba číta údaje cez jeho API (pripravený adaptér), jeho kód nekopíruje ani nemení.

| | |
|---|---|
| Cieľový hardvér | Raspberry Pi 5 (funguje aj na Pi 4 s 1 GB RAM) |
| Klienti | ľubovoľný prehliadač – Windows, macOS, mobil, tablet, 7" dotykový displej; inštalovateľné ako PWA |
| Backend | Python 3.11+, FastAPI, SQLite (bez ORM), REST + WebSocket |
| Frontend | React 18, TypeScript, Vite, vlastné CSS (žiadna UI knižnica), písmo Inter je súčasťou buildu (bez internetu) |
| Režimy | **DEMO** (jasne označené simulované údaje) a **LIVE** (iba skutočné údaje, inak OFFLINE/Nedostupné) |

## Rýchly štart

**Windows** – podrobne v [docs/WINDOWS.md](docs/WINDOWS.md):

```bat
scripts\setup-windows.bat
scripts\start-windows.bat
```

**Linux / macOS / Raspberry Pi (lokálne skúšanie)**:

```bash
./scripts/setup.sh
./scripts/start.sh
```

Potom otvorte <http://127.0.0.1:8080>. Pri prvom spustení si vytvoríte účet (iba z toho istého
počítača – `localhost`). Predvolený režim je **DEMO**.

## Dokumentácia

- [docs/WINDOWS.md](docs/WINDOWS.md) – inštalácia a spustenie na Windows, vývojový režim
- [docs/RASPBERRY_PI.md](docs/RASPBERRY_PI.md) – budúce bezpečné nasadenie na Raspberry Pi 4/5
- [docs/V0_3_0_AUDIT_A_PLAN.md](docs/V0_3_0_AUDIT_A_PLAN.md) – v0.3.0: audit, plán a etapy; [docs/E1_SPRAVA.md](docs/E1_SPRAVA.md) – správa etapy E1
- [docs/RASPBERRY_PI_KIOSK.md](docs/RASPBERRY_PI_KIOSK.md) – 7" kiosk 1024 × 600, dotyková klávesnica, diagnostika HDMI, aktualizácia a rollback
- [docs/ARCHITEKTURA.md](docs/ARCHITEKTURA.md) – architektúra, dátový model, API, bezpečnosť
- [docs/INTEGRACIE.md](docs/INTEGRACIE.md) – adaptéry zariadení a ako pridať novú integráciu
- [docs/KURENIE_KLIMA.md](docs/KURENIE_KLIMA.md) – kúrenie Buderus (týždenné programy) a klimatizácia Sinclair
- [docs/DIZAJN.md](docs/DIZAJN.md) – grafický návrh: rozloženie podľa schváleného návrhu a zámerné odchýlky

## Štruktúra

```
backend/            FastAPI aplikácia (app/), testy (tests/), .env.example
  app/adapters/     DEMO simulácia a LIVE adaptéry (SolarGroup, Buderus, Sinclair, Tapo, Open-Meteo)
  app/routers/      REST API + WebSocket
frontend/           React + TypeScript (src/pages = moduly, src/components = UI prvky)
scripts/            spúšťacie skripty pre Windows a Linux
deploy/             šablóna systemd služby (neinštaluje sa automaticky)
docs/               dokumentácia
```

## Kontroly a testy

```bash
cd backend  && .venv/bin/ruff check . && .venv/bin/pytest
cd frontend && npm run typecheck && npm test && npm run build
```

Rovnaké kontroly beží GitHub Actions pri každom pull requeste.
