"""Kalendár: súkromná iCal adresa, Google OAuth 2.0 (simulované API), šifrovanie, offline stav."""

import asyncio
import sqlite3
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

import httpx
import pytest

from app.calendar_sync import parse_ics

from .conftest import CSRF, PASSWORD, make_client

TZ = ZoneInfo("Europe/Bratislava")
TODAY = datetime.now(TZ).date()
D = TODAY.strftime("%Y%m%d")

ICS = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//SK
BEGIN:VEVENT
UID:tyzdenne@test
DTSTART;TZID=Europe/Bratislava:{D}T180000
DTEND;TZID=Europe/Bratislava:{D}T190000
RRULE:FREQ=WEEKLY;COUNT=4
SUMMARY:Tréning
LOCATION:Žilina
END:VEVENT
BEGIN:VEVENT
UID:celodenna@test
DTSTART;VALUE=DATE:{D}
DTEND;VALUE=DATE:{(TODAY + timedelta(days=1)).strftime("%Y%m%d")}
SUMMARY:Meniny babky
END:VEVENT
END:VCALENDAR
""".encode()

SECRET_ICS = "https://calendar.google.com/calendar/ical/abc%40gmail.com/private-TAJNE/basic.ics"


def web(request: httpx.Request) -> httpx.Response:
    url = str(request.url)
    if url.startswith(SECRET_ICS.split("%40")[0]):
        return httpx.Response(200, content=ICS, headers={"content-type": "text/calendar"})
    if url == "https://oauth2.googleapis.com/token":
        form = parse_qs(request.content.decode())
        if form["grant_type"] == ["authorization_code"]:
            assert form["code"] == ["kod-123"] and form["code_verifier"][0]
            return httpx.Response(
                200, json={"access_token": "AT", "expires_in": 3600, "refresh_token": "RT-TAJNE"}
            )
        return httpx.Response(200, json={"access_token": "AT2", "expires_in": 3600})
    if url.startswith("https://www.googleapis.com/calendar/v3/users/me/calendarList"):
        assert request.headers["authorization"] == "Bearer AT"
        return httpx.Response(
            200,
            json={
                "items": [
                    {
                        "id": "jaro@gmail.com",
                        "summary": "Jaro",
                        "primary": True,
                        "backgroundColor": "#1f7bff",
                    },
                    {"id": "sviatky", "summary": "Sviatky"},
                ]
            },
        )
    if "/calendars/jaro%40gmail.com/events" in url:
        start = datetime.now(TZ).replace(hour=9, minute=0, second=0, microsecond=0)
        return httpx.Response(
            200,
            json={
                "items": [
                    {
                        "id": "e1",
                        "summary": "Servis auta",
                        "start": {"dateTime": start.isoformat()},
                        "end": {"dateTime": (start + timedelta(hours=1)).isoformat()},
                    },
                    {"id": "e2", "status": "cancelled", "start": {"date": TODAY.isoformat()}},
                ]
            },
        )
    raise httpx.ConnectError("offline", request=request)


@pytest.fixture
def cal(tmp_path):
    with make_client(
        tmp_path,
        calendar_sync_minutes=0,
        google_client_id="cid.apps.googleusercontent.com",
        google_client_secret="sec",
        google_redirect_uri="http://testserver/api/calendar/google/callback",
    ) as c:
        assert (
            c.post(
                "/api/auth/setup", json={"username": "jaro", "password": PASSWORD}, headers=CSRF
            ).status_code
            == 200
        )
        c.app.state.calendar.transport = httpx.MockTransport(web)
        yield c


def window():
    return {"start": TODAY.isoformat(), "end": (TODAY + timedelta(days=30)).isoformat()}


def test_parse_ics_recurring_and_all_day():
    start = datetime.combine(TODAY, datetime.min.time(), TZ)
    ev = parse_ics(ICS, start, start + timedelta(days=30), TZ)
    trening = [e for e in ev if e["title"] == "Tréning"]
    assert len(trening) == 4  # opakovanie každý týždeň
    assert (
        trening[0]["start"].startswith(f"{TODAY.isoformat()}T18:00")
        and trening[0]["location"] == "Žilina"
    )
    allday = next(e for e in ev if e["all_day"])
    assert allday["start"] == TODAY.isoformat()


def test_ical_source_encrypted_and_events(cal, tmp_path):
    r = cal.post(
        "/api/calendar/ical",
        json={"name": "Rodina", "url": SECRET_ICS.replace("https://", "webcal://")},
        headers=CSRF,
    )
    assert r.status_code == 200, r.text
    ev = cal.get("/api/calendar/events", params=window()).json()
    assert ev["sources"] == 1 and ev["stale"] is False and ev["synced_at"]
    assert [e["title"] for e in ev["events"]][:2] == ["Meniny babky", "Tréning"]
    # tajná adresa nie je v databáze ani v API čitateľne
    raw = (tmp_path / "solargroup-home.sqlite3").read_bytes()
    assert b"private-TAJNE" not in raw
    assert "TAJNE" not in cal.get("/api/calendar/status").text
    assert oct((tmp_path / "secret.key").stat().st_mode & 0o777) == "0o600"


def test_invalid_ical_rejected(cal):
    r = cal.post(
        "/api/calendar/ical", json={"url": "https://offline.example.com/x.ics"}, headers=CSRF
    )
    assert r.status_code == 400
    r = cal.post("/api/calendar/ical", json={"url": "http://127.0.0.1/x.ics"}, headers=CSRF)
    assert r.status_code == 400


def test_offline_keeps_last_events_marked_stale(cal):
    cal.post("/api/calendar/ical", json={"name": "Rodina", "url": SECRET_ICS}, headers=CSRF)
    cal.app.state.calendar.transport = httpx.MockTransport(
        lambda req: (_ for _ in ()).throw(httpx.ConnectError("x", request=req))
    )
    asyncio.run(cal.app.state.calendar.sync_all())
    ev = cal.get("/api/calendar/events", params=window()).json()
    assert ev["stale"] is True and len(ev["events"]) == 5  # posledné uložené udalosti ostali
    st = cal.get("/api/calendar/status").json()["sources"][0]
    assert "zlyhala" in st["last_error"]


def test_google_oauth_flow(cal, tmp_path):
    r = cal.get("/api/calendar/google/start")
    assert r.status_code == 200
    url = urlparse(r.json()["url"])
    q = parse_qs(url.query)
    assert url.netloc == "accounts.google.com"
    assert q["scope"] == ["https://www.googleapis.com/auth/calendar.readonly"]  # iba čítanie
    assert q["code_challenge_method"] == ["S256"] and q["access_type"] == ["offline"]
    # neplatný stav sa odmietne
    bad = cal.get(
        "/api/calendar/google/callback",
        params={"code": "kod-123", "state": "cudzi"},
        follow_redirects=False,
    )
    assert bad.status_code == 303 and "google=chyba" in bad.headers["location"]
    ok = cal.get(
        "/api/calendar/google/callback",
        params={"code": "kod-123", "state": q["state"][0]},
        follow_redirects=False,
    )
    assert ok.status_code == 303 and ok.headers["location"] == "/kalendar?google=ok"
    status = cal.get("/api/calendar/status").json()
    src = status["sources"][0]
    assert src["kind"] == "google" and src["account"] == "jaro@gmail.com"
    assert [(c["name"], c["selected"]) for c in src["calendars"]] == [
        ("Jaro", True),
        ("Sviatky", False),
    ]
    ev = cal.get("/api/calendar/events", params=window()).json()["events"]
    assert [e["title"] for e in ev] == ["Servis auta"]  # zrušená udalosť sa nezobrazí
    with sqlite3.connect(tmp_path / "solargroup-home.sqlite3") as c:
        secret = c.execute("SELECT secret FROM calendar_sources").fetchone()[0]
    assert "RT-TAJNE" not in secret and "RT-TAJNE" not in str(status)


def test_google_start_only_on_device_and_configured(tmp_path):
    with make_client(
        tmp_path, calendar_sync_minutes=0, google_client_id="cid", google_client_secret="s"
    ) as c:
        c.post("/api/auth/setup", json={"username": "jaro", "password": PASSWORD}, headers=CSRF)
        r = c.get("/api/calendar/google/start")  # predvolená adresa 127.0.0.1:8080 ≠ testserver
        assert r.status_code == 400 and "priamo na displeji" in r.json()["detail"]
    with make_client(
        tmp_path,
        calendar_sync_minutes=0,
        google_redirect_uri="http://testserver/api/calendar/google/callback",
    ) as c:
        c.post("/api/auth/login", json={"username": "jaro", "password": PASSWORD}, headers=CSRF)
        r = c.get("/api/calendar/google/start")
        assert r.status_code == 400 and "nie je nastavený" in r.json()["detail"]


def test_calendar_requires_login(client):
    assert client.get("/api/calendar/status").status_code == 401
