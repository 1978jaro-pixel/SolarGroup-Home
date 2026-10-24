"""DEMO adaptér – simulované údaje.

Všetko, čo vracia, má ``source="demo"`` a frontend to jasne označí. Simulácia fotovoltiky
je deterministická pre daný deň (rovnaký deň = rovnaký priebeh), aby grafy nepreskakovali.
"""

import math
import random
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from ..models import (
    BlindState,
    CameraInfo,
    ClimateCommand,
    ClimateState,
    EnergySample,
    EnergySnapshot,
    HeatingCommand,
    HeatingState,
    LightCommand,
    LightState,
    Weather,
    WeatherDay,
)
from .base import (
    AdapterSet,
    BlindAdapter,
    CameraAdapter,
    ClimateAdapter,
    EnergyAdapter,
    HeatingAdapter,
    LightAdapter,
    WeatherAdapter,
    ok,
)

PV_PEAK_KW = 9.8
BATTERY_KWH = 10.0
BATTERY_MAX_KW = 5.0
BATTERY_MIN_SOC = 10.0
EV_KW = 7.4


def local_now() -> datetime:
    return datetime.now().astimezone()


@dataclass
class _Step:
    hour: float
    pv: float
    house: float
    ev: float
    battery: float
    grid: float
    soc: float


@dataclass
class _DayModel:
    day: date
    rng_seed: int = field(init=False)

    def __post_init__(self) -> None:
        self.rng_seed = self.day.toordinal()
        rng = random.Random(self.rng_seed)  # noqa: S311 – simulácia, nie kryptografia
        self.cloud_phase = [rng.uniform(0, math.tau) for _ in range(3)]
        self.cloud_depth = rng.uniform(0.05, 0.3)
        self.start_soc = rng.uniform(35, 55)

    def pv(self, h: float) -> float:
        if not 5.5 <= h <= 20.5:
            return 0.0
        base = math.sin(math.pi * (h - 5.5) / 15) ** 1.4
        clouds = 1 - self.cloud_depth * (
            0.5
            + 0.25 * math.sin(h * 1.7 + self.cloud_phase[0])
            + 0.15 * math.sin(h * 3.1 + self.cloud_phase[1])
            + 0.10 * math.sin(h * 5.3 + self.cloud_phase[2])
        )
        return max(0.0, PV_PEAK_KW * base * clouds)

    @staticmethod
    def house(h: float) -> float:
        return (
            0.32
            + 0.9 * math.exp(-(((h - 7.2) / 0.9) ** 2))
            + 0.55 * math.exp(-(((h - 12.5) / 1.1) ** 2))
            + 1.5 * math.exp(-(((h - 19.2) / 1.6) ** 2))
        )

    @staticmethod
    def ev(h: float) -> float:
        # Elektromobil nabíja po príchode domov.
        return EV_KW if 17.5 <= h < 19.75 else 0.0

    @staticmethod
    def ev_connected(h: float) -> bool:
        return h >= 17.25 or h < 7.0

    def simulate(self, until_h: float, step_h: float) -> list[_Step]:
        soc = self.start_soc
        steps: list[_Step] = []
        h = 0.0
        while h <= until_h + 1e-9:
            pv, house, ev = self.pv(h), self.house(h), self.ev(h)
            balance = pv - house - ev
            if balance > 0:
                room_kw = (100 - soc) / 100 * BATTERY_KWH / step_h
                battery = min(balance, BATTERY_MAX_KW, room_kw)
            else:
                avail_kw = max(0.0, (soc - BATTERY_MIN_SOC) / 100 * BATTERY_KWH / step_h)
                battery = -min(-balance, BATTERY_MAX_KW, avail_kw)
            grid = house + ev + battery - pv
            steps.append(_Step(h, pv, house, ev, battery, grid, soc))
            soc = min(100.0, max(0.0, soc + battery * step_h / BATTERY_KWH * 100))
            h += step_h
        return steps


def _r(x: float, nd: int = 2) -> float:
    return round(x, nd) + 0.0  # + 0.0 odstráni -0.0


class DemoEnergy(EnergyAdapter):
    async def snapshot(self):
        now = local_now()
        h = now.hour + now.minute / 60 + now.second / 3600
        step_h = 5 / 60
        steps = _DayModel(now.date()).simulate(h, step_h)
        cur = steps[-1]
        pv_kwh = sum(s.pv for s in steps) * step_h
        house_kwh = sum(s.house + s.ev for s in steps) * step_h
        imp = sum(max(0.0, s.grid) for s in steps) * step_h
        exp_ = sum(max(0.0, -s.grid) for s in steps) * step_h
        self_suff = 100.0 if house_kwh == 0 else max(0.0, min(100.0, (1 - imp / house_kwh) * 100))
        pv, house, battery = _r(cur.pv), _r(cur.house), _r(cur.battery)
        ev = _r(cur.ev)
        snap = EnergySnapshot(
            pv_kw=pv,
            house_kw=house,
            battery_kw=battery,
            battery_soc=_r(cur.soc, 1),
            grid_kw=_r(house + ev + battery - pv),
            ev_kw=ev,
            ev_connected=_DayModel.ev_connected(h),
            today_pv_kwh=_r(pv_kwh, 1),
            today_house_kwh=_r(house_kwh, 1),
            today_grid_import_kwh=_r(imp, 1),
            today_grid_export_kwh=_r(exp_, 1),
            self_sufficiency=_r(self_suff, 0),
        )
        return ok("demo", snap)

    async def history(self, day: date):
        now = local_now()
        if day > now.date():
            return ok("demo", [])
        until = 24 - 0.25 if day < now.date() else now.hour + now.minute / 60
        step_h = 0.25
        tz = now.tzinfo
        start = datetime.combine(day, time(0, 0), tzinfo=tz)
        samples = [
            EnergySample(
                ts=start + timedelta(hours=s.hour),
                pv_kw=_r(s.pv),
                house_kw=_r(s.house + s.ev),
                battery_kw=_r(s.battery),
                grid_kw=_r(s.grid),
                battery_soc=_r(s.soc, 1),
            )
            for s in _DayModel(day).simulate(until, step_h)
        ]
        return ok("demo", samples)


class DemoHeating(HeatingAdapter):
    def __init__(self) -> None:
        self._state: dict[str, dict] = {}
        self._last: dict[str, float] = {}

    def _get(self, device: dict) -> dict:
        return self._state.setdefault(
            device["id"],
            {"mode": "auto", "day_temp": 21.5, "night_temp": 19.0, "current": 20.4},
        )

    @staticmethod
    def _target(st: dict) -> float:
        if st["mode"] == "off":
            return 5.0
        if st["mode"] == "night":
            return st["night_temp"]
        if st["mode"] == "day":
            return st["day_temp"]
        h = local_now().hour
        return st["day_temp"] if 6 <= h < 22 else st["night_temp"]

    def _tick(self, device: dict) -> HeatingState:
        st = self._get(device)
        now = local_now().timestamp()
        dt = now - self._last.get(device["id"], now)
        self._last[device["id"]] = now
        target = self._target(st)
        goal = max(target, 17.0)
        st["current"] += (goal - st["current"]) * (1 - math.exp(-dt / 900))
        return HeatingState(
            device_id=device["id"],
            name=device["name"],
            current_temp=round(st["current"], 1),
            target_temp=target,
            mode=st["mode"],
            day_temp=st["day_temp"],
            night_temp=st["night_temp"],
            heating_active=st["mode"] != "off" and st["current"] < target - 0.2,
            water_temp=52.0 if st["mode"] != "off" else 30.0,
        )

    async def state(self, device):
        return ok("demo", self._tick(device))

    async def command(self, device, cmd: HeatingCommand):
        st = self._get(device)
        if cmd.mode is not None:
            st["mode"] = cmd.mode
        if cmd.day_temp is not None:
            st["day_temp"] = cmd.day_temp
        if cmd.night_temp is not None:
            st["night_temp"] = cmd.night_temp
        if cmd.target_temp is not None:
            # Cieľová teplota sa zapíše do práve aktívneho (denného/nočného) programu.
            mode = st["mode"]
            if mode == "off":
                st["mode"] = mode = "day"
            if mode == "night" or (mode == "auto" and self._target(st) == st["night_temp"]):
                st["night_temp"] = cmd.target_temp
            else:
                st["day_temp"] = cmd.target_temp
        return self._tick(device)


class DemoClimate(ClimateAdapter):
    def __init__(self) -> None:
        self._state: dict[str, dict] = {}
        self._last: dict[str, float] = {}

    def _get(self, device: dict) -> dict:
        return self._state.setdefault(
            device["id"],
            {"power": False, "mode": "cool", "fan": "auto", "target": 24.0, "current": 25.6},
        )

    def _tick(self, device: dict) -> ClimateState:
        st = self._get(device)
        now = local_now().timestamp()
        dt = now - self._last.get(device["id"], now)
        self._last[device["id"]] = now
        goal = st["target"] if st["power"] and st["mode"] in ("cool", "heat", "auto") else 25.6
        st["current"] += (goal - st["current"]) * (1 - math.exp(-dt / 600))
        return ClimateState(
            device_id=device["id"],
            name=device["name"],
            room=device.get("room_name"),
            power=st["power"],
            mode=st["mode"],
            fan=st["fan"],
            target_temp=st["target"],
            current_temp=round(st["current"], 1),
        )

    async def state(self, device):
        return ok("demo", self._tick(device))

    async def command(self, device, cmd: ClimateCommand):
        st = self._get(device)
        if cmd.power is not None:
            st["power"] = cmd.power
        if cmd.mode is not None:
            st["mode"] = cmd.mode
        if cmd.fan is not None:
            st["fan"] = cmd.fan
        if cmd.target_temp is not None:
            st["target"] = cmd.target_temp
        return self._tick(device)


class DemoLights(LightAdapter):
    def __init__(self) -> None:
        self._state: dict[str, dict] = {}

    def _get(self, device: dict) -> dict:
        on_by_default = device["id"] in ("light-obyvacka-led", "light-kuchyna")
        return self._state.setdefault(device["id"], {"on": on_by_default, "brightness": 70})

    def _out(self, device: dict) -> LightState:
        st = self._get(device)
        dimmable = bool(device["config"].get("dimmable"))
        return LightState(
            device_id=device["id"],
            name=device["name"],
            room_id=device.get("room_id"),
            room=device.get("room_name"),
            on=st["on"],
            brightness=st["brightness"] if dimmable else 100,
            dimmable=dimmable,
        )

    async def state(self, device):
        return ok("demo", self._out(device))

    async def command(self, device, cmd: LightCommand):
        st = self._get(device)
        if cmd.on is not None:
            st["on"] = cmd.on
        if cmd.brightness is not None:
            st["brightness"] = cmd.brightness
            st["on"] = True
        return self._out(device)


class DemoBlinds(BlindAdapter):
    def __init__(self) -> None:
        self._pos: dict[str, int] = {}

    def _out(self, device: dict) -> BlindState:
        return BlindState(
            device_id=device["id"],
            name=device["name"],
            room_id=device.get("room_id"),
            room=device.get("room_name"),
            position=self._pos.setdefault(device["id"], 20 if "spalna" in device["id"] else 100),
        )

    async def state(self, device):
        return ok("demo", self._out(device))

    async def set_position(self, device, position: int):
        self._pos[device["id"]] = position
        return self._out(device)


class DemoCameras(CameraAdapter):
    async def info(self, device):
        # Zámerne žiadne falošné zábery – iba informácia o kamere.
        return ok(
            "demo",
            CameraInfo(
                device_id=device["id"],
                name=device["name"],
                model=device["config"].get("model"),
                stream_available=False,
                note="Živý obraz zatiaľ nie je pripojený",
            ),
        )


class DemoWeather(WeatherAdapter):
    async def current(self):
        today = local_now().date()
        rng = random.Random(today.toordinal())  # noqa: S311
        codes = [0, 1, 2, 3, 61, 2, 1]
        daily = []
        for i in range(5):
            tmax = round(rng.uniform(12, 19), 0)
            daily.append(
                WeatherDay(
                    date=(today + timedelta(days=i)).isoformat(),
                    temp_min=tmax - round(rng.uniform(6, 10), 0),
                    temp_max=tmax,
                    code=codes[(today.toordinal() + i) % len(codes)],
                )
            )
        return ok(
            "demo",
            Weather(
                location="Žilina",
                temp=14.2,
                feels_like=12.9,
                humidity=68,
                wind_kmh=9,
                code=daily[0].code,
                daily=daily,
            ),
        )


def build_demo() -> AdapterSet:
    return AdapterSet(
        source="demo",
        energy=DemoEnergy(),
        heating=DemoHeating(),
        climate=DemoClimate(),
        lights=DemoLights(),
        blinds=DemoBlinds(),
        cameras=DemoCameras(),
        weather=DemoWeather(),
    )
