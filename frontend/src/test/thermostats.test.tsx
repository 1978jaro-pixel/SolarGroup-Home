import { fireEvent, render, screen } from "@testing-library/react";
import type { ClimateState, HeatingState } from "../api/types";
import { ModeTiles, Thermostat } from "../components/Thermostat";
import { climateAccent, climateLabel, diffCommand, modeTiles } from "../pages/Climate";
import { heatingAccent, heatingStatus, HEATING_MODE_TILES } from "../pages/Heating";

const ac: ClimateState = {
  device_id: "ac",
  name: "Klimatizácia",
  room: "Obývačka",
  power: true,
  mode: "cool",
  fan: "auto",
  swing: "auto",
  quiet: false,
  eco: false,
  target_temp: 24,
  current_temp: 25,
  timer_on_at: "2026-10-27T06:30:00+01:00",
  timer_off_at: null,
  capabilities: { modes: ["auto", "cool", "heat", "fan", "dry"], fan_speeds: 5, swing_positions: 5, quiet: true, eco: true, timer: true, min_temp: 16, max_temp: 30, temp_step: 0.5 },
};

const heat: HeatingState = {
  device_id: "h",
  name: "Kúrenie",
  circuit: 1,
  current_temp: 20.5,
  target_temp: 22,
  mode: "auto",
  active_level: "comfort",
  comfort_temp: 22,
  eco_temp: 19,
  manual_temp: 21,
  temporary_until: null,
  holiday: null,
  holiday_active: false,
  active_program: 1,
  next_switch: { at: new Date(Date.now() + 3600_000).toISOString(), level: "eco", temp: 19 },
  heating_active: true,
  water_temp: 45,
  min_temp: 5,
  max_temp: 28,
};

describe("spoločný regulátor", () => {
  it("má farbu podľa režimu a vráti hodnotu po neúspešnom príkaze", () => {
    const onCommit = vi.fn();
    const { container, rerender } = render(<Thermostat value={22} current={20.5} min={5} max={28} accent="heat" icon="flame" modeLabel="Auto" label="Teplota" onCommit={onCommit} />);
    expect(container.querySelector(".thermo--heat")).not.toBeNull();
    expect(screen.getByText("Aktuálna 20,5 °C")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zvýšiť teplotu" }));
    expect(onCommit).toHaveBeenLastCalledWith(22.5);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "22.5");
    // server príkaz nepotvrdil → resetKey vráti potvrdenú hodnotu
    rerender(<Thermostat value={22} min={5} max={28} accent="heat" label="Teplota" resetKey={1} onCommit={onCommit} />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "22");
  });

  it("počas odosielania zobrazí, že príkaz ešte nie je potvrdený", () => {
    render(<Thermostat value={22} min={5} max={28} accent="cool" modeLabel="Chladenie" label="Teplota" pending />);
    expect(screen.getByText("Odosiela sa…")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toHaveAttribute("aria-busy", "true");
  });

  it("dlaždice režimov hlásia zmenu", () => {
    const onChange = vi.fn();
    render(<ModeTiles label="Režim" value="auto" options={HEATING_MODE_TILES} onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "ECO" }));
    expect(onChange).toHaveBeenCalledWith("eco");
  });
});

describe("klimatizácia", () => {
  it("farba: chladenie modrá, kúrenie oranžová, ECO zelená, vypnutá sivá", () => {
    expect(climateAccent(ac)).toBe("cool");
    expect(climateAccent({ ...ac, mode: "heat" })).toBe("heat");
    expect(climateAccent({ ...ac, eco: true })).toBe("eco");
    expect(climateAccent({ ...ac, power: false })).toBe("off");
    expect(climateLabel({ ...ac, quiet: true })).toBe("Chladenie · Tichý");
  });

  it("zobrazí iba podporované režimy", () => {
    const tiles = modeTiles({ ...ac.capabilities, modes: ["cool", "fan"] });
    expect(tiles.map((t) => t.value)).toEqual(["cool", "fan"]);
  });

  it("odošle iba zmenené položky a zrušenie časovača", () => {
    const base = { power: true, mode: "cool" as const, fan: "auto" as const, swing: "auto" as const, quiet: false, eco: false, target: 24 };
    expect(diffCommand(ac, { ...base, timerOn: "06:30", timerOnEnabled: true, timerOff: "22:00", timerOffEnabled: false })).toEqual({});
    expect(diffCommand(ac, { ...base, mode: "heat", target: 23.5, fan: "3", timerOn: "06:30", timerOnEnabled: false, timerOff: "22:15", timerOffEnabled: true })).toEqual({
      mode: "heat",
      target_temp: 23.5,
      fan: "3",
      timer_on: "",
      timer_off: "22:15",
    });
  });
});

describe("kúrenie", () => {
  it("rozlišuje komfort, útlm, ECO a dovolenku", () => {
    expect(heatingAccent(heat)).toBe("heat");
    expect(heatingAccent({ ...heat, active_level: "eco", target_temp: 19 })).toBe("setback");
    expect(heatingAccent({ ...heat, mode: "eco" })).toBe("eco");
    expect(heatingAccent({ ...heat, mode: "holiday", holiday_active: true })).toBe("setback");
  });

  it("jasne povie, čo platí a kedy príde ďalšia zmena", () => {
    expect(heatingStatus(heat)).toMatch(/^Program 1 · teraz Komfort 22,0 °C · ďalšia zmena (dnes|zajtra) \d\d:\d\d → Útlm 19,0 °C$/);
    expect(heatingStatus({ ...heat, mode: "manual", target_temp: 20.5 })).toBe("Manuál · trvalo 20,5 °C");
  });
});

describe("detailné okno", () => {
  it("prekreslenie rodiča neukradne fokus a Esc okno zatvorí", async () => {
    const { Modal } = await import("../components/Modal");
    const onClose = vi.fn();
    const ui = (n: number) => (
      <Modal title="Test" onClose={() => onClose(n)}>
        <input aria-label="pole" />
      </Modal>
    );
    const { rerender } = render(ui(1));
    const input = screen.getByLabelText("pole");
    input.focus();
    rerender(ui(2));
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledWith(2);
  });
});
