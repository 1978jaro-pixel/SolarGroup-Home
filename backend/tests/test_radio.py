"""Internetové rádio: stanice, obľúbené, stav, katalóg, overovanie streamov (simulované servery)."""

import asyncio

import httpx
import pytest

from app.radio import RadioError, RadioService, parse_playlist, sniff_codec, validate_stream_url

from .conftest import CSRF

MP3_FRAME = b"\xff\xfb\x90\x64" + b"\x00" * 400
AAC_FRAME = b"\xff\xf1\x50\x80" + b"\x00" * 400


def fake_web(request: httpx.Request) -> httpx.Response:
    url = str(request.url)
    if url.startswith("https://all.api.radio-browser.info/json/servers"):
        return httpx.Response(200, json=[{"name": "de1.api.radio-browser.info"}])
    if "/json/stations/search" in url:
        q = request.url.params
        rows = [
            {
                "stationuuid": "aaa-111",
                "name": "Test Rock FM",
                "url_resolved": "https://stream.example.com/rock.mp3",
                "favicon": "https://img.example.com/rock.png",
                "countrycode": q.get("countrycode", "AT"),
                "tags": "rock,80s",
                "codec": "MP3",
                "bitrate": 128,
                "lastcheckok": 1,
            },
            {
                "stationuuid": "bbb-222",
                "name": "Bez URL",
                "url_resolved": "rtmp://x",
                "lastcheckok": 1,
            },
        ]
        return httpx.Response(200, json=rows)
    if url == "https://stream.example.com/rock.mp3":
        return httpx.Response(200, headers={"content-type": "audio/mpeg"}, content=MP3_FRAME)
    if url == "https://stream.example.com/aac":
        return httpx.Response(200, headers={"content-type": "audio/aacp"}, content=AAC_FRAME)
    if url == "https://stream.example.com/noctype":
        return httpx.Response(200, content=b"ID3" + MP3_FRAME)
    if url == "https://stream.example.com/list.pls":
        return httpx.Response(
            200,
            headers={"content-type": "audio/x-scpls"},
            text="[playlist]\nFile1=https://stream.example.com/aac\n",
        )
    if url == "https://stream.example.com/live.m3u8":
        return httpx.Response(
            200, headers={"content-type": "application/vnd.apple.mpegurl"}, text="#EXTM3U"
        )
    if url == "https://stream.example.com/page":
        return httpx.Response(200, headers={"content-type": "text/html"}, text="<html>")
    if url == "https://stream.example.com/gone":
        return httpx.Response(404)
    if url == "https://img.example.com/rock.png":
        return httpx.Response(200, headers={"content-type": "image/png"}, content=b"\x89PNG....")
    if url == "https://img.example.com/evil.svg":
        return httpx.Response(
            200, headers={"content-type": "image/svg+xml"}, text="<svg onload=alert(1)>"
        )
    raise httpx.ConnectError("offline", request=request)


@pytest.fixture
def radio(authed):
    authed.app.state.radio.transport = httpx.MockTransport(fake_web)
    return authed


def run(coro):
    return asyncio.run(coro)


def test_presets_slovak_stations_unverified(radio):
    st = radio.get("/api/radio/stations").json()
    names = [s["name"] for s in st if s["source"] == "preset"]
    assert names == [
        "Rádio Expres",
        "Fun rádio",
        "Rádio Slovensko",
        "Europa 2",
        "Rádio Vlna",
        "Rádio Melody",
        "Rádio_FM",
    ]
    # kým ich nikto neoveril, nie sú vydávané za funkčné
    assert all(s["status"] == "unknown" for s in st)


def test_requires_login(client):
    assert client.get("/api/radio/stations").status_code == 401


def test_favorites_custom_url_and_state_persist(radio):
    r = radio.post(
        "/api/radio/stations",
        json={"name": "Moje rádio", "url": "https://stream.example.com/aac"},
        headers=CSRF,
    )
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    assert sid.startswith("c-") and r.json()["source"] == "custom" and r.json()["favorite"]
    # rovnaká URL sa nepridá druhýkrát
    again = radio.post(
        "/api/radio/stations",
        json={"name": "Duplicitné", "url": "https://stream.example.com/aac"},
        headers=CSRF,
    )
    assert again.json()["id"] == sid
    # hviezdička
    r = radio.patch("/api/radio/stations/sk-expres", json={"favorite": True}, headers=CSRF)
    assert r.json()["favorite"] is True
    # posledná stanica a hlasitosť (nič sa nespúšťa samo – iba sa zapamätá)
    radio.put("/api/radio/state", json={"station_id": sid, "volume": 0.35}, headers=CSRF)
    assert radio.get("/api/radio/state").json() == {"station_id": sid, "volume": 0.35}
    # predvoľbu nemožno zmazať, vlastnú áno
    assert radio.delete("/api/radio/stations/sk-expres", headers=CSRF).status_code == 400
    assert radio.delete(f"/api/radio/stations/{sid}", headers=CSRF).json() == {"ok": True}
    assert radio.get("/api/radio/state").json()["station_id"] is None


def test_rejects_local_and_invalid_urls(radio):
    for bad in [
        "ftp://x.sk/a.mp3",
        "http://127.0.0.1:8080/api",
        "http://localhost/x",
        "http://169.254.169.254/",
        "javascript:alert(1)",
    ]:
        r = radio.post("/api/radio/stations", json={"name": "x", "url": bad}, headers=CSRF)
        assert r.status_code in (400, 422), bad
    # stanica v domácej sieti (napr. NAS) je povolená
    assert (
        validate_stream_url("http://192.168.1.20:8000/stream") == "http://192.168.1.20:8000/stream"
    )
    with pytest.raises(RadioError):
        validate_stream_url("http://[::1]/x")


def test_search_catalog_and_cache(radio):
    r = radio.get("/api/radio/search", params={"q": "rock", "country": "at", "tag": "80s"})
    assert r.status_code == 200
    rows = r.json()
    assert [s["name"] for s in rows] == ["Test Rock FM"]  # stanica bez http(s) URL je vyradená
    s = rows[0]
    assert s["id"] == "rb-aaa-111" and s["countrycode"] == "AT" and s["tags"] == ["rock", "80s"]
    assert s["logo"] == "/api/radio/logo/rb-aaa-111"
    # druhé rovnaké vyhľadávanie ide z vyrovnávacej pamäte (server už nemusí odpovedať)
    radio.app.state.radio.transport = httpx.MockTransport(
        lambda req: (_ for _ in ()).throw(httpx.ConnectError("x", request=req))
    )
    assert (
        radio.get("/api/radio/search", params={"q": "rock", "country": "at", "tag": "80s"}).json()
        == rows
    )


def test_search_catalog_offline(radio):
    radio.app.state.radio.transport = httpx.MockTransport(
        lambda req: (_ for _ in ()).throw(httpx.ConnectError("x", request=req))
    )
    r = radio.get("/api/radio/search", params={"q": "nic"})
    assert r.status_code == 503 and "nedostupný" in r.json()["detail"]


def test_logo_only_for_known_stations_no_svg(radio):
    radio.get("/api/radio/search", params={"q": "rock"})
    r = radio.get("/api/radio/logo/rb-aaa-111")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert radio.get("/api/radio/logo/rb-neznama").status_code == 404
    svc: RadioService = radio.app.state.radio
    assert run(svc.logo("https://img.example.com/evil.svg")) is None


@pytest.mark.parametrize(
    ("url", "status", "codec"),
    [
        ("https://stream.example.com/rock.mp3", "ok", "MP3"),
        ("https://stream.example.com/aac", "ok", "AAC"),
        ("https://stream.example.com/noctype", "ok", "MP3"),
        ("https://stream.example.com/list.pls", "ok", "AAC"),
        ("https://stream.example.com/live.m3u8", "unsupported", "HLS"),
        ("https://stream.example.com/page", "unavailable", None),
        ("https://stream.example.com/gone", "unavailable", None),
        ("https://offline.example.com/x.mp3", "unavailable", None),
    ],
)
def test_stream_check(radio, url, status, codec):
    r = radio.post("/api/radio/check", json={"url": url}, headers=CSRF)
    assert r.status_code == 200
    assert (r.json()["status"], r.json()["codec"]) == (status, codec)


def test_station_check_updates_status(radio):
    radio.app.state.radio.transport = httpx.MockTransport(lambda req: httpx.Response(503))
    st = radio.post("/api/radio/stations/sk-expres/check", headers=CSRF).json()
    assert st["status"] == "unavailable" and "503" in st["status_detail"] and st["checked_at"]


def test_helpers():
    assert sniff_codec(b"OggS....") == "OGG"
    assert sniff_codec(AAC_FRAME) == "AAC"
    assert sniff_codec(b"<html>") is None
    assert parse_playlist("#EXTM3U\n#EXTINF:-1,x\nhttp://a.sk/s\n") == "http://a.sk/s"
    assert parse_playlist("[playlist]\nfile1=https://b.sk/x\n") == "https://b.sk/x"


def test_migration_v2_to_v3_adds_presets(tmp_path):
    import sqlite3

    from app.db import Database

    db = Database(tmp_path / "x.sqlite3")
    db.init()
    with db.connect() as conn:  # simulácia staršej databázy v2
        conn.execute("DROP TABLE radio_stations")
        conn.execute("UPDATE schema_version SET version = 2")
    db.init()
    with sqlite3.connect(tmp_path / "x.sqlite3") as c:
        assert c.execute("SELECT version FROM schema_version").fetchone()[0] == 3
        assert (
            c.execute("SELECT COUNT(*) FROM radio_stations WHERE source='preset'").fetchone()[0]
            == 7
        )
