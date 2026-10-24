"""Dátový model API (Pydantic)."""

from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")

# ok          – čerstvé údaje
# stale       – údaje sú staršie než SGH_STALE_AFTER_SECONDS (zobrazí sa čas aktualizácie)
# offline     – zariadenie/služba neodpovedá
# unavailable – integrácia ešte nie je nakonfigurovaná alebo implementovaná
ReadingStatus = Literal["ok", "stale", "offline", "unavailable"]
Source = Literal["demo", "live"]


class Reading(BaseModel, Generic[T]):
    """Obálka pre každú hodnotu – frontend z nej vie, či ide o DEMO, OFFLINE a pod."""

    status: ReadingStatus
    source: Source
    updated_at: datetime | None = None
    message: str | None = None
    data: T | None = None


# --- Fotovoltika --------------------------------------------------------


class EnergySnapshot(BaseModel):
    """Okamžité výkony v kW. Kladné battery_kw = nabíjanie, kladné grid_kw = odber zo siete."""

    pv_kw: float
    house_kw: float
    battery_kw: float
    battery_soc: float = Field(ge=0, le=100)
    grid_kw: float
    ev_kw: float
    ev_connected: bool
    today_pv_kwh: float
    today_house_kwh: float
    today_grid_import_kwh: float
    today_grid_export_kwh: float
    self_sufficiency: float = Field(ge=0, le=100)


class EnergySample(BaseModel):
    ts: datetime
    pv_kw: float
    house_kw: float
    battery_kw: float
    grid_kw: float
    battery_soc: float


# --- Kúrenie a klimatizácia -----------------------------------------------

HeatingMode = Literal["auto", "day", "night", "off"]
ClimateMode = Literal["auto", "cool", "heat", "dry", "fan"]
FanSpeed = Literal["auto", "low", "medium", "high"]


class HeatingState(BaseModel):
    device_id: str
    name: str
    current_temp: float | None
    target_temp: float
    mode: HeatingMode
    day_temp: float
    night_temp: float
    heating_active: bool
    water_temp: float | None = None


class HeatingCommand(BaseModel):
    target_temp: float | None = Field(default=None, ge=5, le=30)
    mode: HeatingMode | None = None
    day_temp: float | None = Field(default=None, ge=5, le=30)
    night_temp: float | None = Field(default=None, ge=5, le=30)


class ClimateState(BaseModel):
    device_id: str
    name: str
    room: str | None
    power: bool
    mode: ClimateMode
    fan: FanSpeed
    target_temp: float
    current_temp: float | None


class ClimateCommand(BaseModel):
    power: bool | None = None
    mode: ClimateMode | None = None
    fan: FanSpeed | None = None
    target_temp: float | None = Field(default=None, ge=16, le=31)


# --- Svetlá a žalúzie ----------------------------------------------------


class LightState(BaseModel):
    device_id: str
    name: str
    room_id: str | None
    room: str | None
    on: bool
    brightness: int = Field(ge=0, le=100)
    dimmable: bool


class LightCommand(BaseModel):
    on: bool | None = None
    brightness: int | None = Field(default=None, ge=1, le=100)


class BlindState(BaseModel):
    device_id: str
    name: str
    room_id: str | None
    room: str | None
    position: int = Field(ge=0, le=100, description="0 = zatvorené, 100 = otvorené")
    moving: bool = False


class BlindCommand(BaseModel):
    position: int = Field(ge=0, le=100)


class BlindGroupCommand(BaseModel):
    position: int = Field(ge=0, le=100)
    device_ids: list[str] | None = Field(default=None, description="None = všetky žalúzie")


# --- Kamery a videovrátnik -----------------------------------------------


class CameraInfo(BaseModel):
    device_id: str
    name: str
    model: str | None
    stream_available: bool
    note: str


# --- Počasie -----------------------------------------------------------------


class WeatherDay(BaseModel):
    date: str
    temp_min: float
    temp_max: float
    code: int


class Weather(BaseModel):
    location: str
    temp: float
    feels_like: float | None
    humidity: float | None
    wind_kmh: float | None
    code: int
    daily: list[WeatherDay]


# --- Systém --------------------------------------------------------------


class Integration(BaseModel):
    id: str
    name: str
    status: ReadingStatus
    message: str | None = None


class SystemInfo(BaseModel):
    app: str
    version: str
    mode: Source
    hostname: str
    python: str
    uptime_s: int
    integrations: list[Integration]


class UserOut(BaseModel):
    username: str
    role: str


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class SetupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=10, max_length=256)
