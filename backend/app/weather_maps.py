"""Radar zrážok (RainViewer) a mapový podklad (OpenStreetMap) – sprostredkované cez backend.

Prečo cez backend: prehliadač kiosku smie načítavať obrázky iba z vlastného servera (CSP), dlaždice
sa ukladajú do vyrovnávacej pamäte (šetrí internet aj cudzie servery) a vstupy sa prísne overujú,
takže server nemôže byť zneužitý na sťahovanie ľubovoľných adries.

Podmienky (overené 31. 10. 2026, pred nasadením skontrolovať znova):
* RainViewer – bezplatné API pre osobné a vzdelávacie použitie, povinné uvedenie zdroja
  („Radar: RainViewer“). Posledné ~2 hodiny po 10 minútach. Bezplatná úroveň má obmedzené
  priblíženie (``radar_max_zoom``); pri väčšom priblížení prehliadač dlaždicu len zväčší.
* OpenStreetMap – dlaždice tile.openstreetmap.org pri malom používaní, s uvedením
  „© OpenStreetMap prispievatelia“, s vlastnou identifikáciou aplikácie (User-Agent)
  a s ukladaním dlaždíc (tu 30 dní na disku). Iba oblasť okolo Slovenska.
"""

from __future__ import annotations

import asyncio
import logging
import math
import re
import time
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

import httpx

from . import __version__

log = logging.getLogger(__name__)

RAINVIEWER_INDEX = "https://api.rainviewer.com/public/weather-maps.json"
OSM_TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
USER_AGENT = (
    f"SolarGroupHome/{__version__} (private home dashboard; "
    "+https://github.com/1978jaro-pixel/SolarGroup-Home)"
)
TIMEOUT = httpx.Timeout(8.0)
FRAMES_TTL = 300  # s – zoznam snímok radaru
RADAR_TILE_TTL = 1800  # snímka sa už nemení, staršie ako 2 h zmiznú zo zoznamu
MAP_TILE_TTL = 30 * 86400
MAX_RADAR_TILES = 400  # ~20 kB/dlaždica → ~8 MB RAM najviac
# oblasť mapového podkladu (Slovensko a okolie) – chráni disk pred neobmedzeným rastom
BBOX = (47.4, 16.5, 50.0, 23.0)  # lat_min, lon_min, lat_max, lon_max
MAP_ZOOM = (6, 14)
PATH_RE = re.compile(r"^/v2/radar/[A-Za-z0-9_-]{1,64}$")
PNG = b"\x89PNG\r\n\x1a\n"


class MapError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


@dataclass
class Frame:
    time: int
    path: str
    kind: str  # past | nowcast


def _tile_range(z: int) -> tuple[int, int, int, int]:
    def tx(lon: float) -> int:
        return int((lon + 180) / 360 * 2**z)

    def ty(lat: float) -> int:
        r = math.radians(lat)
        return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2**z)

    lat_min, lon_min, lat_max, lon_max = BBOX
    return tx(lon_min), ty(lat_max), tx(lon_max), ty(lat_min)


def check_map_tile(z: int, x: int, y: int) -> None:
    if not MAP_ZOOM[0] <= z <= MAP_ZOOM[1]:
        raise MapError(404, "Priblíženie mimo rozsahu")
    x0, y0, x1, y1 = _tile_range(z)
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        raise MapError(404, "Mimo oblasti mapy")


class WeatherMaps:
    def __init__(
        self,
        data_dir: Path,
        transport: httpx.AsyncBaseTransport | None = None,
        radar_color: int = 2,
        radar_max_zoom: int = 7,
    ):
        self.tile_dir = data_dir / "map-tiles"
        self.transport = transport
        self.radar_color = radar_color
        self.radar_max_zoom = radar_max_zoom
        self._frames: tuple[float, str, list[Frame]] | None = None
        self._radar: OrderedDict[str, tuple[float, bytes]] = OrderedDict()
        self._lock = asyncio.Lock()

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=TIMEOUT,
            transport=self.transport,
            headers={"User-Agent": USER_AGENT},
            follow_redirects=False,
        )

    # --- radar -------------------------------------------------------------
    async def frames(self) -> dict:
        async with self._lock:
            if not self._frames or time.monotonic() - self._frames[0] > FRAMES_TTL:
                try:
                    async with self._client() as c:
                        r = await c.get(RAINVIEWER_INDEX)
                        r.raise_for_status()
                        j = r.json()
                    host = str(j["host"])
                    if not host.startswith("https://") or "/" in host[8:]:
                        raise ValueError(f"neočakávaný host {host!r}")
                    frames = [
                        Frame(int(f["time"]), str(f["path"]), kind)
                        for kind in ("past", "nowcast")
                        for f in (j.get("radar", {}).get(kind) or [])
                        if PATH_RE.match(str(f.get("path", "")))
                    ]
                    if not frames:
                        raise ValueError("žiadne snímky radaru")
                    self._frames = (time.monotonic(), host, frames)
                except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
                    log.info("Radar nedostupný: %s", exc)
                    if not self._frames:
                        raise MapError(503, "Radar je nedostupný (bez internetu?)") from exc
                    # ponecháme posledný zoznam, frontend ukáže čas poslednej snímky
        _, _, frames = self._frames
        return {
            "frames": [{"time": f.time, "kind": f.kind} for f in frames],
            "max_zoom": self.radar_max_zoom,
            "color": self.radar_color,
            "attribution": "Radar: RainViewer",
        }

    async def radar_tile(self, ts: int, z: int, x: int, y: int) -> bytes:
        if not 1 <= z <= self.radar_max_zoom or not (0 <= x < 2**z and 0 <= y < 2**z):
            raise MapError(404, "Dlaždica mimo rozsahu")
        await self.frames()
        _, host, frames = self._frames  # type: ignore[misc]
        frame = next((f for f in frames if f.time == ts), None)
        if not frame:
            raise MapError(404, "Snímka radaru už nie je dostupná")
        key = f"{ts}/{z}/{x}/{y}"
        hit = self._radar.get(key)
        if hit and time.monotonic() - hit[0] < RADAR_TILE_TTL:
            self._radar.move_to_end(key)
            return hit[1]
        url = f"{host}{frame.path}/256/{z}/{x}/{y}/{self.radar_color}/1_1.png"
        data = await self._fetch_png(url)
        self._radar[key] = (time.monotonic(), data)
        while len(self._radar) > MAX_RADAR_TILES:
            self._radar.popitem(last=False)
        return data

    # --- mapový podklad -----------------------------------------------------
    async def map_tile(self, z: int, x: int, y: int) -> bytes:
        check_map_tile(z, x, y)
        path = self.tile_dir / str(z) / str(x) / f"{y}.png"
        if path.exists() and time.time() - path.stat().st_mtime < MAP_TILE_TTL:
            return path.read_bytes()
        try:
            data = await self._fetch_png(OSM_TILE.format(z=z, x=x, y=y))
        except MapError:
            if path.exists():  # bez internetu radšej staršia dlaždica než nič
                return path.read_bytes()
            raise
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(path)
        return data

    async def _fetch_png(self, url: str) -> bytes:
        try:
            async with self._client() as c:
                r = await c.get(url)
        except httpx.HTTPError as exc:
            raise MapError(503, "Služba mapy je nedostupná") from exc
        if r.status_code == 404:
            raise MapError(404, "Dlaždica neexistuje")
        if r.status_code != 200 or not r.content.startswith(PNG) or len(r.content) > 1_000_000:
            raise MapError(502, f"Neplatná odpoveď služby mapy ({r.status_code})")
        return r.content
