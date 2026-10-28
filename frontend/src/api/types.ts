export type ReadingStatus = "ok" | "stale" | "offline" | "unavailable";
export type Source = "demo" | "live";

export interface Reading<T> {
  status: ReadingStatus;
  source: Source;
  updated_at: string | null;
  message: string | null;
  data: T | null;
}

export interface EnergySnapshot {
  pv_kw: number;
  house_kw: number;
  battery_kw: number;
  battery_soc: number;
  grid_kw: number;
  ev_kw: number;
  ev_connected: boolean;
  today_pv_kwh: number;
  today_house_kwh: number;
  today_grid_import_kwh: number;
  today_grid_export_kwh: number;
  self_sufficiency: number;
}

export interface EnergySample {
  ts: string;
  pv_kw: number;
  house_kw: number;
  battery_kw: number;
  grid_kw: number;
  battery_soc: number;
}

export type HeatingMode = "auto" | "manual" | "temporary" | "eco" | "holiday";
export type HeatingLevel = "comfort" | "eco";
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAYS)[number];
export const MAX_SWITCH_POINTS = 6;

export interface SwitchPoint {
  time: string;
  level: HeatingLevel;
  enabled: boolean;
}
export type WeeklyProgram = Record<DayKey, SwitchPoint[]>;

export interface HeatingSchedule {
  device_id: string;
  active_program: 1 | 2;
  programs: Record<"1" | "2", WeeklyProgram>;
  timezone: string;
}

export interface Holiday {
  start: string;
  end: string;
  temp: number;
}

export interface HeatingState {
  device_id: string;
  name: string;
  circuit: number;
  current_temp: number | null;
  target_temp: number;
  mode: HeatingMode;
  active_level: HeatingLevel | null;
  comfort_temp: number;
  eco_temp: number;
  manual_temp: number;
  temporary_until: string | null;
  holiday: Holiday | null;
  holiday_active: boolean;
  active_program: 1 | 2;
  next_switch: { at: string; level: HeatingLevel; temp: number } | null;
  heating_active: boolean;
  water_temp: number | null;
  min_temp: number;
  max_temp: number;
}

export interface HeatingCommand {
  mode?: HeatingMode;
  target_temp?: number;
  comfort_temp?: number;
  eco_temp?: number;
  active_program?: 1 | 2;
  holiday?: Holiday;
}

export type ClimateMode = "auto" | "cool" | "heat" | "fan" | "dry";
export type FanSpeed = "auto" | "1" | "2" | "3" | "4" | "5";
export type SwingPosition = FanSpeed;

export interface ClimateCapabilities {
  modes: ClimateMode[];
  fan_speeds: number;
  swing_positions: number;
  quiet: boolean;
  eco: boolean;
  timer: boolean;
  min_temp: number;
  max_temp: number;
  temp_step: number;
}

export interface ClimateState {
  device_id: string;
  name: string;
  room: string | null;
  power: boolean;
  mode: ClimateMode;
  fan: FanSpeed;
  swing: SwingPosition | null;
  quiet: boolean;
  eco: boolean;
  target_temp: number;
  current_temp: number | null;
  timer_on_at: string | null;
  timer_off_at: string | null;
  capabilities: ClimateCapabilities;
}

export interface ClimateCommand {
  power?: boolean;
  mode?: ClimateMode;
  fan?: FanSpeed;
  swing?: SwingPosition;
  quiet?: boolean;
  eco?: boolean;
  target_temp?: number;
  /** "HH:MM" = najbližší taký čas, "" = zrušiť */
  timer_on?: string;
  timer_off?: string;
}

export interface LightState {
  device_id: string;
  name: string;
  room_id: string | null;
  room: string | null;
  on: boolean;
  brightness: number;
  dimmable: boolean;
}

export interface BlindState {
  device_id: string;
  name: string;
  room_id: string | null;
  room: string | null;
  position: number;
  moving: boolean;
}

export interface CameraInfo {
  device_id: string;
  name: string;
  model: string | null;
  stream_available: boolean;
  note: string;
}

export interface WeatherDay {
  date: string;
  temp_min: number;
  temp_max: number;
  code: number;
}

export interface Weather {
  location: string;
  temp: number;
  feels_like: number | null;
  humidity: number | null;
  wind_kmh: number | null;
  code: number;
  daily: WeatherDay[];
}

export interface Integration {
  id: string;
  name: string;
  status: ReadingStatus;
  message: string | null;
}

export interface SystemInfo {
  app: string;
  version: string;
  mode: Source;
  hostname: string;
  python: string;
  uptime_s: number;
  integrations: Integration[];
}

export interface User {
  username: string;
  role: string;
}

export interface AuthStatus {
  setup_required: boolean;
  setup_allowed_here: boolean;
  user: User | null;
}

// --- Internetové rádio -------------------------------------------------------------

export type StationStatus = "unknown" | "ok" | "unavailable" | "unsupported";

export interface RadioStation {
  id: string;
  name: string;
  url: string;
  homepage: string;
  favicon: string;
  countrycode: string;
  tags: string[];
  codec: string;
  bitrate: number;
  /** preset = slovenská predvoľba, catalog = z Radio Browser, custom = vlastná URL */
  source: "preset" | "catalog" | "custom";
  favorite: boolean;
  status: StationStatus;
  status_detail: string;
  checked_at: string | null;
  logo: string | null;
}

/** Výsledok vyhľadávania v katalógu (ešte neuložená stanica). */
export interface CatalogStation {
  id: string;
  name: string;
  url: string;
  homepage: string;
  favicon: string;
  countrycode: string;
  language: string;
  tags: string[];
  codec: string;
  bitrate: number;
  catalog_ok: boolean;
  logo: string | null;
}

export interface StreamCheck {
  status: Exclude<StationStatus, "unknown">;
  codec: string | null;
  url: string;
  detail: string;
}

export interface RadioState {
  station_id: string | null;
  volume: number;
}
