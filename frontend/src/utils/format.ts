const nf1 = new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 0 });

/** Teplota bez zbytočnej desatinnej nuly: 22 / 21,5 */
export function formatTempValue(t: number): string {
  return Number.isInteger(t) ? String(t) : nf1.format(t);
}

/** Výkon v kW – pod 1 kW zobrazí W. */
export function formatPower(kw: number): string {
  const abs = Math.abs(kw);
  if (abs < 1) return `${nf0.format(abs * 1000)} W`;
  return `${nf1.format(abs)} kW`;
}

export function formatSignedPower(kw: number): string {
  return `${kw <= -0.0005 ? "−" : ""}${formatPower(kw)}`;
}

export function formatKwh(kwh: number): string {
  return `${nf1.format(kwh)} kWh`;
}

export function formatTemp(t: number | null | undefined): string {
  return t == null ? "–" : `${nf1.format(t)} °C`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "neznámy čas";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? `dnes ${formatTime(iso)}`
    : d.toLocaleString("sk-SK", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function roundToStep(v: number, step: number): number {
  return Math.round(v / step) * step;
}

/** WMO kódy počasia (Open-Meteo) → slovenský popis a ikona. */
export function weatherInfo(code: number): { label: string; icon: "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm" } {
  if (code === 0) return { label: "Jasno", icon: "sun" };
  if (code <= 2) return { label: "Polojasno", icon: "partly" };
  if (code === 3) return { label: "Zamračené", icon: "cloud" };
  if (code <= 48) return { label: "Hmla", icon: "fog" };
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: "Dážď", icon: "rain" };
  if (code <= 77 || code === 85 || code === 86) return { label: "Sneženie", icon: "snow" };
  return { label: "Búrka", icon: "storm" };
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return "Dobrú noc";
  if (h < 10) return "Dobré ráno";
  if (h < 18) return "Dobrý deň";
  return "Dobrý večer";
}

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase("sk-SK") + s.slice(1);

/** Časti dátumu po slovensky: „Štvrtok“, 22, „októbra“. */
export function dateParts(d = new Date()): { weekday: string; day: number; month: string } {
  const parts = new Intl.DateTimeFormat("sk-SK", { weekday: "long", day: "numeric", month: "long" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: capitalize(get("weekday")), day: d.getDate(), month: get("month") };
}

export function weekdayName(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return capitalize(new Date(y, m - 1, d).toLocaleDateString("sk-SK", { weekday: "long" }));
}

/** Slovenské skloňovanie: 1 kamera, 2–4 kamery, 5+ kamier. */
export function plural(n: number, one: string, few: string, many: string): string {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}
