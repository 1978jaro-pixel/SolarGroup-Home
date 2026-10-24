"""Rozhrania adaptérov zariadení.

Každá skutočná integrácia (SolarGroup Dashboard, Buderus, Sinclair, Tapo, …) je samostatný
adaptér, ktorý implementuje jedno z rozhraní nižšie. Aplikácia o konkrétnom hardvéri nič
nevie – pracuje iba s týmito rozhraniami a s obálkou :class:`Reading`.

Pravidlo pre LIVE režim: adaptér NIKDY nevracia vymyslené hodnoty. Ak údaje nemá,
vráti ``offline`` alebo ``unavailable`` s ``data=None``.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from ..models import (
    BlindState,
    CameraInfo,
    ClimateCommand,
    ClimateState,
    EnergySample,
    EnergySnapshot,
    HeatingCommand,
    HeatingState,
    LightCommand,
    LightState,
    Reading,
    Source,
    Weather,
)


class AdapterUnavailable(Exception):
    """Zariadenie nie je dostupné alebo integrácia ešte nie je implementovaná."""


def now_utc() -> datetime:
    return datetime.now(UTC)


def ok(source: Source, data, updated_at: datetime | None = None) -> Reading:
    return Reading(status="ok", source=source, data=data, updated_at=updated_at or now_utc())


def offline(source: Source, message: str, updated_at: datetime | None = None) -> Reading:
    return Reading(status="offline", source=source, message=message, updated_at=updated_at)


def unavailable(source: Source, message: str) -> Reading:
    return Reading(status="unavailable", source=source, message=message)


def mark_stale(reading: Reading, stale_after_s: int, now: datetime | None = None) -> Reading:
    """Ak sú údaje staršie než limit, zmení stav na ``stale`` (údaje aj čas ponechá)."""
    if reading.status != "ok" or reading.updated_at is None:
        return reading
    now = now or now_utc()
    if now - reading.updated_at > timedelta(seconds=stale_after_s):
        return reading.model_copy(update={"status": "stale", "message": "Údaje nie sú aktuálne"})
    return reading


class EnergyAdapter(ABC):
    name = "Fotovoltika"

    @abstractmethod
    async def snapshot(self) -> Reading[EnergySnapshot]: ...

    @abstractmethod
    async def history(self, day: date) -> Reading[list[EnergySample]]: ...


class HeatingAdapter(ABC):
    name = "Kúrenie"

    @abstractmethod
    async def state(self, device: dict) -> Reading[HeatingState]: ...

    @abstractmethod
    async def command(self, device: dict, cmd: HeatingCommand) -> HeatingState: ...


class ClimateAdapter(ABC):
    name = "Klimatizácia"

    @abstractmethod
    async def state(self, device: dict) -> Reading[ClimateState]: ...

    @abstractmethod
    async def command(self, device: dict, cmd: ClimateCommand) -> ClimateState: ...


class LightAdapter(ABC):
    name = "Svetlá"

    @abstractmethod
    async def state(self, device: dict) -> Reading[LightState]: ...

    @abstractmethod
    async def command(self, device: dict, cmd: LightCommand) -> LightState: ...


class BlindAdapter(ABC):
    name = "Žalúzie"

    @abstractmethod
    async def state(self, device: dict) -> Reading[BlindState]: ...

    @abstractmethod
    async def set_position(self, device: dict, position: int) -> BlindState: ...


class CameraAdapter(ABC):
    name = "Kamery"

    @abstractmethod
    async def info(self, device: dict) -> Reading[CameraInfo]: ...


class WeatherAdapter(ABC):
    name = "Počasie"

    @abstractmethod
    async def current(self) -> Reading[Weather]: ...


@dataclass
class AdapterSet:
    source: Source
    energy: EnergyAdapter
    heating: HeatingAdapter
    climate: ClimateAdapter
    lights: LightAdapter
    blinds: BlindAdapter
    cameras: CameraAdapter
    weather: WeatherAdapter
