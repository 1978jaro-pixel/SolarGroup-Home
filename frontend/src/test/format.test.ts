import { clamp, formatPower, formatSignedPower, roundToStep, weatherInfo } from "../utils/format";

describe("format", () => {
  it("formátuje výkon v W a kW", () => {
    expect(formatPower(0.38)).toBe("380 W");
    expect(formatPower(7.84).replace(/\s/g, " ")).toBe("7,8 kW");
    expect(formatPower(-2.5).replace(/\s/g, " ")).toBe("2,5 kW");
    expect(formatSignedPower(-2.5).replace(/\s/g, " ")).toBe("−2,5 kW");
  });

  it("zaokrúhľuje a ohraničuje", () => {
    expect(roundToStep(21.3, 0.5)).toBe(21.5);
    expect(clamp(40, 5, 30)).toBe(30);
  });

  it("mapuje WMO kódy počasia", () => {
    expect(weatherInfo(0).label).toBe("Jasno");
    expect(weatherInfo(63).icon).toBe("rain");
    expect(weatherInfo(95).icon).toBe("storm");
  });
});
