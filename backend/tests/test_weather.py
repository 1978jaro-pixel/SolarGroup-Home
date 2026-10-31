"""Počasie E4: Open-Meteo (7 dní, hodinová, uložená predpoveď), radar a mapové dlaždice."""

import asyncio
import json

import httpx
import pytest

from app.adapters.openmeteo import OpenMeteoWeather, parse_open_meteo
from app.weather_maps import USER_AGENT, WeatherMaps

from .conftest import CSRF, PASSWORD, make_client

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def om_payload(days=7):
    hours = [f"2026-10-31T{h:02d}:00" for h in range(24)]
    return {
        "current": {
            "temperature_2m": 9.1,
            "apparent_temperature": 7.0,
            "relative_humidity_2m": 78,
            "is_day": 1,
            "precipitation": 0.0,
            "weather_code": 3,
            "wind_speed_10m": 14.0,
            "wind_direction_10m": 225,
            "wind_gusts_10m": 32.0,
            "visibility": 18000,
            "uv_index": 1.2,
        },
        "hourly": {
            "time": hours,
            "temperature_2m": [9.0] * 24,
            "apparent_temperature": [7.0] * 24,
            "precipitation_probability": [20] * 24,
            "precipitation": [0.1] * 24,
            "weather_code": [61] * 24,
            "wind_speed_10m": [14] * 24,
            "wind_direction_10m": [225] * 24,
            "wind_gusts_10m": [30] * 24,
            "uv_index": [0.5] * 24,
            "is_day": [0] * 7 + [1] * 10 + [0] * 7,
        },
        "daily": {
            "time": [f"2026-11-{d + 1:02d}" for d in range(days)],
            "weather_code": [61] * days,
            "temperature_2m_max": [9.0] * days,
            "temperature_2m_min": [3.0] * days,
            "sunrise": ["2026-11-01T06:40"] * days,
            "sunset": ["2026-11-01T16:29"] * days,
            "uv_index_max": [1.0] * days,
            "precipitation_sum": [6.9] * days,
            "precipitation_probability_max": [80] * days,
            "wind_speed_10m_max": [22] * days,
            "wind_gusts_10m_max": [45] * days,
            "wind_direction_10m_dominant": [300] * days,
        },
    }


def test_parse_full_and_partial():
    w = parse_open_meteo(om_payload())
    assert len(w.daily) == 7 and len(w.hourly) == 24
    assert w.gust_kmh == 32 and w.visibility_m == 18000 and w.uv == 1.2
    assert w.daily[0].sunrise == "2026-11-01T06:40" and w.daily[0].precip_mm == 6.9
    assert w.hourly[0].is_day is False and w.hourly[8].is_day is True
    # chýbajúce voliteľné stĺpce → None, nie chyba a nie vymyslená hodnota
    p = om_payload()
    del p["daily"]["uv_index_max"], p["hourly"]["wind_gusts_10m"], p["current"]["visibility"]
    w = parse_open_meteo(p)
    assert w.daily[0].uv_max is None and w.hourly[0].gust_kmh is None and w.visibility_m is None


def test_open_meteo_request_cache_and_offline(tmp_path):
    seen = {}

    def ok_handler(req: httpx.Request) -> httpx.Response:
        seen.update(dict(req.url.params))
        return httpx.Response(200, json=om_payload())

    cache = tmp_path / "weather-cache.json"
    a = OpenMeteoWeather(
        True, 49.22, 18.74, cache_file=cache, transport=httpx.MockTransport(ok_handler)
    )
    r = asyncio.run(a.current())
    assert r.status == "ok" and r.data.hourly
    assert seen["forecast_days"] == "7" and seen["timezone"] == "Europe/Bratislava"
    assert "precipitation_probability" in seen["hourly"] and "sunrise" in seen["daily"]
    assert json.loads(cache.read_text())["weather"]["temp"] == 9.1

    def down(req):
        raise httpx.ConnectError("offline", request=req)

    # po reštarte bez internetu: posledná uložená predpoveď, ale ako OFFLINE s časom
    b = OpenMeteoWeather(True, 49.22, 18.74, cache_file=cache, transport=httpx.MockTransport(down))
    b._cache = (b._cache[0].replace(year=2000), b._cache[1])  # vypršaná
    r = asyncio.run(b.current())
    assert r.status == "offline" and r.data is not None and r.updated_at is not None
    c = OpenMeteoWeather(
        True, 49.22, 18.74, cache_file=tmp_path / "nic.json", transport=httpx.MockTransport(down)
    )
    r = asyncio.run(c.current())
    assert r.status == "offline" and r.data is None


def test_demo_weather_has_week_and_hours(authed):
    w = authed.get("/api/weather").json()
    assert (
        w["source"] == "demo" and len(w["data"]["daily"]) == 7 and len(w["data"]["hourly"]) == 168
    )
    assert w["data"]["daily"][0]["sunrise"] and w["data"]["gust_kmh"] is not None


# --- radar a mapa -------------------------------------------------------------

INDEX = {
    "version": "2.0",
    "host": "https://tilecache.rainviewer.com",
    "radar": {
        "past": [
            {"time": 1761900000, "path": "/v2/radar/abc123"},
            {"time": 1761900600, "path": "/v2/radar/def456"},
        ],
        "nowcast": [{"time": 1761901200, "path": "/../../etc/passwd"}],
    },
}


@pytest.fixture
def maps_client(tmp_path):
    calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req)
        u = str(req.url)
        if u.endswith("weather-maps.json"):
            return httpx.Response(200, json=INDEX)
        if u.startswith("https://tilecache.rainviewer.com/v2/radar/") or u.startswith(
            "https://tile.openstreetmap.org/"
        ):
            return httpx.Response(200, content=PNG, headers={"content-type": "image/png"})
        return httpx.Response(404)

    with make_client(tmp_path) as c:
        c.post("/api/auth/setup", json={"username": "jaro", "password": PASSWORD}, headers=CSRF)
        c.app.state.maps.transport = httpx.MockTransport(handler)
        yield c, calls


def test_radar_frames_and_tiles(maps_client):
    c, calls = maps_client
    j = c.get("/api/weather/radar/frames").json()
    # podozrivá cesta zo služby sa zahodí; host ani cesty sa do prehliadača neposielajú
    assert [f["time"] for f in j["frames"]] == [1761900000, 1761900600]
    assert j["max_zoom"] == 7 and "RainViewer" in j["attribution"] and "host" not in j
    r = c.get("/api/weather/radar/1761900600/7/70/44.png")
    assert r.status_code == 200 and r.content == PNG and r.headers["content-type"] == "image/png"
    tile_req = calls[-1]
    assert (
        str(tile_req.url)
        == "https://tilecache.rainviewer.com/v2/radar/def456/256/7/70/44/2/1_1.png"
    )
    assert tile_req.headers["user-agent"] == USER_AGENT
    n = len(calls)
    c.get("/api/weather/radar/1761900600/7/70/44.png")
    assert len(calls) == n  # z vyrovnávacej pamäte
    assert c.get("/api/weather/radar/1761900600/8/140/88.png").status_code == 404  # nad limit
    assert c.get("/api/weather/radar/123/7/70/44.png").status_code == 404  # neznáma snímka


def test_map_tiles_bbox_and_disk_cache(maps_client, tmp_path):
    c, calls = maps_client
    # Žilina, zoom 10: x=565, y=350
    r = c.get("/api/weather/map/10/565/350.png")
    assert r.status_code == 200 and (tmp_path / "map-tiles/10/565/350.png").exists()
    assert str(calls[-1].url) == "https://tile.openstreetmap.org/10/565/350.png"
    n = len(calls)
    assert c.get("/api/weather/map/10/565/350.png").status_code == 200 and len(calls) == n
    assert c.get("/api/weather/map/10/0/0.png").status_code == 404  # mimo Slovenska
    assert c.get("/api/weather/map/18/1/1.png").status_code == 404


def test_map_offline_and_bad_content(tmp_path):
    maps = WeatherMaps(
        tmp_path, transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"<html>"))
    )
    with pytest.raises(Exception) as e:
        asyncio.run(maps.map_tile(10, 565, 350))
    assert getattr(e.value, "status", None) == 502

    def down(req):
        raise httpx.ConnectError("x", request=req)

    maps.transport = httpx.MockTransport(down)
    with pytest.raises(Exception) as e:
        asyncio.run(maps.frames())
    assert e.value.status == 503


def test_weather_maps_require_login(client):
    assert client.get("/api/weather/radar/frames").status_code == 401
    assert client.get("/api/weather/map/10/565/350.png").status_code == 401
