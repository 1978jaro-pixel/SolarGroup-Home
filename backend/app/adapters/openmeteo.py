"""Počasie z Open-Meteo (https://open-meteo.com) – aktuálny stav, 7 dní a hodinová predpoveď.

Podmienky: bezplatné API je pre nekomerčné použitie (do 10 000 volaní denne), údaje sú pod
licenciou CC BY 4.0 – aplikácia uvádza zdroj „Open-Meteo“. SolarGroup Home volá API najviac
raz za 10 minút (~144 volaní denne).

Posledná úspešná predpoveď sa ukladá na disk; pri výpadku internetu (aj po reštarte) sa zobrazí
s označením OFFLINE a časom aktualizácie – nikdy ako aktuálne údaje.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

import httpx
from pydantic import ValidationError

from ..models import Weather, WeatherDay, WeatherHour
from .base import WeatherAdapter, now_utc, offline, ok, unavailable

log = logging.getLogger(__name__)

URL = "https://api.open-meteo.com/v1/forecast"
TIMEOUT = httpx.Timeout(8.0)
CACHE_SECONDS = 600

CURRENT = (
    "temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,"
    "wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,uv_index"
)
HOURLY = (
    "temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,"
    "wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day"
)
DAILY = (
    "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,"
    "precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,"
    "wind_direction_10m_dominant"
)


def _col(block: dict, key: str, n: int) -> list:
    v = block.get(key)
    return v if isinstance(v, list) and len(v) == n else [None] * n


def parse_open_meteo(j: dict, location: str = "Žilina") -> Weather:
    """Odpoveď Open-Meteo → model ``Weather``. Chýbajúce voliteľné hodnoty ostanú ``None``."""
    cur, d, h = j["current"], j["daily"], j.get("hourly") or {"time": []}
    nd, nh = len(d["time"]), len(h["time"])
    daily = [
        WeatherDay(
            date=t,
            temp_min=lo,
            temp_max=hi,
            code=c,
            sunrise=sr,
            sunset=ss,
            uv_max=uv,
            precip_mm=pr,
            precip_prob=pp,
            wind_max_kmh=wm,
            gust_max_kmh=gm,
            wind_dir=wd,
        )
        for t, lo, hi, c, sr, ss, uv, pr, pp, wm, gm, wd in zip(
            d["time"],
            d["temperature_2m_min"],
            d["temperature_2m_max"],
            d["weather_code"],
            _col(d, "sunrise", nd),
            _col(d, "sunset", nd),
            _col(d, "uv_index_max", nd),
            _col(d, "precipitation_sum", nd),
            _col(d, "precipitation_probability_max", nd),
            _col(d, "wind_speed_10m_max", nd),
            _col(d, "wind_gusts_10m_max", nd),
            _col(d, "wind_direction_10m_dominant", nd),
            strict=True,
        )
        if lo is not None and hi is not None and c is not None
    ]
    hourly = [
        WeatherHour(
            time=t,
            temp=te,
            feels_like=fl,
            code=c,
            precip_prob=pp,
            precip_mm=pr,
            wind_kmh=ws,
            wind_dir=wd,
            gust_kmh=gu,
            uv=uv,
            is_day=bool(day) if day is not None else True,
        )
        for t, te, fl, pp, pr, c, ws, wd, gu, uv, day in zip(
            h["time"],
            _col(h, "temperature_2m", nh),
            _col(h, "apparent_temperature", nh),
            _col(h, "precipitation_probability", nh),
            _col(h, "precipitation", nh),
            _col(h, "weather_code", nh),
            _col(h, "wind_speed_10m", nh),
            _col(h, "wind_direction_10m", nh),
            _col(h, "wind_gusts_10m", nh),
            _col(h, "uv_index", nh),
            _col(h, "is_day", nh),
            strict=True,
        )
        if te is not None and c is not None
    ]
    return Weather(
        location=location,
        temp=cur["temperature_2m"],
        feels_like=cur.get("apparent_temperature"),
        humidity=cur.get("relative_humidity_2m"),
        wind_kmh=cur.get("wind_speed_10m"),
        wind_dir=cur.get("wind_direction_10m"),
        gust_kmh=cur.get("wind_gusts_10m"),
        visibility_m=cur.get("visibility"),
        uv=cur.get("uv_index"),
        precip_mm=cur.get("precipitation"),
        is_day=bool(cur.get("is_day", 1)),
        code=cur["weather_code"],
        daily=daily,
        hourly=hourly,
    )


class OpenMeteoWeather(WeatherAdapter):
    name = "Open-Meteo"

    def __init__(
        self,
        enabled: bool,
        lat: float,
        lon: float,
        cache_file: Path | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.enabled = enabled
        self.lat = lat
        self.lon = lon
        self.cache_file = cache_file
        self.transport = transport
        self._cache: tuple[datetime, Weather] | None = self._load()

    def _load(self) -> tuple[datetime, Weather] | None:
        if not self.cache_file or not self.cache_file.exists():
            return None
        try:
            raw = json.loads(self.cache_file.read_text(encoding="utf-8"))
            return datetime.fromisoformat(raw["fetched_at"]), Weather.model_validate(raw["weather"])
        except (OSError, KeyError, ValueError, ValidationError) as exc:
            log.info("Uložená predpoveď sa nedá načítať: %s", exc)
            return None

    def _save(self) -> None:
        if not self.cache_file or not self._cache:
            return
        tmp = self.cache_file.with_suffix(".tmp")
        try:
            tmp.write_text(
                json.dumps(
                    {
                        "fetched_at": self._cache[0].isoformat(),
                        "weather": self._cache[1].model_dump(mode="json"),
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            tmp.replace(self.cache_file)
        except OSError as exc:
            log.info("Predpoveď sa nepodarilo uložiť: %s", exc)

    async def current(self):
        if not self.enabled:
            return unavailable("live", "Počasie je vypnuté v nastaveniach")
        if self._cache and (now_utc() - self._cache[0]).total_seconds() < CACHE_SECONDS:
            return ok("live", self._cache[1], self._cache[0])
        params = {
            "latitude": self.lat,
            "longitude": self.lon,
            "current": CURRENT,
            "hourly": HOURLY,
            "daily": DAILY,
            "timezone": "Europe/Bratislava",
            "forecast_days": 7,
            "wind_speed_unit": "kmh",
        }
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT, transport=self.transport) as client:
                resp = await client.get(URL, params=params)
                resp.raise_for_status()
                weather = parse_open_meteo(resp.json())
        except (httpx.HTTPError, KeyError, TypeError, ValueError, ValidationError) as exc:
            log.info("Počasie nedostupné: %s", exc)
            if self._cache:
                # posledná uložená predpoveď – zreteľne ako OFFLINE s časom aktualizácie
                r = offline(
                    "live", "Služba počasia neodpovedá – posledná uložená predpoveď", self._cache[0]
                )
                return r.model_copy(update={"data": self._cache[1]})
            return offline("live", "Služba počasia neodpovedá (bez internetu?)")
        self._cache = (now_utc(), weather)
        self._save()
        return ok("live", weather, self._cache[0])
