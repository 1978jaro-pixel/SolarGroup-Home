"""Integračný adaptér Buderus (LIVE) – zatiaľ bez pripojenia na skutočné zariadenie.

Inštalácia:

* kotol Buderus Logamax plus GB172-24 T50,
* regulátor Buderus Logamatic RC300, pripojený dvojžilovým vedením cez zbernicu EMS/EMS+,
* brána KM200 nie je k dispozícii,
* plánovaná brána BBQKees EMS Gateway E32 V2 KIT (Ethernet/Wi-Fi) – kompatibilita s touto
  inštaláciou sa ešte overí.

RC300 zostáva hlavným regulátorom a musí zostať funkčný. Kým je pripojený, týždenné programy
sú uložené v RC300 a adaptér ich bude iba čítať a zapisovať – nespúšťa vlastný paralelný program.
Postup po overení brány: najprv iba čítanie, potom zápis s overením spätným čítaním.
Podporované funkcie (režimy, počet prepínacích časov, programy) sa overia na skutočnom RC300.

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
