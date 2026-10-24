# Spustenie vo Windows

## 1. Požiadavky (jednorazovo)

1. **Python 3.11 alebo novší** – <https://www.python.org/downloads/>
   Pri inštalácii zaškrtnite *Add python.exe to PATH*.
2. **Node.js 22 LTS** – <https://nodejs.org/> (potrebný iba na zostavenie frontendu).
3. **Git** (voliteľne) – <https://git-scm.com/download/win>

Overenie v PowerShelli:

```powershell
py -3 --version     # alebo: python --version
node --version
```

## 2. Stiahnutie projektu

```powershell
git clone https://github.com/1978jaro-pixel/SolarGroup-Home.git
cd SolarGroup-Home
```

## 3. Inštalácia

Dvojklik na `scripts\setup-windows.bat` (alebo v PowerShelli `.\scripts\setup-windows.bat`).

Skript:

- vytvorí virtuálne prostredie `backend\.venv` a nainštaluje Python balíčky,
- vytvorí lokálny konfiguračný súbor `backend\.env` z `backend\.env.example` (režim DEMO),
- nainštaluje npm balíčky a zostaví frontend do `frontend\dist`.

Nič sa neinštaluje do systému ako služba a nič sa nesprístupňuje do siete.

## 4. Spustenie

Dvojklik na `scripts\start-windows.bat` a v prehliadači otvorte **<http://127.0.0.1:8080>**.

Pri prvom spustení sa zobrazí **Vytvorenie účtu** – zvoľte meno a heslo (min. 10 znakov).
Účet je možné vytvoriť iba z toho istého počítača. Alternatívne cez príkazový riadok:

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.cli create-user jaro
.\.venv\Scripts\python.exe -m app.cli set-password jaro   # zmena hesla
```

Server zastavíte klávesmi `Ctrl+C` v okne konzoly.

## 5. DEMO a LIVE

V súbore `backend\.env`:

```ini
SGH_MODE=demo   # simulované údaje, v rozhraní vždy označené „DEMO“
SGH_MODE=live   # iba skutočné údaje; bez pripojených zariadení sa zobrazí OFFLINE / Nedostupné
```

Po zmene reštartujte server.

## 6. Prístup z mobilu/tabletu v domácej sieti (voliteľné)

Predvolene server počúva iba na `127.0.0.1`. Ak chcete skúšať z mobilu v tej istej Wi-Fi:

1. v `backend\.env` nastavte `SGH_HOST=0.0.0.0`,
2. Windows sa spýta na povolenie vo firewalle – povoľte **iba súkromné siete**,
3. v mobile otvorte `http://<IP-adresa-PC>:8080`.

Port **nikdy nepresmerúvajte na routri do internetu**.

## 7. Vývojový režim (automatické obnovenie pri zmene kódu)

Dve okná PowerShellu:

```powershell
# okno 1 – backend
cd backend; .\.venv\Scripts\python.exe -m app

# okno 2 – frontend s hot-reload
cd frontend; npm run dev
```

Vývojový frontend beží na <http://127.0.0.1:5173> a požiadavky na `/api` presmeruje na backend.

## 8. Testy

```powershell
cd backend;  .\.venv\Scripts\python.exe -m pytest; .\.venv\Scripts\ruff.exe check .
cd frontend; npm run typecheck; npm test
```

## Riešenie problémov

| Problém | Riešenie |
|---|---|
| `running scripts is disabled on this system` | použite `.bat` súbory (spúšťajú PowerShell s `-ExecutionPolicy Bypass` iba pre daný skript) |
| Port 8080 je obsadený | v `backend\.env` nastavte napr. `SGH_PORT=8090` |
| Stránka ukazuje „Server je nedostupný“ | skontrolujte, či beží okno so `start-windows.bat` |
| Zabudnuté heslo | `python -m app.cli set-password <meno>` v adresári `backend` |
