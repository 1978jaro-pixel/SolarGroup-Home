import { dateParts, plural } from "../utils/format";
import { MENINY, meninyFor } from "../utils/meniny";

describe("meniny a dátum", () => {
  it("pozná slovenské meniny", () => {
    expect(meninyFor(new Date(2026, 9, 22))).toBe("Sergej");
    expect(meninyFor(new Date(2026, 11, 24))).toBe("Adam, Eva");
    expect(meninyFor(new Date(2026, 0, 1))).toBeNull(); // Nový rok – bez mena
    expect(Object.keys(MENINY).length).toBeGreaterThan(350);
  });

  it("formátuje dátum ako v návrhu", () => {
    expect(dateParts(new Date(2026, 9, 22))).toEqual({ weekday: "Štvrtok", day: 22, month: "októbra" });
  });

  it("skloňuje počet kamier", () => {
    expect(plural(1, "kamera", "kamery", "kamier")).toBe("kamera");
    expect(plural(3, "kamera", "kamery", "kamier")).toBe("kamery");
    expect(plural(5, "kamera", "kamery", "kamier")).toBe("kamier");
  });
});
