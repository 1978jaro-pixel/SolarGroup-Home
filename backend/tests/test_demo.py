from datetime import date

import pytest

from app.adapters.demo import _DayModel

from .conftest import CSRF


def test_snapshot_is_marked_demo_and_balanced(authed):
    r = authed.get("/api/energy/snapshot").json()
    assert r["source"] == "demo" and r["status"] == "ok"
    d = r["data"]
    # pv + odber zo siete = dom + EV + nabíjanie batérie
    assert d["pv_kw"] + d["grid_kw"] == pytest.approx(d["house_kw"] + d["ev_kw"] + d["battery_kw"])
    assert 0 <= d["battery_soc"] <= 100


@pytest.mark.parametrize("day", [date(2026, 6, 21), date(2026, 12, 21)])
def test_day_model_respects_battery_limits(day):
    steps = _DayModel(day).simulate(23.75, 0.25)
    assert len(steps) == 96
    assert all(0 <= s.soc <= 100 for s in steps)
    assert all(abs(s.battery) <= 5.0 + 1e-9 for s in steps)
    assert steps[0].pv == 0 and max(s.pv for s in steps) > 1


def test_history_past_day(authed):
    r = authed.get("/api/energy/history", params={"day": "2026-06-21"}).json()
    assert r["source"] == "demo" and len(r["data"]) == 96


def test_heating_control(authed):
    [reading] = authed.get("/api/heating").json()
    assert reading["source"] == "demo"
    cmd = {"mode": "day", "target_temp": 22.5}
    r = authed.post("/api/heating/heating-main", json=cmd, headers=CSRF)
    assert r.status_code == 200
    assert r.json()["target_temp"] == 22.5 and r.json()["day_temp"] == 22.5
    r = authed.post("/api/heating/heating-main", json={"target_temp": 45}, headers=CSRF)
    assert r.status_code == 422


def test_climate_control(authed):
    r = authed.post(
        "/api/climate/ac-obyvacka",
        json={"power": True, "mode": "cool", "fan": "high", "target_temp": 22},
        headers=CSRF,
    )
    assert r.status_code == 200
    assert r.json()["power"] is True and r.json()["fan"] == "high"
    assert authed.post("/api/climate/neexistuje", json={}, headers=CSRF).status_code == 404


def test_lights_and_blinds(authed):
    lights = authed.get("/api/lights").json()
    assert len(lights) >= 5
    r = authed.post("/api/lights/light-spalna", json={"brightness": 40}, headers=CSRF).json()
    assert r["on"] is True and r["brightness"] == 40

    r = authed.post("/api/blinds/group", json={"position": 0}, headers=CSRF)
    assert r.status_code == 200 and all(b["position"] == 0 for b in r.json())
    r = authed.post("/api/blinds/blind-kuchyna", json={"position": 55}, headers=CSRF)
    assert r.json()["position"] == 55


def test_cameras_have_no_fake_stream(authed):
    cams = authed.get("/api/cameras").json()
    assert cams and all(c["data"]["stream_available"] is False for c in cams)
    assert cams[0]["data"]["model"] == "C310"


def test_system_info(authed):
    info = authed.get("/api/system").json()
    assert info["mode"] == "demo" and info["integrations"]


def test_websocket_pushes_energy(authed):
    with authed.websocket_connect("/api/ws") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "energy" and msg["payload"]["source"] == "demo"
