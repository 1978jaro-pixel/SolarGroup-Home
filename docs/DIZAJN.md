# Grafický návrh – stav

> **Aktuálny vzhľad NIE JE schválený dizajn.** Pôvodný schválený grafický návrh nebol k dispozícii,
> preto je rozhranie vytvorené ako **provizórne** podľa slovného zadania. Po nahratí schváleného
> obrázka (napr. do `docs/design/`) sa vzhľad upraví podľa neho.

## Čo je implementované podľa zadania

- tmavé antracitové pozadie, karty so zaoblenými rohmi (22 px), jemné modré a tyrkysové akcenty,
- písmo Inter (súčasť buildu, funguje bez internetu), jednotná sada čiarových ikon (`Icon.tsx`),
- jemné animácie (nábeh kariet, toky energie, prepínače), rešpektuje `prefers-reduced-motion`,
- responzívne rozloženie: počítač (bočný panel), tablet / 7" displej 1024×600 (úzky panel s ikonami),
  mobil (spodná lišta + „Viac“),
- dotykové prvky min. 44–56 px, kruhový regulátor teploty ovládateľný prstom, myšou aj klávesnicou.

## Kde sa vzhľad upravuje

- `frontend/src/styles/tokens.css` – farby, zaoblenia, tiene, písmo (dizajnové tokeny)
- `frontend/src/styles/global.css` – rozloženie a komponenty
- `frontend/src/components/SolarHouse.tsx` – ilustrácia 3D domu s panelmi a tokmi energie
- `frontend/src/components/ThermostatDial.tsx` – kruhový regulátor

Farby energetických tokov v grafoch (FV `#c0860f`, spotreba `#3b8fe8`, batéria `#0f9e8d`,
sieť `#9278e8`) sú overené na kontrast a rozlíšiteľnosť pri poruchách farbocitu.
