# Google Kalendár v SolarGroup Home

SolarGroup Home zobrazuje udalosti z kalendára dvomi spôsobmi. Môžete použiť jeden alebo oba naraz.

| Spôsob | Výhody | Nevýhody |
|---|---|---|
| **A. Google OAuth 2.0** (odporúčané) | výber kalendárov, oficiálne API, prístup sa dá kedykoľvek zrušiť v účte Google | jednorazové nastavenie v Google Cloud Console |
| **B. Súkromná adresa iCal** | nastavenie za 1 minútu, funguje aj pre iné služby (Outlook, iCloud, Nextcloud) | jedna adresa = jeden kalendár; kto adresu pozná, kalendár vidí |

V oboch prípadoch platí:
- heslo k účtu Google SolarGroup Home **nikdy nepýta a neukladá**;
- prístup je **iba na čítanie** (rozsah `https://www.googleapis.com/auth/calendar.readonly`);
- obnovovací token Google aj súkromná adresa iCal sa ukladajú **šifrovane** (Fernet/AES) v databáze;
  kľúč je v súbore `data/secret.key` s právami `0600` (číta ho iba používateľ služby);
- tajomstvá sa nikdy neposielajú do prehliadača ani do API odpovedí;
- synchronizácia beží na pozadí každých 10 minút (`SGH_CALENDAR_SYNC_MINUTES`) a neblokuje dashboard;
- bez internetu sa zobrazia posledné uložené udalosti s označením **„Nesynchronizované“**.

> Zálohujte `data/secret.key` spolu s databázou. Bez kľúča sa uložené tokeny nedajú dešifrovať
> a kalendár treba pripojiť znova (udalosti ani nastavenia domu sa nestratia).

---

## A. Google OAuth 2.0

### 1. Projekt v Google Cloud Console (raz, cca 10 minút)

1. Otvorte <https://console.cloud.google.com/> a prihláste sa účtom, ktorého kalendár chcete zobrazovať.
2. Hore **Vybrať projekt → Nový projekt**, názov napr. `SolarGroup Home`, **Vytvoriť**.
3. **APIs & Services → Library** → vyhľadajte **Google Calendar API** → **Enable**.
4. **APIs & Services → OAuth consent screen** (v novom rozhraní *Google Auth Platform → Branding / Audience*):
   - User type: **External**;
   - App name: `SolarGroup Home`, support e-mail: váš e-mail;
   - Scopes (*Data access*): pridajte iba `.../auth/calendar.readonly`;
   - **Publishing status: In production** – tlačidlo *Publish app*.
     V stave *Testing* Google obnovovací token po 7 dňoch zruší a kalendár by sa prestal synchronizovať.
     Pre súkromné použitie s rozsahom iba na čítanie overenie aplikácie Googlom nie je potrebné;
     pri prihlásení sa zobrazí upozornenie „Google túto aplikáciu neoveril“ → **Rozšírené → Prejsť na SolarGroup Home**.
5. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Desktop app**, názov `SolarGroup Home Pi`;
   - **Create** → skopírujte **Client ID** a **Client secret**.

### 2. Nastavenie na Raspberry Pi

Do súboru `backend/.env` v adresári aplikácie (napr. `/opt/solargroup-home/current/backend/.env`
podľa vašej inštalácie; súbor sa necommituje a inštalátor ho pri aktualizácii zachová) doplňte:

```ini
SGH_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
SGH_GOOGLE_CLIENT_SECRET=GOCSPX-...
SGH_GOOGLE_REDIRECT_URI=http://127.0.0.1:8080/api/calendar/google/callback
```

Nastavte práva, aby súbor čítal iba používateľ služby, a reštartujte službu:

```bash
sudo chmod 600 /cesta/k/backend/.env
sudo systemctl restart solargroup-home
```

### 3. Prihlásenie (na displeji zariadenia)

1. Na **dotykovom displeji Pi** otvorte **Kalendár → Pripojiť Google Kalendár**.
2. Otvorí sa stránka Google – prihláste sa a povoľte „Zobraziť udalosti vo všetkých kalendároch“.
   Heslo zadávate výhradne na stránke `accounts.google.com`.
3. Po povolení sa vrátite do SolarGroup Home a zobrazí sa „Google Kalendár je prepojený“.
4. V časti **Prepojené kalendáre** zapnite kalendáre, ktoré sa majú zobrazovať (predvolene iba hlavný).

**Prečo na displeji zariadenia?** Klient typu *Desktop app* smie po prihlásení vrátiť používateľa iba
na adresu `127.0.0.1` (počítač, na ktorom beží prehliadač). Google nepovoľuje návrat na adresu
v domácej sieti (napr. `http://192.168.1.192:8080`). Z telefónu alebo PC v sieti preto tlačidlo
zobrazí vysvetlenie namiesto prihlásenia. Ak potrebujete prihlásenie aj zo vzdialeného prehliadača,
je potrebná HTTPS adresa s doménou (reverse proxy) – mimo rozsahu E2.

Ak dotyková klávesnica pri prihlásení Google nestačí, pripojte dočasne USB klávesnicu.

### Zrušenie prístupu
- v SolarGroup Home: **Kalendár → Prepojené kalendáre → kôš** (token sa vymaže z databázy);
- v účte Google: <https://myaccount.google.com/permissions> → SolarGroup Home → **Odstrániť prístup**.

---

## B. Súkromná adresa iCal

1. Na počítači otvorte <https://calendar.google.com> → **⚙ Nastavenia** → vľavo vyberte kalendár.
2. Časť **Integrovať kalendár** → **Tajná adresa vo formáte iCal** → skopírujte.
3. V SolarGroup Home: **Kalendár → Pridať iCal kalendár** → vložte adresu → **Pridať**.
   Adresa sa pred uložením overí (stiahnutie a kontrola formátu) a uloží sa šifrovane.

Adresu nezdieľajte – kto ju pozná, vidí udalosti. Ak unikne, v Google Kalendári ju **Obnovte**
a v SolarGroup Home pridajte novú.

Podporované sú aj adresy `webcal://` a iCal adresy iných služieb (Outlook, iCloud, Nextcloud).

---

## Riešenie problémov

| Hlásenie | Príčina a riešenie |
|---|---|
| „Google Kalendár nie je nastavený“ | chýba `SGH_GOOGLE_CLIENT_ID`/`SECRET` v `backend/.env`, alebo služba nebola reštartovaná |
| „Prihlásenie Google spustite priamo na displeji zariadenia“ | otvorili ste stránku z inej adresy než `127.0.0.1:8080` – pozri krok 3 |
| `redirect_uri_mismatch` | klient nie je typu *Desktop app*, alebo `SGH_GOOGLE_REDIRECT_URI` nezodpovedá porte služby |
| Po týždni prestane synchronizácia, chyba `invalid_grant` | aplikácia je v stave *Testing* – prepnite na *In production* a pripojte kalendár znova |
| „Nesynchronizované – posledné údaje …“ | Pi nemá internet alebo Google/iCal neodpovedá; zobrazené sú posledné uložené udalosti |

Stav **neoverené na reálnom zariadení**: prihlásenie Google a stiahnutie skutočnej iCal adresy
boli otestované iba so simulovaným Google API (automatické testy). Na Pi ich treba overiť podľa
tohto návodu.
