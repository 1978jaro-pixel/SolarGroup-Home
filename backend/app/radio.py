"""Internetové rádio: katalóg Radio Browser, overovanie streamov, logá staníc.

* Katalóg (https://www.radio-browser.info/) sa volá iba z backendu – s vlastným User-Agentom,
  výberom funkčného zrkadla a vyrovnávacou pamäťou. Prehliadač tak nepotrebuje prístup na cudzie API
  a Content-Security-Policy ostáva prísna.
* Overenie streamu: krátke pripojenie (najviac ~32 kB), kontrola typu obsahu a prvých bajtov,
  rozbalenie playlistu .m3u/.pls. Výsledok: ``ok`` / ``unavailable`` / ``unsupported``.
* Logá sa sťahujú iba pre stanice známe backendu (uložené alebo z posledného vyhľadávania),
  s limitom veľkosti a bez SVG.
"""

from __future__ import annotations

import hashlib
import ipaddress
import re
import time
import uuid
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import httpx

from . import __version__

USER_AGENT = f"SolarGroupHome/{__version__} (+https://github.com/1978jaro-pixel/SolarGroup-Home)"
FALLBACK_SERVERS = [
    "https://de1.api.radio-browser.info",
    "https://de2.api.radio-browser.info",
    "https://fi1.api.radio-browser.info",
]
SEARCH_TTL = 600
MAX_PROBE_BYTES = 32 * 1024
MAX_LOGO_BYTES = 256 * 1024
LOGO_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
}

# Slovenské predvoľby. URL sú kandidáti z verejných zdrojov – kým ich neoverí backend alebo
# skript `python -m app.cli radio-check` na Raspberry Pi/PC, majú stav „neoverené“.
# Ak kandidát nefunguje, overenie skúsi nájsť stanicu v katalógu Radio Browser podľa `search`.
PRESETS: list[dict] = [
    {
        "id": "sk-expres",
        "name": "Rádio Expres",
        "search": "Expres",
        "urls": ["https://stream.bauermedia.sk/expres-hi.mp3"],
        "homepage": "https://www.expres.sk",
    },
    {
        "id": "sk-fun",
        "name": "Fun rádio",
        "search": "Fun radio",
        "urls": ["https://stream.funradio.sk:8000/fun128.mp3"],
        "homepage": "https://www.funradio.sk",
    },
    {
        "id": "sk-slovensko",
        "name": "Rádio Slovensko",
        "search": "Radio Slovensko",
        "urls": ["https://icecast.stv.livebox.sk/slovensko_128.mp3"],
        "homepage": "https://slovensko.stvr.sk",
    },
    {
        "id": "sk-europa2",
        "name": "Europa 2",
        "search": "Europa 2",
        "urls": ["https://stream.bauermedia.sk/europa2-hi.mp3"],
        "homepage": "https://www.europa2.sk",
    },
    {
        "id": "sk-vlna",
        "name": "Rádio Vlna",
        "search": "Vlna",
        "urls": ["https://stream.radiovlna.sk/vlna-hi.mp3"],
        "homepage": "https://www.radiovlna.sk",
    },
    {
        "id": "sk-melody",
        "name": "Rádio Melody",
        "search": "Melody",
        "urls": ["https://stream.bauermedia.sk/melody-hi.mp3"],
        "homepage": "https://www.radiomelody.sk",
    },
    {
        "id": "sk-fm",
        "name": "Rádio_FM",
        "search": "Radio FM",
        "urls": ["https://icecast.stv.livebox.sk/fm_128.mp3"],
        "homepage": "https://fm.stvr.sk",
    },
]

AUDIO_TYPES = {
    "audio/mpeg": "MP3",
    "audio/mp3": "MP3",
    "audio/x-mpeg": "MP3",
    "audio/aac": "AAC",
    "audio/aacp": "AAC",
    "audio/x-aac": "AAC",
    "audio/mp4": "AAC",
    "audio/ogg": "OGG",
    "application/ogg": "OGG",
    "audio/opus": "OPUS",
    "audio/flac": "FLAC",
}
PLAYLIST_TYPES = {"audio/x-mpegurl", "audio/mpegurl", "audio/x-scpls", "application/pls+xml"}
HLS_TYPES = {"application/vnd.apple.mpegurl", "application/x-mpegurl"}


class RadioError(ValueError):
    """Neplatný vstup (HTTP 400)."""


@dataclass
class StreamCheck:
    status: str  # ok | unavailable | unsupported
    codec: str | None
    url: str
    detail: str

    def as_dict(self) -> dict:
        return {"status": self.status, "codec": self.codec, "url": self.url, "detail": self.detail}


def validate_stream_url(url: str) -> str:
    """Iba http/https a žiadne adresy samotného zariadenia (ochrana pred zneužitím backendu)."""
    url = (url or "").strip()
    if len(url) > 2000:
        raise RadioError("Adresa je príliš dlhá")
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise RadioError("Adresa musí začínať http:// alebo https://")
    host = p.hostname.lower()
    if host in ("localhost",) or host.endswith(".localhost"):
        raise RadioError("Adresa tohto zariadenia nie je povolená")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return url
    if ip.is_loopback or ip.is_link_local or ip.is_unspecified or ip.is_multicast or ip.is_reserved:
        raise RadioError("Táto adresa nie je povolená")
    return url


def sniff_codec(head: bytes) -> str | None:
    if head.startswith(b"ID3"):
        return "MP3"
    if head.startswith(b"OggS"):
        return "OGG"
    if head.startswith(b"fLaC"):
        return "FLAC"
    for i in range(min(len(head) - 1, 4096)):
        if head[i] == 0xFF:
            b = head[i + 1]
            if b & 0xF6 == 0xF0:  # ADTS (AAC)
                return "AAC"
            if b & 0xE0 == 0xE0 and b & 0x06:  # MPEG audio frame
                return "MP3"
    return None


def parse_playlist(text: str) -> str | None:
    for line in text.splitlines():
        line = line.strip()
        m = re.match(r"^File\d+\s*=\s*(\S+)", line, re.IGNORECASE)
        if m:
            line = m.group(1)
        if line.lower().startswith(("http://", "https://")):
            return line
    return None


def normalize_station(s: dict) -> dict:
    """Záznam Radio Browser → jednotný tvar pre frontend."""
    tags = [t.strip() for t in (s.get("tags") or "").split(",") if t.strip()][:6]
    sid = "rb-" + str(s.get("stationuuid", ""))
    return {
        "id": sid,
        "name": (s.get("name") or "").strip()[:120] or "Bez názvu",
        "url": s.get("url_resolved") or s.get("url") or "",
        "homepage": s.get("homepage") or "",
        "favicon": s.get("favicon") or "",
        "countrycode": (s.get("countrycode") or "").upper()[:2],
        "language": (s.get("language") or "")[:60],
        "tags": tags,
        "codec": (s.get("codec") or "").upper()[:10],
        "bitrate": int(s.get("bitrate") or 0),
        "catalog_ok": bool(s.get("lastcheckok", 1)),
        "source": "catalog",
    }


class RadioService:
    def __init__(
        self,
        data_dir: Path,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.logo_dir = data_dir / "radio-logos"
        self.transport = transport
        self.clock = clock
        self._servers: list[str] = []
        self._servers_at = 0.0
        self._cache: OrderedDict[str, tuple[float, list[dict]]] = OrderedDict()
        # stanice z posledných vyhľadávaní – iba pre ne smie backend stiahnuť logo
        self.known: OrderedDict[str, dict] = OrderedDict()

    def client(self, timeout: float = 8.0) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            transport=self.transport,
            timeout=httpx.Timeout(timeout),
            headers={"User-Agent": USER_AGENT},
            follow_redirects=True,
            max_redirects=5,
        )

    # --- katalóg ----------------------------------------------------------

    async def servers(self) -> list[str]:
        if self._servers and self.clock() - self._servers_at < 3600:
            return self._servers
        try:
            async with self.client(5) as c:
                r = await c.get("https://all.api.radio-browser.info/json/servers")
                r.raise_for_status()
                names = sorted({f"https://{s['name']}" for s in r.json() if s.get("name")})
            self._servers = names or FALLBACK_SERVERS
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            self._servers = FALLBACK_SERVERS
        self._servers_at = self.clock()
        return self._servers

    async def search(
        self, q: str = "", country: str = "", tag: str = "", language: str = "", limit: int = 40
    ) -> list[dict]:
        params = {
            "hidebroken": "true",
            "order": "clickcount",
            "reverse": "true",
            "limit": str(max(1, min(limit, 100))),
        }
        if q.strip():
            params["name"] = q.strip()[:80]
        if country.strip():
            params["countrycode"] = country.strip().upper()[:2]
        if tag.strip():
            params["tag"] = tag.strip().lower()[:40]
        if language.strip():
            params["language"] = language.strip().lower()[:40]
        key = repr(sorted(params.items()))
        hit = self._cache.get(key)
        if hit and self.clock() - hit[0] < SEARCH_TTL:
            return hit[1]
        last_exc: Exception | None = None
        for server in await self.servers():
            try:
                async with self.client(8) as c:
                    r = await c.get(f"{server}/json/stations/search", params=params)
                    r.raise_for_status()
                    rows = [normalize_station(s) for s in r.json()]
                break
            except (httpx.HTTPError, ValueError, TypeError) as exc:
                last_exc = exc
        else:
            reason = last_exc.__class__.__name__ if last_exc else "bez servera"
            raise RadioError(f"Katalóg rádií je nedostupný ({reason})")
        rows = [s for s in rows if s["url"].startswith(("http://", "https://"))]
        self._cache[key] = (self.clock(), rows)
        while len(self._cache) > 64:
            self._cache.popitem(last=False)
        for s in rows:
            self.known[s["id"]] = s
        while len(self.known) > 500:
            self.known.popitem(last=False)
        return rows

    # --- overenie streamu --------------------------------------------------

    async def check(self, url: str, _depth: int = 0) -> StreamCheck:
        url = validate_stream_url(url)
        path = urlparse(url).path.lower()
        if path.endswith(".m3u8"):
            return StreamCheck("unsupported", "HLS", url, "HLS (.m3u8) zatiaľ nie je podporované")
        try:
            async with (
                self.client(8) as c,
                c.stream("GET", url, headers={"Icy-MetaData": "0"}) as r,
            ):
                if r.status_code != 200:
                    return StreamCheck(
                        "unavailable", None, url, f"Server odpovedal {r.status_code}"
                    )
                ctype = (r.headers.get("content-type") or "").split(";")[0].strip().lower()
                final_url = str(r.url)
                head = b""
                async for chunk in r.aiter_bytes():
                    head += chunk
                    if len(head) >= MAX_PROBE_BYTES or (
                        ctype in PLAYLIST_TYPES and len(head) > 8192
                    ):
                        break
        except RadioError:
            raise
        except httpx.HTTPError as exc:
            return StreamCheck("unavailable", None, url, f"Bez spojenia ({exc.__class__.__name__})")
        if ctype in HLS_TYPES:
            return StreamCheck("unsupported", "HLS", final_url, "HLS zatiaľ nie je podporované")
        if ctype in PLAYLIST_TYPES or path.endswith((".m3u", ".pls")):
            inner = parse_playlist(head.decode("utf-8", "replace"))
            if not inner or _depth > 1:
                return StreamCheck("unavailable", None, url, "Playlist neobsahuje stream")
            return await self.check(inner, _depth + 1)
        if ctype.startswith("text/html"):
            return StreamCheck(
                "unavailable",
                None,
                final_url,
                "Adresa vedie na webovú stránku, nie na zvukový stream",
            )
        codec = AUDIO_TYPES.get(ctype) or sniff_codec(head)
        if not head:
            return StreamCheck("unavailable", codec, final_url, "Stream neposiela dáta")
        if codec is None:
            return StreamCheck(
                "unsupported", None, final_url, f"Neznámy formát ({ctype or 'bez typu'})"
            )
        if codec == "FLAC":
            return StreamCheck("ok", codec, final_url, "FLAC – vyššia záťaž siete")
        return StreamCheck("ok", codec, final_url, f"{codec} stream odpovedá")

    # --- logá --------------------------------------------------------------

    async def logo(self, favicon: str) -> tuple[bytes, str] | None:
        """Vráti (dáta, typ) loga z vyrovnávacej pamäte alebo ho stiahne (max. 256 kB, bez SVG)."""
        if not favicon:
            return None
        try:
            favicon = validate_stream_url(favicon)
        except RadioError:
            return None
        key = hashlib.sha256(favicon.encode()).hexdigest()[:32]
        for ctype, ext in LOGO_TYPES.items():
            f = self.logo_dir / f"{key}{ext}"
            if f.exists():
                return f.read_bytes(), ctype
        try:
            async with self.client(6) as c, c.stream("GET", favicon) as r:
                ctype = (r.headers.get("content-type") or "").split(";")[0].strip().lower()
                if r.status_code != 200 or ctype not in LOGO_TYPES:
                    return None
                data = b""
                async for chunk in r.aiter_bytes():
                    data += chunk
                    if len(data) > MAX_LOGO_BYTES:
                        return None
        except httpx.HTTPError:
            return None
        self.logo_dir.mkdir(parents=True, exist_ok=True)
        (self.logo_dir / f"{key}{LOGO_TYPES[ctype]}").write_bytes(data)
        return data, ctype


def new_custom_id() -> str:
    return "c-" + uuid.uuid4().hex[:10]
