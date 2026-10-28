import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EnergySnapshot } from "../api/types";
import { flowDuration, panelGlow, PvScene } from "../components/HouseScene";
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


const ok = (d: EnergySnapshot) => ({ status: "ok" as const, source: "demo" as const, updated_at: "2026-10-28T10:00:00Z", message: null, data: d });

describe("PvScene – dom, vrstvy a hodnoty", () => {
  it("bez údajov: žiadne toky, panely nesvietia, hodnoty „–“", () => {
    const { container } = render(<PvScene reading={null} />);
    expect(container.querySelectorAll("[data-flow]")).toHaveLength(0);
    expect(container.querySelector(".pvs-glow")?.getAttribute("data-glow")).toBe("0.00");
    expect(container.querySelectorAll(".pvs-lab")).toHaveLength(5);
    expect(container.querySelector('[data-label="pv"] .pvs-val')?.textContent).toBe("–");
    expect(container.querySelector(".pvs-img")?.getAttribute("srcset")).toContain("1536w");
  });

  it("OFFLINE: staré hodnoty sa nezobrazia a toky sú vypnuté", () => {
    const r = { ...ok(snap({ pv_kw: 5, house_kw: 2 })), status: "offline" as const, message: "Bez spojenia" };
    const { container, getByRole } = render(<PvScene reading={r} />);
    expect(getByRole("status").textContent).toContain("OFFLINE");
    expect(container.querySelector('[data-label="pv"] .pvs-val')?.textContent).toBe("–");
    expect(container.querySelectorAll("[data-flow]")).toHaveLength(0);
  });

  it("smer toku podľa znamienka, nulový výkon = neaktívny tok", () => {
    const { container } = render(<PvScene reading={ok(snap({ pv_kw: 3, house_kw: 1.2, battery_kw: -0.8, grid_kw: -1.5, ev_kw: 0 }))} />);
    const f = (id: string) => container.querySelector(`[data-flow="${id}"]`);
    expect(f("pv")?.classList).not.toContain("is-reverse");
    expect(f("battery")?.classList).toContain("is-reverse"); // vybíjanie
    expect(f("grid")?.classList).toContain("is-reverse"); // dodávka
    expect(f("ev")).toBeNull();
    expect(container.querySelector('[data-label="battery"]')?.textContent).toContain("vybíja");
    expect(container.querySelector('[data-label="grid"]')?.textContent).toContain("dodávka");
    expect(container.querySelector('[data-label="pv"] .pvs-val')?.textContent).toBe("3,0 kW");
  });

  it("zanedbateľný výkon sa nezobrazí ako tok; jas panelov podľa výroby", () => {
    const { container } = render(<PvScene reading={ok(snap({ house_kw: 0.02 }))} />);
    expect(container.querySelector('[data-flow="house"]')).toBeNull();
    expect(panelGlow(0)).toBe(0);
    expect(panelGlow(2)).toBeGreaterThan(panelGlow(0.5));
    expect(panelGlow(50)).toBe(1);
  });

  it("väčší výkon = rýchlejší pohyb svetla", () => {
    expect(flowDuration(0.1)).toBeGreaterThan(flowDuration(8));
    expect(flowDuration(1000)).toBe(1.2);
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
