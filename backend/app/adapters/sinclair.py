"""Integračný adaptér Sinclair (LIVE) – zatiaľ bez pripojenia na skutočnú jednotku.

Jednotky Sinclair s Wi-Fi modulom komunikujú lokálne protokolom Gree (UDP 7000, AES), bez cloudu.
Plánovaná implementácia:

* ``state``   – načíta stav (zapnutie, režim, ventilátor, lamely, tichý/ECO režim, teploty),
* ``command`` – pošle príkaz a **spätne overí** nový stav; nepotvrdený príkaz sa hlási ako chyba.

Ktoré funkcie jednotka podporuje, sa nastavuje v konfigurácii zariadenia
(``devices.config.capabilities``); nepodporované funkcie API odmietne ešte pred
odoslaním (``climate_logic.validate_command``).
"""

from datetime import datetime

from ..models import ClimateCommand
from .base import AdapterUnavailable, ClimateAdapter, unavailable

NOT_CONNECTED = "Klimatizácia Sinclair zatiaľ nie je pripojená"


class SinclairClimate(ClimateAdapter):
    name = "Sinclair"

    def __init__(self) -> None:
        self.last_ok: datetime | None = None

    async def state(self, device):
        return unavailable("live", NOT_CONNECTED)

    async def command(self, device, cmd: ClimateCommand):
        raise AdapterUnavailable(NOT_CONNECTED)
