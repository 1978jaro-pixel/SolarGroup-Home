/**
 * Štátne sviatky a ďalšie sviatky (dni pracovného pokoja) v SR – zákon č. 241/1993 Z. z.
 * Zobrazujú sa iba názvy; či je deň voľný, závisí od aktuálneho znenia zákona (overiť pri zmene zákona).
 */

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  kind: "statny" | "sviatok";
}

const FIXED: [string, string, Holiday["kind"]][] = [
  ["01-01", "Deň vzniku Slovenskej republiky", "statny"],
  ["01-06", "Zjavenie Pána (Traja králi)", "sviatok"],
  ["05-01", "Sviatok práce", "sviatok"],
  ["05-08", "Deň víťazstva nad fašizmom", "sviatok"],
  ["07-05", "Sviatok svätého Cyrila a Metoda", "statny"],
  ["08-29", "Výročie Slovenského národného povstania", "statny"],
  ["09-01", "Deň Ústavy Slovenskej republiky", "statny"],
  ["09-15", "Sedembolestná Panna Mária", "sviatok"],
  ["11-01", "Sviatok Všetkých svätých", "sviatok"],
  ["11-17", "Deň boja za slobodu a demokraciu", "statny"],
  ["12-24", "Štedrý deň", "sviatok"],
  ["12-25", "Prvý sviatok vianočný", "sviatok"],
  ["12-26", "Druhý sviatok vianočný", "sviatok"],
];

/** Veľkonočná nedeľa (gregoriánsky kalendár, algoritmus Meeus/Jones/Butcher). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const cache = new Map<number, Map<string, Holiday>>();

export function holidaysOf(year: number): Map<string, Holiday> {
  let m = cache.get(year);
  if (m) return m;
  m = new Map();
  for (const [md, name, kind] of FIXED) m.set(`${year}-${md}`, { date: `${year}-${md}`, name, kind });
  const easter = easterSunday(year);
  const friday = new Date(easter);
  friday.setDate(easter.getDate() - 2);
  const monday = new Date(easter);
  monday.setDate(easter.getDate() + 1);
  m.set(ymd(friday), { date: ymd(friday), name: "Veľký piatok", kind: "sviatok" });
  m.set(ymd(monday), { date: ymd(monday), name: "Veľkonočný pondelok", kind: "sviatok" });
  cache.set(year, m);
  return m;
}

export function holidayOn(d: Date): Holiday | undefined {
  return holidaysOf(d.getFullYear()).get(ymd(d));
}
