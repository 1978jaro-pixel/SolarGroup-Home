# Architektúra

```
Prehliadač (PC, mobil, tablet, 7" displej, PWA)
        │  HTTPS/HTTP v LAN · REST /api/* · WebSocket /api/ws
        ▼
FastAPI (jeden proces, uvicorn) ──── servíruje aj zostavený frontend (frontend/dist)
  ├─ auth        relácie v SQLite, scrypt heslá, HttpOnly cookie, CSRF hlavička
  ├─ routers     energy, heating, climate, lights, blinds, cameras, intercom, weather, system, ws
  ├─ adapters    AdapterSet (DEMO | LIVE) – jediné miesto, ktoré pozná konkrétny hardvér
  └─ db          SQLite: users, sessions, rooms, devices, settings, audit_log
```

## Prečo tieto technológie

- **FastAPI + uvicorn**: malá pamäťová stopa (~60–90 MB), async I/O pre súbežné dotazy na zariadenia,
  automatická validácia vstupov (Pydantic) – nedovolí poslať napr. teplotu 45 °C.
- **SQLite cez štandardnú knižnicu**: žiadny databázový server, jeden súbor na zálohu, bez ORM navyše.
- **React + TypeScript + Vite**: rýchly vývoj, typová kontrola, malý výsledný balík (~80 kB gzip JS).
  Frontend sa zostavuje na PC, Pi ho iba servíruje – Pi 4 / 1 GB nemusí spúšťať Node.js.
- **Jeden proces** namiesto Nginx + API + Node – menej pamäte a menej vecí, ktoré sa môžu pokaziť.

## DEMO vs. LIVE

Každá hodnota z API je zabalená v obálke `Reading`:

```json
{ "status": "ok|stale|offline|unavailable", "source": "demo|live",
  "updated_at": "2026-10-24T10:52:00Z", "message": null, "data": { ... } }
```

- `source=demo` → frontend zobrazí štítok **DEMO** a pruh „DEMO režim“ na každej stránke.
- `offline` → `data` je vždy `null`, zobrazí sa **OFFLINE** a čas poslednej úspešnej aktualizácie.
- `stale` → údaje sú staršie než `SGH_STALE_AFTER_SECONDS`, zobrazí sa „Aktualizované …“.
- `unavailable` → integrácia ešte nie je pripojená; žiadne vymyslené čísla.

Ovládacie príkazy v LIVE režime bez adaptéra vrátia HTTP 503 a rozhranie zobrazí chybu.

## API (prehľad)

| Metóda | Cesta | Popis |
|---|---|---|
| GET | `/api/health` | verejné, bez citlivých údajov |
| GET | `/api/auth/status` | stav prihlásenia / potreba vytvoriť účet |
| POST | `/api/auth/setup`, `/login`, `/logout` | účet a relácia |
| GET | `/api/energy/snapshot`, `/api/energy/history?day=` | fotovoltika |
| GET/POST | `/api/heating`, `/api/heating/{id}` | kúrenie (`target_temp`, `mode`, `day_temp`, `night_temp`) |
| GET/POST | `/api/climate`, `/api/climate/{id}` | klimatizácia (`power`, `mode`, `fan`, `target_temp`) |
| GET/POST | `/api/lights`, `/api/lights/{id}` | svetlá (`on`, `brightness`) |
| GET/POST | `/api/blinds`, `/api/blinds/{id}`, `/api/blinds/group` | žalúzie (`position` 0–100) |
| GET | `/api/cameras`, `/api/intercom`, `/api/weather`, `/api/system`, `/api/rooms` | ostatné |
| WS | `/api/ws` | snapshot fotovoltiky každé 3 s + udalosti zmien zariadení |

V DEMO režime je interaktívna dokumentácia na `/api/docs`.

## Dátový model (SQLite)

- `users` – meno, scrypt hash hesla, rola
- `sessions` – SHA-256 hash tokenu relácie (token samotný sa neukladá), expirácia
- `rooms` – miestnosti (predvolené; upravia sa podľa pôdorysu)
- `devices` – zariadenie: typ (`heating|climate|light|blind|camera|intercom`), miestnosť, adaptér,
  `config` (iba neutajené parametre, napr. model)
- `settings` – kľúč/hodnota pre budúce nastavenia z UI
- `audit_log` – kto, kedy a čo ovládal (aj neúspešné prihlásenia)

## Bezpečnosť

- Žiadne heslá ani kľúče v kóde; konfigurácia v `backend/.env` (git ho ignoruje).
- Server predvolene počúva iba na `127.0.0.1`; sprístupnenie do LAN je vedomé rozhodnutie v `.env`.
- Všetky údaje aj ovládanie vyžadujú prihlásenie (okrem `/api/health`).
- Heslá: scrypt (n=2^14, r=8), min. 10 znakov; obmedzenie 5 neúspešných pokusov / 5 min na IP.
- Relácie: náhodný 256-bit token v HttpOnly, SameSite=Strict cookie; `Secure` pri HTTPS.
- CSRF: meniace požiadavky musia mať hlavičku `X-SGH-Request: 1`.
- Prvý účet cez web iba z `localhost`, inak cez CLI na zariadení.
- Bezpečnostné hlavičky (CSP, X-Frame-Options, nosniff, Referrer-Policy).
- Service worker necachuje `/api` – staré hodnoty sa nikdy nezobrazia ako aktuálne.
