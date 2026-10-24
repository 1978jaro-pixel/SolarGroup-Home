"""Logika klimatizácie (Sinclair) nezávislá od hardvéru.

``validate_command`` sa volá pred každým príkazom v DEMO aj LIVE režime – zariadeniu sa nikdy
nepošle funkcia, ktorú podľa konfigurácie nepodporuje, ani teplota mimo jeho rozsahu.
"""

from datetime import datetime

from .models import ClimateCapabilities, ClimateCommand
from .timeutil import next_occurrence


class ClimateError(ValueError):
    """Nepodporované alebo neplatné nastavenie klimatizácie."""


def capabilities_of(device: dict) -> ClimateCapabilities:
    return ClimateCapabilities.model_validate(device.get("config", {}).get("capabilities", {}))


def validate_command(cmd: ClimateCommand, caps: ClimateCapabilities) -> None:
    if cmd.mode is not None and cmd.mode not in caps.modes:
        raise ClimateError("Tento režim jednotka nepodporuje")
    if cmd.fan is not None and cmd.fan != "auto" and int(cmd.fan) > caps.fan_speeds:
        raise ClimateError("Táto rýchlosť ventilátora nie je podporovaná")
    if cmd.swing is not None:
        if caps.swing_positions == 0:
            raise ClimateError("Nastavenie smeru prúdenia nie je podporované")
        if cmd.swing != "auto" and int(cmd.swing) > caps.swing_positions:
            raise ClimateError("Táto poloha lamiel nie je podporovaná")
    if cmd.quiet is not None and not caps.quiet:
        raise ClimateError("Tichý režim nie je podporovaný")
    if cmd.eco is not None and not caps.eco:
        raise ClimateError("ECO režim nie je podporovaný")
    if (cmd.timer_on is not None or cmd.timer_off is not None) and not caps.timer:
        raise ClimateError("Časovač nie je podporovaný")
    if cmd.target_temp is not None:
        t = cmd.target_temp
        if not caps.min_temp <= t <= caps.max_temp:
            raise ClimateError(f"Teplota musí byť v rozsahu {caps.min_temp:g}–{caps.max_temp:g} °C")
        if round(t / caps.temp_step, 6) % 1:
            raise ClimateError(f"Teplotu je možné nastaviť po {caps.temp_step:g} °C")


def default_state(caps: ClimateCapabilities) -> dict:
    return {
        "power": False,
        "mode": "cool" if "cool" in caps.modes else caps.modes[0],
        "fan": "auto",
        "swing": "auto" if caps.swing_positions else None,
        "quiet": False,
        "eco": False,
        "target": min(max(24.0, caps.min_temp), caps.max_temp),
        "timer_on_at": None,
        "timer_off_at": None,
    }


def apply_command(state: dict, cmd: ClimateCommand, now: datetime) -> dict:
    s = {**state}
    if cmd.power is not None:
        s["power"] = cmd.power
    if cmd.mode is not None:
        s["mode"] = cmd.mode
    if cmd.fan is not None:
        s["fan"] = cmd.fan
    if cmd.swing is not None:
        s["swing"] = cmd.swing
    if cmd.quiet is not None:
        s["quiet"] = cmd.quiet
    if cmd.eco is not None:
        s["eco"] = cmd.eco
    if cmd.target_temp is not None:
        s["target"] = cmd.target_temp
    if cmd.timer_on is not None:
        s["timer_on_at"] = next_occurrence(cmd.timer_on, now).isoformat() if cmd.timer_on else None
    if cmd.timer_off is not None:
        s["timer_off_at"] = (
            next_occurrence(cmd.timer_off, now).isoformat() if cmd.timer_off else None
        )
    return s


def run_timers(state: dict, now: datetime) -> bool:
    """Spustí časovače, ktorých čas uplynul. Vracia True pri zmene."""
    changed = False
    for key, power in (("timer_on_at", True), ("timer_off_at", False)):
        at = state.get(key)
        if at and now >= datetime.fromisoformat(at):
            state[key] = None
            state["power"] = power
            changed = True
    return changed
