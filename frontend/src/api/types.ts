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

export type HeatingMode = "auto" | "day" | "night" | "off";
export interface HeatingState {
  device_id: string;
  name: string;
  current_temp: number | null;
  target_temp: number;
  mode: HeatingMode;
  day_temp: number;
  night_temp: number;
  heating_active: boolean;
  water_temp: number | null;
}

export type ClimateMode = "auto" | "cool" | "heat" | "dry" | "fan";
export type FanSpeed = "auto" | "low" | "medium" | "high";
export interface ClimateState {
  device_id: string;
  name: string;
  room: string | null;
  power: boolean;
  mode: ClimateMode;
  fan: FanSpeed;
  target_temp: number;
  current_temp: number | null;
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
