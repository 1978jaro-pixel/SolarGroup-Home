import json
from datetime import datetime

import pytest

from app import climate_logic as cl
from app.models import ClimateCapabilities, ClimateCommand
from app.timeutil import zone

from .conftest import CSRF, PASSWORD, make_client

TZ = zone("Europe/Bratislava")


def test_capabilities_are_conservative_by_default():
    caps = cl.capabilities_of({"config": {}})
    assert caps.swing_positions == 0 and not caps.quiet and not caps.eco and not caps.timer


@pytest.mark.parametrize(
    "cmd",
    [
        ClimateCommand(swing="2"),
        ClimateCommand(quiet=True),
        ClimateCommand(eco=True),
        ClimateCommand(timer_on="07:00"),
        ClimateCommand(fan="5"),
        ClimateCommand(target_temp=31),
        ClimateCommand(target_temp=22.3),
    ],
)
def test_unsupported_settings_rejected(cmd):
    with pytest.raises(cl.ClimateError):
        cl.validate_command(cmd, ClimateCapabilities())


def test_mode_list_is_configurable():
    caps = ClimateCapabilities(modes=["cool", "fan"])
    with pytest.raises(cl.ClimateError):
        cl.validate_command(ClimateCommand(mode="heat"), caps)
    cl.validate_command(ClimateCommand(mode="cool"), caps)


def test_timers_switch_power_in_local_time():
    now = datetime(2026, 10, 24, 21, 0, tzinfo=TZ)
    s = cl.apply_command(
        cl.default_state(ClimateCapabilities()), ClimateCommand(timer_on="06:30"), now
    )
    # cez prechod na zimný čas (25. 10.) – 06:30 už platí +01:00
    assert s["timer_on_at"] == "2026-10-25T06:30:00+01:00"
    assert cl.run_timers(s, datetime(2026, 10, 25, 6, 31, tzinfo=TZ)) is True
    assert s["power"] is True and s["timer_on_at"] is None


def test_api_climate_full_control_and_persistence(tmp_path):
    with make_client(tmp_path) as c:
        c.post("/api/auth/setup", json={"username": "jaro", "password": PASSWORD}, headers=CSRF)
        [r] = c.get("/api/climate").json()
        caps = r["data"]["capabilities"]
        assert caps["fan_speeds"] == 5 and caps["swing_positions"] == 5 and caps["eco"]
        cmd = {
            "power": True,
            "mode": "heat",
            "fan": "4",
            "swing": "3",
            "quiet": True,
            "eco": True,
            "target_temp": 23.5,
            "timer_off": "23:15",
        }
        r = c.post("/api/climate/ac-obyvacka", json=cmd, headers=CSRF)
        assert r.status_code == 200, r.text
        d = r.json()
        assert (d["mode"], d["fan"], d["swing"], d["quiet"], d["eco"]) == (
            "heat",
            "4",
            "3",
            True,
            True,
        )
        assert d["timer_off_at"].endswith(("+01:00", "+02:00"))
        assert (
            c.post("/api/climate/ac-obyvacka", json={"target_temp": 36}, headers=CSRF).status_code
            == 422
        )
        r = c.post("/api/climate/ac-obyvacka", json={"target_temp": 30.5}, headers=CSRF)
        assert r.status_code == 400

    with make_client(tmp_path) as c:
        c.post("/api/auth/login", json={"username": "jaro", "password": PASSWORD}, headers=CSRF)
        d = c.get("/api/climate").json()[0]["data"]
        assert d["mode"] == "heat" and d["target_temp"] == 23.5 and d["fan"] == "4"


def test_api_rejects_features_disabled_in_config(authed):
    db = authed.app.state.db
    with db.connect() as conn:
        conn.execute(
            "UPDATE devices SET config = ? WHERE id = 'ac-obyvacka'",
            (json.dumps({"capabilities": {"modes": ["cool", "fan"], "fan_speeds": 3}}),),
        )
    d = authed.get("/api/climate").json()[0]["data"]
    assert d["swing"] is None and d["capabilities"]["quiet"] is False
    for body in ({"swing": "1"}, {"quiet": True}, {"mode": "heat"}, {"fan": "5"}):
        r = authed.post("/api/climate/ac-obyvacka", json=body, headers=CSRF)
        assert r.status_code == 400, body


def test_live_climate_command_is_not_confirmed(live_client):
    r = live_client.post("/api/climate/ac-obyvacka", json={"power": True}, headers=CSRF)
    assert r.status_code == 503
    # nepodporované nastavenie sa odmietne ešte pred kontaktom so zariadením
    r = live_client.post("/api/climate/ac-obyvacka", json={"target_temp": 31}, headers=CSRF)
    assert r.status_code == 400
