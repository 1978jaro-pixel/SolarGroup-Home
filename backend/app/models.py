"""Dátový model API (Pydantic)."""

from datetime import date, datetime
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, Field, model_validator

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


# --- Kúrenie (Buderus) ----------------------------------------------------
#
# Prevádzkové režimy podľa regulátorov Buderus Logamatic:
#   auto      – podľa týždenného programu (komfort / útlm)
#   manual    – trvalá ručná teplota
#   temporary – dočasná zmena do nasledujúceho prepínacieho času, potom späť na auto
#   eco       – trvalý útlm (úsporný režim)
#   holiday   – dovolenka od–do s vlastnou teplotou, potom späť na auto

HeatingMode = Literal["auto", "manual", "temporary", "eco", "holiday"]
HeatingLevel = Literal["comfort", "eco"]
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
MAX_SWITCH_POINTS = 6

# Bezpečné rozsahy teplôt pre vykurovanie (°C)
HEATING_MIN_TEMP = 5.0
HEATING_MAX_TEMP = 28.0

HeatingTemp = Annotated[float, Field(ge=HEATING_MIN_TEMP, le=HEATING_MAX_TEMP)]


class SwitchPoint(BaseModel):
    """Prepínací čas: od tohto času platí daná úroveň (až do ďalšieho prepínacieho času)."""

    time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    level: HeatingLevel
    enabled: bool = True


DayProgram = Annotated[list[SwitchPoint], Field(max_length=MAX_SWITCH_POINTS)]


class WeeklyProgram(BaseModel):
    mon: DayProgram = []
    tue: DayProgram = []
    wed: DayProgram = []
    thu: DayProgram = []
    fri: DayProgram = []
    sat: DayProgram = []
    sun: DayProgram = []

    @model_validator(mode="after")
    def _sorted_unique(self) -> "WeeklyProgram":
        for day in DAYS:
            points = getattr(self, day)
            times = [p.time for p in points]
            if len(set(times)) != len(times):
                raise ValueError(f"{day}: prepínacie časy sa nesmú opakovať")
            setattr(self, day, sorted(points, key=lambda p: p.time))
        return self


class HeatingSchedule(BaseModel):
    device_id: str
    active_program: Literal[1, 2]
    programs: dict[str, WeeklyProgram]
    timezone: str


class NextSwitch(BaseModel):
    at: datetime
    level: HeatingLevel
    temp: float


class Holiday(BaseModel):
    start: date
    end: date
    temp: Annotated[float, Field(ge=HEATING_MIN_TEMP, le=20.0)] = 12.0

    @model_validator(mode="after")
    def _order(self) -> "Holiday":
        if self.end < self.start:
            raise ValueError("Koniec dovolenky musí byť po jej začiatku")
        return self


class HeatingState(BaseModel):
    device_id: str
    name: str
    circuit: int = 1
    current_temp: float | None
    target_temp: float
    mode: HeatingMode
    active_level: HeatingLevel | None = Field(description="Aktívna úroveň programu práve teraz")
    comfort_temp: float
    eco_temp: float
    manual_temp: float
    temporary_until: datetime | None = None
    holiday: Holiday | None = None
    holiday_active: bool = False
    active_program: Literal[1, 2] = 1
    next_switch: NextSwitch | None = None
    heating_active: bool
    water_temp: float | None = None
    min_temp: float = HEATING_MIN_TEMP
    max_temp: float = HEATING_MAX_TEMP


class HeatingCommand(BaseModel):
    mode: HeatingMode | None = None
    target_temp: HeatingTemp | None = None
    comfort_temp: HeatingTemp | None = None
    eco_temp: HeatingTemp | None = None
    active_program: Literal[1, 2] | None = None
    holiday: Holiday | None = None


# --- Klimatizácia (Sinclair) ---------------------------------------------------

ClimateMode = Literal["auto", "cool", "heat", "fan", "dry"]
FanSpeed = Literal["auto", "1", "2", "3", "4", "5"]
SwingPosition = Literal["auto", "1", "2", "3", "4", "5"]


class ClimateCapabilities(BaseModel):
    """Čo jednotka podporuje. Konfiguruje sa v ``devices.config`` – predvolene konzervatívne."""

    modes: list[ClimateMode] = ["auto", "cool", "heat", "fan", "dry"]
    fan_speeds: int = Field(default=3, ge=0, le=5, description="0 = iba automatika")
    swing_positions: int = Field(default=0, ge=0, le=5, description="0 = nepodporované")
    quiet: bool = False
    eco: bool = False
    timer: bool = False
    min_temp: float = 16.0
    max_temp: float = 30.0
    temp_step: float = 0.5


class ClimateState(BaseModel):
    device_id: str
    name: str
    room: str | None
    power: bool
    mode: ClimateMode
    fan: FanSpeed
    swing: SwingPosition | None = None
    quiet: bool = False
    eco: bool = False
    target_temp: float
    current_temp: float | None
    timer_on_at: datetime | None = None
    timer_off_at: datetime | None = None
    capabilities: ClimateCapabilities


TimeOfDay = Annotated[str, Field(pattern=r"^(|([01]\d|2[0-3]):[0-5]\d)$")]


class ClimateCommand(BaseModel):
    power: bool | None = None
    mode: ClimateMode | None = None
    fan: FanSpeed | None = None
    swing: SwingPosition | None = None
    quiet: bool | None = None
    eco: bool | None = None
    target_temp: float | None = Field(default=None, ge=10, le=35)
    # "HH:MM" = najbližší taký čas (Europe/Bratislava), "" = zrušiť časovač
    timer_on: TimeOfDay | None = None
    timer_off: TimeOfDay | None = None


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
