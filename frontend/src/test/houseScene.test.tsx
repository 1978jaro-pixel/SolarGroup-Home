import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EnergySnapshot } from "../api/types";
import { flowDuration, HouseScene } from "../components/HouseScene";
import { getReduceMotion, setReduceMotion } from "../utils/display";

const snap = (p: Partial<EnergySnapshot>): EnergySnapshot => ({
  pv_kw: 0,
  house_kw: 0,
  battery_kw: 0,
  battery_soc: 50,
  grid_kw: 0,
  ev_kw: 0,
  ev_connected: false,
  today_pv_kwh: 0,
  today_house_kwh: 0,
  today_grid_import_kwh: 0,
  today_grid_export_kwh: 0,
  self_sufficiency: 0,
  ...p,
});

const flow = (c: HTMLElement, id: string) => c.querySelector(`[data-flow="${id}"]`)!;

describe("HouseScene – vrstva tokov energie", () => {
  it("bez údajov nie je žiadny tok aktívny (iba vedenia)", () => {
    const { container } = render(<HouseScene data={null} />);
    expect(container.querySelectorAll(".flow.is-active")).toHaveLength(0);
    expect(container.querySelectorAll(".flow__duct")).toHaveLength(5);
    expect(container.querySelector("img")?.getAttribute("srcset")).toContain("1651w");
  });

  it("smer toku zodpovedá znamienku výkonu", () => {
    const { container } = render(<HouseScene data={snap({ pv_kw: 3, house_kw: 1.2, battery_kw: -0.8, grid_kw: -1.5, ev_kw: 0 })} />);
    expect(flow(container, "pv").classList).toContain("is-active");
    expect(flow(container, "pv").classList).not.toContain("is-reverse");
    expect(flow(container, "battery").classList).toContain("is-reverse"); // vybíjanie
    expect(flow(container, "grid").classList).toContain("is-reverse"); // dodávka do siete
    expect(flow(container, "ev").classList).not.toContain("is-active");
  });

  it("zanedbateľný výkon sa nezobrazí ako tok", () => {
    const { container } = render(<HouseScene data={snap({ house_kw: 0.02 })} />);
    expect(flow(container, "house").classList).not.toContain("is-active");
  });

  it("väčší výkon = rýchlejší pohyb, v rozsahu 0,7–2,6 s", () => {
    expect(flowDuration(0.1)).toBeGreaterThan(flowDuration(5));
    expect(flowDuration(100)).toBe(0.7);
    expect(flowDuration(0.05)).toBeLessThanOrEqual(2.6);
  });
});

describe("Úsporné animácie", () => {
  it("prepínač nastaví triedu na <html> a uloží voľbu", () => {
    setReduceMotion(true);
    expect(getReduceMotion()).toBe(true);
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
    setReduceMotion(false);
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(false);
  });
});
