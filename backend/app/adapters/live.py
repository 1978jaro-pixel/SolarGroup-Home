"""LIVE adaptéry.

Zatiaľ je funkčný iba klient počasia (Open-Meteo) a pripravený klient pre existujúci
SolarGroup Dashboard. Ostatné integrácie (Buderus, Sinclair, Tapo, svetlá, žalúzie) sú
pripravené ako samostatné triedy, ktoré poctivo hlásia ``unavailable`` – doplníme ich postupne.

Žiadny LIVE adaptér nevracia vymyslené hodnoty.
"""

import logging
from datetime import date, datetime

import httpx
from pydantic import SecretStr, ValidationError

from ..models import (
    EnergySample,
    EnergySnapshot,
    LightCommand,
)
from .base import (
    AdapterSet,
    AdapterUnavailable,
    BlindAdapter,
    CameraAdapter,
    EnergyAdapter,
    LightAdapter,
    now_utc,
    offline,
    ok,
    unavailable,
)
from .buderus import BuderusHeating
from .openmeteo import OpenMeteoWeather
from .sinclair import SinclairClimate

log = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(5.0)


class SolarGroupEnergy(EnergyAdapter):
    """Čítanie údajov z existujúceho SolarGroup Dashboardu cez jeho HTTP API.

    Pôvodný kód dashboardu sa nekopíruje ani nemení. Očakávaný tvar odpovede je popísaný
    v ``docs/INTEGRACIE.md`` – ak sa skutočné API líši, upraví sa iba funkcia ``map_snapshot``.
    """

    name = "SolarGroup Dashboard"
    SNAPSHOT_PATH = "/api/home/snapshot"
    HISTORY_PATH = "/api/home/history"

    def __init__(self, base_url: str | None, token: SecretStr | None):
        self.base_url = base_url.rstrip("/") if base_url else None
        self.token = token
        self._last_ok: datetime | None = None

    def _headers(self) -> dict[str, str]:
        if self.token:
            return {"Authorization": f"Bearer {self.token.get_secret_value()}"}
        return {}

    @staticmethod
    def map_snapshot(payload: dict) -> EnergySnapshot:
        return EnergySnapshot.model_validate(payload)

    async def _get(self, path: str, params: dict | None = None) -> dict | list:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{self.base_url}{path}", params=params, headers=self._headers()
            )
            resp.raise_for_status()
            return resp.json()

    async def snapshot(self):
        if not self.base_url:
            return unavailable("live", "SolarGroup Dashboard nie je nakonfigurovaný")
        try:
            payload = await self._get(self.SNAPSHOT_PATH)
            snap = self.map_snapshot(payload)  # type: ignore[arg-type]
        except (httpx.HTTPError, ValueError, ValidationError) as exc:
            log.warning("SolarGroup snapshot zlyhal: %s", exc)
            return offline("live", "SolarGroup Dashboard neodpovedá", self._last_ok)
        ts = payload.get("updated_at") if isinstance(payload, dict) else None
        updated = datetime.fromisoformat(ts) if ts else now_utc()
        self._last_ok = updated
        return ok("live", snap, updated)

    async def history(self, day: date):
        if not self.base_url:
            return unavailable("live", "SolarGroup Dashboard nie je nakonfigurovaný")
        try:
            payload = await self._get(self.HISTORY_PATH, {"date": day.isoformat()})
            samples = [EnergySample.model_validate(x) for x in payload]  # type: ignore[union-attr]
        except (httpx.HTTPError, ValueError, ValidationError, TypeError) as exc:
            log.warning("SolarGroup history zlyhal: %s", exc)
            return offline("live", "SolarGroup Dashboard neodpovedá", self._last_ok)
        return ok("live", samples)


_NOT_YET = "Integrácia zatiaľ nie je implementovaná"


class UnconfiguredLights(LightAdapter):
    name = "Svetlá"

    async def state(self, device):
        return unavailable("live", _NOT_YET)

    async def command(self, device, cmd: LightCommand):
        raise AdapterUnavailable(_NOT_YET)


class UnconfiguredBlinds(BlindAdapter):
    name = "Žalúzie"

    async def state(self, device):
        return unavailable("live", _NOT_YET)

    async def set_position(self, device, position: int):
        raise AdapterUnavailable(_NOT_YET)


class TapoCameras(CameraAdapter):
    """Príprava na Tapo C310 (RTSP stream → prevod do prehliadača, napr. go2rtc)."""

    name = "Tapo"

    async def info(self, device):
        return unavailable("live", "Kamera zatiaľ nie je pripojená")


def build_live(settings) -> AdapterSet:
    return AdapterSet(
        source="live",
        energy=SolarGroupEnergy(settings.solargroup_url, settings.solargroup_token),
        heating=BuderusHeating(),
        climate=SinclairClimate(),
        lights=UnconfiguredLights(),
        blinds=UnconfiguredBlinds(),
        cameras=TapoCameras(),
        weather=OpenMeteoWeather(
            settings.weather_enabled,
            settings.weather_lat,
            settings.weather_lon,
            cache_file=settings.data_path / "weather-cache.json",
        ),
    )
