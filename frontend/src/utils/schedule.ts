import { DAYS, type DayKey, type HeatingLevel, type SwitchPoint, type WeeklyProgram } from "../api/types";

export const DAY_LABELS: Record<DayKey, string> = { mon: "Po", tue: "Ut", wed: "St", thu: "Št", fri: "Pi", sat: "So", sun: "Ne" };
export const DAY_NAMES: Record<DayKey, string> = {
  mon: "pondelok",
  tue: "utorok",
  wed: "streda",
  thu: "štvrtok",
  fri: "piatok",
  sat: "sobota",
  sun: "nedeľa",
};

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const fromMinutes = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const enabled = (pts: SwitchPoint[]) => pts.filter((p) => p.enabled).sort((a, b) => a.time.localeCompare(b.time));

/** Úroveň platná na začiatku dňa – posledný prepínací čas z predchádzajúcich dní (ako regulátor). */
export function levelAtDayStart(program: WeeklyProgram, day: DayKey): HeatingLevel {
  const idx = DAYS.indexOf(day);
  for (let back = 1; back <= 7; back++) {
    const pts = enabled(program[DAYS[(idx - back + 7) % 7]]);
    if (pts.length) return pts[pts.length - 1].level;
  }
  return "eco";
}

export interface Segment {
  from: number;
  to: number;
  level: HeatingLevel;
}

/** Úseky dňa pre 24-hodinovú časovú os. */
export function daySegments(program: WeeklyProgram, day: DayKey): Segment[] {
  const out: Segment[] = [];
  let level = levelAtDayStart(program, day);
  let from = 0;
  for (const p of enabled(program[day])) {
    const t = toMinutes(p.time);
    if (t > from) out.push({ from, to: t, level });
    from = t;
    level = p.level;
  }
  if (from < 1440) out.push({ from, to: 1440, level });
  // zlúčenie susedných úsekov s rovnakou úrovňou
  return out.reduce<Segment[]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.level === s.level) last.to = s.to;
    else acc.push({ ...s });
    return acc;
  }, []);
}

/** Chyba v programe dňa (duplicitné časy, príliš veľa bodov) alebo null. */
export function dayError(points: SwitchPoint[], max = 6): string | null {
  if (points.length > max) return `Najviac ${max} prepínacích časov denne`;
  const times = points.map((p) => p.time);
  if (new Set(times).size !== times.length) return "Prepínacie časy sa nesmú opakovať";
  return null;
}

export const sortPoints = (pts: SwitchPoint[]) => [...pts].sort((a, b) => a.time.localeCompare(b.time));

export const cloneProgram = (p: WeeklyProgram): WeeklyProgram =>
  Object.fromEntries(DAYS.map((d) => [d, p[d].map((x) => ({ ...x }))])) as WeeklyProgram;

export function copyDay(program: WeeklyProgram, from: DayKey, to: readonly DayKey[]): WeeklyProgram {
  const next = cloneProgram(program);
  for (const d of to) next[d] = program[from].map((x) => ({ ...x }));
  return next;
}

export const WORKDAYS = DAYS.slice(0, 5);
export const WEEKEND = DAYS.slice(5);

/** Kľúč dňa podľa dátumu v časovom pásme domácnosti. */
export function dayKeyOf(date: Date, timeZone = "Europe/Bratislava"): DayKey {
  const wd = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone }).format(date).toLowerCase().slice(0, 3);
  return (DAYS as readonly string[]).includes(wd) ? (wd as DayKey) : "mon";
}

/** Minúty od polnoci v časovom pásme domácnosti. */
export function minutesOf(date: Date, timeZone = "Europe/Bratislava"): number {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** „dnes 22:00“, „zajtra 06:00“, „po 06:00“ – v časovom pásme domácnosti. */
export function formatSwitch(iso: string, now = new Date(), timeZone = "Europe/Bratislava"): string {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit", timeZone }).format(d);
  const dayOf = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(x);
  const today = dayOf(now);
  const tomorrow = dayOf(new Date(now.getTime() + 86400000));
  if (dayOf(d) === today) return `dnes ${time}`;
  if (dayOf(d) === tomorrow) return `zajtra ${time}`;
  return `${DAY_LABELS[dayKeyOf(d, timeZone)].toLowerCase()} ${time}`;
}
