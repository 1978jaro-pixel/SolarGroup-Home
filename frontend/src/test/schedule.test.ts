import type { WeeklyProgram } from "../api/types";
import { copyDay, dayError, dayKeyOf, daySegments, formatSwitch, levelAtDayStart, minutesOf } from "../utils/schedule";

const P = (mon: WeeklyProgram["mon"], sun: WeeklyProgram["sun"] = []): WeeklyProgram => ({ mon, tue: [], wed: [], thu: [], fri: [], sat: [], sun });
const pt = (time: string, level: "comfort" | "eco", enabled = true) => ({ time, level, enabled });

describe("týždenný program", () => {
  it("rozdelí deň na úseky pre časovú os", () => {
    const prog = P([pt("06:00", "comfort"), pt("08:00", "eco"), pt("16:00", "comfort"), pt("22:00", "eco")]);
    expect(daySegments(prog, "mon")).toEqual([
      { from: 0, to: 360, level: "eco" },
      { from: 360, to: 480, level: "comfort" },
      { from: 480, to: 960, level: "eco" },
      { from: 960, to: 1320, level: "comfort" },
      { from: 1320, to: 1440, level: "eco" },
    ]);
  });

  it("začiatok dňa preberá poslednú úroveň z predchádzajúcich dní", () => {
    const prog = P([pt("06:00", "eco")], [pt("20:00", "comfort")]);
    expect(levelAtDayStart(prog, "mon")).toBe("comfort");
    expect(daySegments(prog, "tue")).toEqual([{ from: 0, to: 1440, level: "eco" }]);
  });

  it("vypnutý prepínací čas sa ignoruje", () => {
    const prog = P([pt("06:00", "comfort"), pt("08:00", "eco", false), pt("22:00", "eco")]);
    expect(daySegments(prog, "mon").map((s) => s.level)).toEqual(["eco", "comfort", "eco"]);
  });

  it("kopíruje deň na Po–Pi aj celý týždeň bez zdieľania referencií", () => {
    const prog = P([pt("05:30", "comfort")]);
    const out = copyDay(prog, "mon", ["tue", "wed", "thu", "fri"]);
    expect(out.fri).toEqual(prog.mon);
    out.fri[0].time = "07:00";
    expect(prog.mon[0].time).toBe("05:30");
    expect(out.sat).toEqual([]);
  });

  it("kontroluje limit 6 časov a duplicity", () => {
    expect(dayError([pt("06:00", "eco"), pt("06:00", "comfort")])).toMatch(/opakovať/);
    expect(dayError(Array.from({ length: 7 }, (_, i) => pt(`0${i}:00`, "eco")))).toMatch(/6/);
    expect(dayError([pt("06:00", "eco")])).toBeNull();
  });
});

describe("časové pásmo Europe/Bratislava", () => {
  it("správne prepočíta letný čas", () => {
    // 29. 3. 2026 01:30 UTC = 03:30 SELČ (deň prechodu na letný čas)
    const d = new Date("2026-03-29T01:30:00Z");
    expect(minutesOf(d)).toBe(3 * 60 + 30);
    expect(dayKeyOf(d)).toBe("sun");
    // 25. 10. 2026 05:00 UTC = 06:00 SEČ (po prechode na zimný čas)
    expect(minutesOf(new Date("2026-10-25T05:00:00Z"))).toBe(6 * 60);
  });

  it("formátuje ďalšiu zmenu ako dnes/zajtra", () => {
    const now = new Date("2026-10-26T10:00:00+01:00");
    expect(formatSwitch("2026-10-26T22:00:00+01:00", now)).toBe("dnes 22:00");
    expect(formatSwitch("2026-10-27T06:00:00+01:00", now)).toBe("zajtra 06:00");
    expect(formatSwitch("2026-10-28T06:00:00+01:00", now)).toBe("st 06:00");
  });
});
