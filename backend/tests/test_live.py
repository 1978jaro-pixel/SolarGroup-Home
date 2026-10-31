from datetime import UTC, datetime, timedelta

from app.adapters.base import mark_stale, ok

from .conftest import CSRF


def test_live_never_returns_invented_values(live_client):
    r = live_client.get("/api/energy/snapshot").json()
    assert r["source"] == "live" and r["status"] == "unavailable" and r["data"] is None
    for path in ("/api/heating", "/api/climate", "/api/lights", "/api/blinds", "/api/cameras"):
        for reading in live_client.get(path).json():
            assert reading["source"] == "live"
            assert reading["status"] in ("offline", "unavailable")
            assert reading["data"] is None


def test_live_commands_report_unavailable(live_client):
    r = live_client.post("/api/heating/heating-main", json={"target_temp": 21}, headers=CSRF)
    assert r.status_code == 503


def test_live_solargroup_offline(tmp_path):
    from .conftest import PASSWORD, make_client

    # Neexistujúca adresa – musí sa zobraziť OFFLINE, nie hodnoty.
    with make_client(tmp_path, mode="live", solargroup_url="http://127.0.0.1:9") as c:
        c.post("/api/auth/setup", json={"username": "jaro", "password": PASSWORD}, headers=CSRF)
        r = c.get("/api/energy/snapshot").json()
        assert r["status"] == "offline" and r["data"] is None


def test_mark_stale():
    old = ok("live", {"x": 1}, datetime.now(UTC) - timedelta(minutes=10))
    stale = mark_stale(old, 120)
    assert stale.status == "stale" and stale.data == {"x": 1} and stale.updated_at == old.updated_at
    fresh = ok("live", {"x": 1})
    assert mark_stale(fresh, 120).status == "ok"
