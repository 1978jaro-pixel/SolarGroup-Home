"""Integračný adaptér Buderus (LIVE) – zatiaľ bez pripojenia na skutočné zariadenie.

Presný model regulátora a spôsob komunikácie sa ešte potvrdia
(napr. brána KM200 / MX300 s lokálnym šifrovaným HTTP API alebo EMS zbernica).
Plánovaná implementácia:

* ``state``        – načíta stav okruhu (aktuálna a požadovaná teplota, režim, aktívny program),
* ``command``      – zapíše zmenu a **znovu načíta stav**; vráti iba stav potvrdený regulátorom,
* ``schedule``     – načíta týždenné programy priamo z regulátora
                     (Buderus si program vyhodnocuje sám),
* ``set_schedule`` – zapíše program a overí ho spätným čítaním.

Pri chybe spojenia vracia ``offline`` s časom poslednej úspešnej aktualizácie – nikdy odhad.
Prihlasovacie údaje brány patria iba do ``backend/.env``.
"""

from datetime import datetime

from ..models import HeatingCommand, WeeklyProgram
from .base import AdapterUnavailable, HeatingAdapter, unavailable

NOT_CONNECTED = "Regulátor Buderus zatiaľ nie je pripojený"


class BuderusHeating(HeatingAdapter):
    name = "Buderus"

    def __init__(self) -> None:
        self.last_ok: datetime | None = None

    async def state(self, device):
        return unavailable("live", NOT_CONNECTED)

    async def command(self, device, cmd: HeatingCommand):
        raise AdapterUnavailable(NOT_CONNECTED)

    async def schedule(self, device):
        return unavailable("live", NOT_CONNECTED)

    async def set_schedule(self, device, program: int, weekly: WeeklyProgram):
        raise AdapterUnavailable(NOT_CONNECTED)
