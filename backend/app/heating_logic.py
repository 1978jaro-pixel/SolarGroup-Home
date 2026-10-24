"""Logika programovateľného termostatu (inšpirované Buderus Logamatic).

Čisté funkcie bez väzby na hardvér – používa ich DEMO adaptér a testy. Skutočný Buderus
regulátor si program vyhodnocuje sám; LIVE adaptér ho bude iba čítať a zapisovať.

Stav okruhu (``settings``) je obyčajný slovník, ktorý sa ukladá do SQLite:

    mode, comfort_temp, eco_temp, manual_temp, temporary_temp, temporary_until (ISO),
    holiday {start, end, temp} | None, active_program (1|2), programs {"1": {...}, "2": {...}}
"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from .models import (
    DAYS,
    HEATING_MAX_TEMP,
    HEATING_MIN_TEMP,
    HeatingCommand,
    Holiday,
    NextSwitch,
    WeeklyProgram,
)
from .timeutil import combine_local


class HeatingError(ValueError):
    """Neplatné alebo nebezpečné nastavenie kúrenia."""


DEFAULT_PROGRAM_1 = {
    **{
        d: [
            {"time": "06:00", "level": "comfort"},
            {"time": "08:00", "level": "eco"},
            {"time": "16:00", "level": "comfort"},
            {"time": "22:00", "level": "eco"},
        ]
        for d in DAYS[:5]
    },
    **{
        d: [{"time": "07:00", "level": "comfort"}, {"time": "23:00", "level": "eco"}]
        for d in DAYS[5:]
    },
}

# Program 2 – napr. práca z domu: komfort celý deň
DEFAULT_PROGRAM_2 = {
    **{
        d: [{"time": "06:00", "level": "comfort"}, {"time": "22:00", "level": "eco"}]
        for d in DAYS[:5]
    },
    **{
        d: [{"time": "07:00", "level": "comfort"}, {"time": "23:00", "level": "eco"}]
        for d in DAYS[5:]
    },
}


def default_settings() -> dict:
    return {
        "mode": "auto",
        "comfort_temp": 22.0,
        "eco_temp": 19.0,
        "manual_temp": 21.0,
        "temporary_temp": None,
        "temporary_until": None,
        "holiday": None,
        "active_program": 1,
        "programs": {"1": DEFAULT_PROGRAM_1, "2": DEFAULT_PROGRAM_2},
    }


def program_of(settings: dict, number: int | None = None) -> WeeklyProgram:
    key = str(number or settings["active_program"])
    return WeeklyProgram.model_validate(settings["programs"][key])


def _points(program: WeeklyProgram, day: date) -> list[tuple[str, str]]:
    return [(p.time, p.level) for p in getattr(program, DAYS[day.weekday()]) if p.enabled]


def level_at(program: WeeklyProgram, now: datetime) -> str:
    """Úroveň (comfort/eco) platná v danom okamihu. Pred prvým prepínacím časom dňa platí
    posledná úroveň z predchádzajúcich dní. Prázdny program = trvalý útlm."""
    hhmm = now.strftime("%H:%M")
    today = [p for p in _points(program, now.date()) if p[0] <= hhmm]
    if today:
        return today[-1][1]
    for back in range(1, 8):
        pts = _points(program, now.date() - timedelta(days=back))
        if pts:
            return pts[-1][1]
    return "eco"


def _upcoming(program: WeeklyProgram, now: datetime):
    tz = now.tzinfo
    assert isinstance(tz, ZoneInfo)
    for ahead in range(0, 8):
        day = now.date() + timedelta(days=ahead)
        for hhmm, level in _points(program, day):
            at = combine_local(day, hhmm, tz)
            if at > now:
                yield at, level


def next_switch_point(program: WeeklyProgram, now: datetime) -> datetime | None:
    """Najbližší prepínací čas (bez ohľadu na úroveň) – koniec dočasnej zmeny."""
    return next((at for at, _ in _upcoming(program, now)), None)


def next_change(program: WeeklyProgram, now: datetime) -> tuple[datetime, str] | None:
    """Najbližšia skutočná zmena úrovne (komfort ↔ útlm)."""
    current = level_at(program, now)
    return next(((at, lvl) for at, lvl in _upcoming(program, now) if lvl != current), None)


def _temp_for(settings: dict, level: str) -> float:
    return settings["comfort_temp"] if level == "comfort" else settings["eco_temp"]


def _holiday(settings: dict) -> Holiday | None:
    return Holiday.model_validate(settings["holiday"]) if settings.get("holiday") else None


def normalize(settings: dict, now: datetime) -> bool:
    """Automatické prechody (koniec dočasnej zmeny, koniec dovolenky). Vracia True pri zmene."""
    changed = False
    if settings["mode"] == "temporary":
        until = settings.get("temporary_until")
        if not until or now >= datetime.fromisoformat(until):
            settings.update(mode="auto", temporary_temp=None, temporary_until=None)
            changed = True
    if settings["mode"] == "holiday":
        hol = _holiday(settings)
        if hol is None or now.date() > hol.end:
            settings.update(mode="auto", holiday=None)
            changed = True
    return changed


def evaluate(settings: dict, now: datetime) -> dict:
    """Vypočíta cieľovú teplotu, aktívnu úroveň a ďalšiu zmenu pre aktuálny okamih."""
    program = program_of(settings)
    level = level_at(program, now)
    mode = settings["mode"]
    hol = _holiday(settings)
    holiday_active = mode == "holiday" and hol is not None and hol.start <= now.date() <= hol.end

    if mode == "manual":
        target = settings["manual_temp"]
    elif mode == "eco":
        target = settings["eco_temp"]
    elif mode == "temporary":
        target = settings["temporary_temp"]
    elif holiday_active:
        target = hol.temp  # type: ignore[union-attr]
    else:  # auto, alebo naplánovaná dovolenka, ktorá ešte nezačala
        target = _temp_for(settings, level)

    nxt = None
    if mode in ("auto", "temporary") or (mode == "holiday" and not holiday_active):
        change = next_change(program, now)
        if change:
            nxt = NextSwitch(at=change[0], level=change[1], temp=_temp_for(settings, change[1]))  # type: ignore[arg-type]

    return {
        "target_temp": float(target),
        "active_level": level if mode in ("auto", "temporary", "holiday") else None,
        "next_switch": nxt,
        "holiday_active": holiday_active,
        "temporary_until": datetime.fromisoformat(settings["temporary_until"])
        if settings.get("temporary_until")
        else None,
    }


def _check_range(value: float, what: str) -> None:
    if not HEATING_MIN_TEMP <= value <= HEATING_MAX_TEMP:
        raise HeatingError(
            f"{what} musí byť v rozsahu {HEATING_MIN_TEMP:g}–{HEATING_MAX_TEMP:g} °C"
        )


def apply_command(settings: dict, cmd: HeatingCommand, now: datetime) -> dict:
    """Aplikuje príkaz na kópiu nastavení. Pri neplatnej kombinácii vyhodí HeatingError."""
    s = {**settings}
    if cmd.comfort_temp is not None:
        s["comfort_temp"] = cmd.comfort_temp
    if cmd.eco_temp is not None:
        s["eco_temp"] = cmd.eco_temp
    if s["eco_temp"] > s["comfort_temp"]:
        raise HeatingError("Útlmová teplota nesmie byť vyššia ako komfortná")
    if cmd.active_program is not None:
        s["active_program"] = cmd.active_program
    if cmd.holiday is not None:
        if cmd.holiday.end < now.date():
            raise HeatingError("Dovolenka už skončila")
        s["holiday"] = cmd.holiday.model_dump(mode="json")

    current_target = evaluate(s, now)["target_temp"]

    def start_temporary(temp: float) -> None:
        until = next_switch_point(program_of(s), now)
        if until is None:
            raise HeatingError("Program nemá žiadny prepínací čas – dočasná zmena nie je možná")
        s.update(mode="temporary", temporary_temp=temp, temporary_until=until.isoformat())

    mode = cmd.mode
    if mode is not None:
        if mode == "holiday" and not s.get("holiday"):
            raise HeatingError("Pre dovolenku zadajte dátum začiatku a konca")
        if mode == "temporary":
            start_temporary(cmd.target_temp if cmd.target_temp is not None else current_target)
        else:
            if mode == "manual":
                s["manual_temp"] = (
                    cmd.target_temp if cmd.target_temp is not None else current_target
                )
            elif mode == "eco" and cmd.target_temp is not None:
                if cmd.target_temp > s["comfort_temp"]:
                    raise HeatingError("Útlmová teplota nesmie byť vyššia ako komfortná")
                s["eco_temp"] = cmd.target_temp
            s.update(mode=mode, temporary_temp=None, temporary_until=None)
            if mode != "holiday":
                s["holiday"] = None  # prepnutím na iný režim sa dovolenka zruší
    elif cmd.target_temp is not None:
        t = cmd.target_temp
        _check_range(t, "Teplota")
        if s["mode"] == "auto":
            start_temporary(t)  # zmena v režime AUTO = dočasná zmena (ako Buderus)
        elif s["mode"] == "temporary":
            s["temporary_temp"] = t
        elif s["mode"] == "manual":
            s["manual_temp"] = t
        elif s["mode"] == "eco":
            if t > s["comfort_temp"]:
                raise HeatingError("Útlmová teplota nesmie byť vyššia ako komfortná")
            s["eco_temp"] = t
        elif s["mode"] == "holiday":
            if t > 20:
                raise HeatingError("Teplota počas dovolenky môže byť najviac 20 °C")
            s["holiday"] = {**s["holiday"], "temp": t}
    return s


def set_program(settings: dict, number: int, program: WeeklyProgram) -> dict:
    s = {**settings, "programs": {**settings["programs"], str(number): program.model_dump()}}
    return s
