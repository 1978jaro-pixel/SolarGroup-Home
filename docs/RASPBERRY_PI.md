# Budúce bezpečné nasadenie na Raspberry Pi 4 / 5

> **Tento postup sa zatiaľ nevykonáva.** Slúži ako príprava. Na Raspberry Pi bežia existujúce
> projekty (napr. SolarGroup Dashboard) – SolarGroup Home sa inštaluje **vedľa nich**, do vlastného
> adresára, pod vlastným používateľom a na vlastnom porte. Nič existujúce sa nemení ani nemaže.

## 0. Pred inštaláciou – kontrola, aby sme nič nerozbili

```bash
# Aké služby a porty už bežia (SolarGroup Home predvolene používa 8080)
sudo ss -ltnp
systemctl list-units --type=service --state=running
free -h; df -h /
```

Ak je port 8080 obsadený, zvoľte iný (`SGH_PORT=8090`). Neinštalujte nič do adresárov iných projektov.

## 1. Požiadavky

- Raspberry Pi OS (Bookworm alebo novší, 64-bit), Python 3.11+ (je súčasťou systému)
- Pi 5 odporúčané; Pi 4 s 1 GB RAM postačuje (backend ~60–90 MB RAM, limit služby 300 MB)
- Node.js na Pi **nie je potrebný** – frontend sa zostaví na PC a skopíruje sa hotový `frontend/dist`

## 2. Samostatný používateľ a adresár

```bash
sudo useradd --system --create-home --home-dir /opt/solargroup-home --shell /usr/sbin/nologin sgh
sudo -u sgh git clone https://github.com/1978jaro-pixel/SolarGroup-Home.git /opt/solargroup-home/app-tmp
sudo -u sgh bash -c 'shopt -s dotglob; mv /opt/solargroup-home/app-tmp/* /opt/solargroup-home/ && rmdir /opt/solargroup-home/app-tmp'
```

## 3. Backend

```bash
cd /opt/solargroup-home
sudo -u sgh ./scripts/setup.sh --no-build
sudo -u sgh mkdir -p backend/data
sudo chmod 700 backend/data
sudo chmod 600 backend/.env
```

## 4. Frontend (zostavenie na PC, kopírovanie na Pi)

Na PC (Windows/macOS/Linux):

```bash
cd frontend && npm ci && npm run build
scp -r dist pi@<ip-pi>:/tmp/sgh-dist
```

Na Pi:

```bash
sudo rm -rf /opt/solargroup-home/frontend/dist
sudo mv /tmp/sgh-dist /opt/solargroup-home/frontend/dist
sudo chown -R sgh:sgh /opt/solargroup-home/frontend/dist
```

## 5. Konfigurácia (`/opt/solargroup-home/backend/.env`)

```ini
SGH_MODE=live
SGH_HOST=0.0.0.0          # dostupné v domácej sieti (LAN); NIE do internetu
SGH_PORT=8080
SGH_COOKIE_SECURE=false   # true iba ak beží za HTTPS (krok 8)
SGH_SOLARGROUP_URL=http://127.0.0.1:<port-solargroup-dashboardu>
# SGH_SOLARGROUP_TOKEN=...  (ak to API dashboardu vyžaduje)
```

Súbor `.env` je čitateľný iba pre používateľa `sgh` (`chmod 600`) a nikdy sa necommituje.

## 6. Prvý účet

```bash
cd /opt/solargroup-home/backend
sudo -u sgh .venv/bin/python -m app.cli create-user jaro
```

(Webové vytvorenie účtu funguje iba z `localhost`, takže z iného zariadenia v sieti to nejde – zámerne.)

## 7. Služba systemd

```bash
sudo cp /opt/solargroup-home/deploy/solargroup-home.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now solargroup-home
systemctl status solargroup-home
journalctl -u solargroup-home -f
```

Služba beží s obmedzeniami (`ProtectSystem=strict`, `NoNewPrivileges`, zápis iba do `backend/data`,
`MemoryMax=300M`), takže neovplyvní ostatné projekty na Pi.

## 8. Sieťová bezpečnosť

- **Žiadne presmerovanie portu na routri.** Systém nemá byť dostupný z internetu.
- Firewall – povoliť iba domácu sieť (príklad pre `ufw`, upravte rozsah siete;
  pred zapnutím `ufw` si overte pravidlá pre SSH a existujúce služby):

  ```bash
  sudo ufw allow from 192.168.1.0/24 to any port 8080 proto tcp
  ```

- Vzdialený prístup mimo domu: iba cez VPN (WireGuard, Tailscale), nie verejnou adresou.
- HTTPS v LAN (voliteľné): reverse proxy Caddy s lokálnym certifikátom pred portom 8080,
  potom `SGH_COOKIE_SECURE=true` a `SGH_HOST=127.0.0.1`.
- Pravidelné aktualizácie: `sudo apt update && sudo apt full-upgrade`.

## 9. Aktualizácia aplikácie

```bash
cd /opt/solargroup-home
sudo -u sgh git pull
sudo -u sgh backend/.venv/bin/pip install -r backend/requirements.txt
# nový frontend/dist skopírovať z PC (krok 4)
sudo systemctl restart solargroup-home
```

## 10. Záloha

Všetky údaje sú v `backend/data/solargroup-home.sqlite3` a konfigurácia v `backend/.env`.

```bash
sudo -u sgh sqlite3 /opt/solargroup-home/backend/data/solargroup-home.sqlite3 ".backup '/opt/solargroup-home/backend/data/backup.sqlite3'"
```

## 11. Odinštalovanie (bez vplyvu na iné projekty)

```bash
sudo systemctl disable --now solargroup-home
sudo rm /etc/systemd/system/solargroup-home.service
sudo systemctl daemon-reload
sudo userdel sgh && sudo rm -rf /opt/solargroup-home
```

## 12. 7-palcový dotykový displej (kiosk, voliteľné)

Postup pre kiosk (Chromium na labwc/Wayland, rozloženie 1024 × 600 bez posúvania, dotyková
klávesnica, diagnostika čiernej obrazovky) a aktualizáciu existujúcej inštalácie so zálohou
a rollbackom je v [RASPBERRY_PI_KIOSK.md](RASPBERRY_PI_KIOSK.md).
