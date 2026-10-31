from datetime import date, datetime, timedelta

import pytest
from pydantic import ValidationError

from app import heating_logic as hl
from app.models import HeatingCommand, Holiday, WeeklyProgram
from app.timeutil import zone

from .conftest import CSRF, PASSWORD, make_client

TZ = zone("Europe/Bratislava")


def at(y, m, d, hh, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=TZ)


# 2026-10-26 je pondelok
MON = (2026, 10, 26)


def test_level_and_next_change_weekday():
    prog = hl.program_of(hl.default_settings())
    assert hl.level_at(prog, at(*MON, 7)) == "comfort"
    assert hl.level_at(prog, at(*MON, 10)) == "eco"
    # pred prvým prepínacím časom platí posledná úroveň z nedele (23:00 útlm)
    assert hl.level_at(prog, at(*MON, 5)) == "eco"
    when, level = hl.next_change(prog, at(*MON, 7))
    assert (when, level) == (at(*MON, 8), "eco")


def test_evaluate_auto_shows_active_level_and_next_switch():
    s = hl.default_settings()
    ev = hl.evaluate(s, at(*MON, 17))
    assert ev["target_temp"] == 22.0 and ev["active_level"] == "comfort"
    assert ev["next_switch"].at == at(*MON, 22) and ev["next_switch"].temp == 19.0


def test_dst_spring_forward_nonexistent_time():
    # 29. 3. 2026 – prechod na letný čas (02:00 → 03:00)
    prog = WeeklyProgram(
        sun=[{"time": "02:30", "level": "comfort"}, {"time": "06:00", "level": "eco"}]
    )
    when = hl.next_switch_point(prog, at(2026, 3, 29, 1, 0))
    assert when.utcoffset() == timedelta(hours=2)
    assert (when.hour, when.minute) == (3, 30)
    later = hl.next_switch_point(prog, at(2026, 3, 29, 4, 0))
    assert later.isoformat() == "2026-03-29T06:00:00+02:00"


def test_dst_autumn_offsets():
    # 25. 10. 2026 – prechod na zimný čas; 06:00 už platí +01:00
    prog = hl.program_of(hl.default_settings())
    when = hl.next_switch_point(prog, at(2026, 10, 25, 1, 0))
    assert when.isoformat() == "2026-10-25T07:00:00+01:00"
    before = hl.next_switch_point(prog, at(2026, 10, 24, 22, 0))
    assert before.isoformat() == "2026-10-24T23:00:00+02:00"


def test_temporary_change_until_next_switch_then_auto():
    s = hl.default_settings()
    now = at(*MON, 7)
    s = hl.apply_command(s, HeatingCommand(target_temp=23.5), now)
    assert s["mode"] == "temporary" and s["temporary_temp"] == 23.5
    assert hl.evaluate(s, now)["temporary_until"] == at(*MON, 8)
    assert hl.normalize(s, at(*MON, 8, 1)) is True
    assert s["mode"] == "auto"
    assert hl.evaluate(s, at(*MON, 8, 1))["target_temp"] == 19.0


def test_manual_eco_and_mode_switching():
    s = hl.default_settings()
    now = at(*MON, 12)
    s = hl.apply_command(s, HeatingCommand(mode="manual", target_temp=20.5), now)
    ev = hl.evaluate(s, now)
    assert ev["target_temp"] == 20.5 and ev["next_switch"] is None and ev["active_level"] is None
    s = hl.apply_command(s, HeatingCommand(mode="eco"), now)
    assert hl.evaluate(s, now)["target_temp"] == 19.0
    s = hl.apply_command(s, HeatingCommand(mode="auto"), now)
    assert hl.evaluate(s, now)["target_temp"] == 19.0  # 12:00 = útlm podľa programu


def test_holiday_mode():
    s = hl.default_settings()
    now = at(*MON, 12)
    hol = Holiday(start=date(2026, 10, 26), end=date(2026, 10, 30), temp=12)
    s = hl.apply_command(s, HeatingCommand(mode="holiday", holiday=hol), now)
    ev = hl.evaluate(s, now)
    assert ev["holiday_active"] and ev["target_temp"] == 12
    assert hl.normalize(s, at(2026, 10, 31, 0, 5)) is True and s["mode"] == "auto"


@pytest.mark.parametrize(
    "cmd, msg",
    [
        (HeatingCommand(eco_temp=23), "Útlmová"),
        (HeatingCommand(mode="holiday"), "dovolenku"),
        (
            HeatingCommand(
                mode="holiday", holiday=Holiday(start=date(2026, 1, 1), end=date(2026, 1, 5))
            ),
            "skončila",
        ),
    ],
)
def test_invalid_commands_rejected(cmd, msg):
    with pytest.raises(hl.HeatingError, match=msg):
        hl.apply_command(hl.default_settings(), cmd, at(*MON, 12))


def test_holiday_temperature_limit():
    s = hl.default_settings()
    now = at(*MON, 12)
    hol = Holiday(start=date(2026, 10, 26), end=date(2026, 10, 30))
    s = hl.apply_command(s, HeatingCommand(mode="holiday", holiday=hol), now)
    s = hl.apply_command(s, HeatingCommand(target_temp=15), now)
    assert hl.evaluate(s, now)["target_temp"] == 15
    with pytest.raises(hl.HeatingError, match="20"):
        hl.apply_command(s, HeatingCommand(target_temp=24), now)


def test_temporary_needs_switch_points():
    s = hl.set_program(hl.default_settings(), 1, WeeklyProgram())
    with pytest.raises(hl.HeatingError):
        hl.apply_command(s, HeatingCommand(target_temp=22), at(*MON, 12))


def test_unsafe_temperature_rejected_by_model():
    with pytest.raises(ValidationError):
        HeatingCommand(target_temp=35)
    with pytest.raises(ValidationError):
        Holiday(start=date(2026, 1, 2), end=date(2026, 1, 1))


def test_weekly_program_validation():
    with pytest.raises(ValidationError):
        WeeklyProgram(mon=[{"time": f"0{i}:00", "level": "eco"} for i in range(7)])
    with pytest.raises(ValidationError):
        WeeklyProgram(
            mon=[{"time": "06:00", "level": "eco"}, {"time": "06:00", "level": "comfort"}]
        )
    p = WeeklyProgram(
        mon=[{"time": "22:00", "level": "eco"}, {"time": "06:00", "level": "comfort"}]
    )
    assert [x.time for x in p.mon] == ["06:00", "22:00"]


def test_disabled_switch_point_is_ignored():
    prog = WeeklyProgram(
        mon=[
            {"time": "06:00", "level": "comfort"},
            {"time": "08:00", "level": "eco", "enabled": False},
            {"time": "22:00", "level": "eco"},
        ]
    )
    assert hl.level_at(prog, at(*MON, 12)) == "comfort"


# --- API ---------------------------------------------------------------------


def test_api_heating_state_and_commands(authed):
    [r] = authed.get("/api/heating").json()
    d = r["data"]
    assert r["source"] == "demo" and d["mode"] == "auto" and d["active_program"] == 1
    assert d["comfort_temp"] == 22 and d["eco_temp"] == 19 and d["next_switch"] is not None

    r = authed.post(
        "/api/heating/heating-main", json={"mode": "manual", "target_temp": 21.5}, headers=CSRF
    )
    assert r.status_code == 200 and r.json()["target_temp"] == 21.5 and r.json()["mode"] == "manual"
    assert (
        authed.post("/api/heating/heating-main", json={"target_temp": 40}, headers=CSRF).status_code
        == 422
    )
    r = authed.post("/api/heating/heating-main", json={"eco_temp": 25}, headers=CSRF)
    assert r.status_code == 400 and "Útlmová" in r.json()["detail"]
    r = authed.post("/api/heating/heating-main", json={"active_program": 2}, headers=CSRF)
    assert r.json()["active_program"] == 2


def test_api_schedule_save_and_persist_after_restart(tmp_path):
    with make_client(tmp_path) as c:
        c.post("/api/auth/setup", json={"username": "jaro", "password": PASSWORD}, headers=CSRF)
        sched = c.get("/api/heating/heating-main/schedule").json()["data"]
        assert sched["timezone"] == "Europe/Bratislava" and set(sched["programs"]) == {"1", "2"}
        prog = sched["programs"]["1"]
        prog["mon"] = [{"time": "05:30", "level": "comfort"}, {"time": "21:00", "level": "eco"}]
        r = c.put("/api/heating/heating-main/schedule/1", json=prog, headers=CSRF)
        assert r.status_code == 200
        c.post("/api/heating/heating-main", json={"mode": "eco"}, headers=CSRF)
        assert (
            c.put("/api/heating/heating-main/schedule/3", json=prog, headers=CSRF).status_code
            == 404
        )
        too_many = {**prog, "tue": [{"time": f"0{i}:00", "level": "eco"} for i in range(7)]}
        assert (
            c.put("/api/heating/heating-main/schedule/1", json=too_many, headers=CSRF).status_code
            == 422
        )

    # „reštart“ – nová aplikácia nad tou istou databázou
    with make_client(tmp_path) as c:
        c.post("/api/auth/login", json={"username": "jaro", "password": PASSWORD}, headers=CSRF)
        sched = c.get("/api/heating/heating-main/schedule").json()["data"]
        assert sched["programs"]["1"]["mon"][0]["time"] == "05:30"
        assert c.get("/api/heating").json()[0]["data"]["mode"] == "eco"


def test_api_schedule_requires_csrf(authed):
    prog = authed.get("/api/heating/heating-main/schedule").json()["data"]["programs"]["1"]
    assert authed.put("/api/heating/heating-main/schedule/1", json=prog).status_code == 403


def test_live_heating_never_pretends(live_client):
    r = live_client.get("/api/heating/heating-main/schedule").json()
    assert r["status"] == "unavailable" and r["data"] is None
    prog = WeeklyProgram().model_dump()
    assert (
        live_client.put("/api/heating/heating-main/schedule/1", json=prog, headers=CSRF).status_code
        == 503
    )
    r = live_client.post("/api/heating/heating-main", json={"mode": "manual"}, headers=CSRF)
    assert r.status_code == 503
