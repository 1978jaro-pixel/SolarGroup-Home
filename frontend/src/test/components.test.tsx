import { fireEvent, render, screen } from "@testing-library/react";
import { Thermostat } from "../components/Thermostat";
import { StatusBadge } from "../components/ui";

describe("Thermostat", () => {
  it("mení teplotu klávesnicou a tlačidlami a hlási ju cez onCommit", () => {
    const onCommit = vi.fn();
    render(<Thermostat value={21} current={20.4} min={5} max={28} accent="heat" label="Teplota" onCommit={onCommit} />);
    const slider = screen.getByRole("slider", { name: "Teplota" });
    expect(slider).toHaveAttribute("aria-valuenow", "21");
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    expect(onCommit).toHaveBeenLastCalledWith(21.5);
    fireEvent.click(screen.getByRole("button", { name: "Znížiť teplotu" }));
    expect(onCommit).toHaveBeenLastCalledWith(21);
  });

  it("nedovolí prekročiť rozsah", () => {
    const onCommit = vi.fn();
    render(<Thermostat value={30} min={5} max={30} accent="cool" label="Teplota" onCommit={onCommit} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowUp" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Zvýšiť teplotu" })).toBeDisabled();
  });

  it("v zakázanom stave nereaguje", () => {
    const onCommit = vi.fn();
    render(<Thermostat value={21} min={5} max={28} accent="off" label="Teplota" disabled onCommit={onCommit} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowUp" });
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("StatusBadge", () => {
  it("jasne označí DEMO údaje", () => {
    render(<StatusBadge reading={{ status: "ok", source: "demo", updated_at: null, message: null }} />);
    expect(screen.getByText("DEMO")).toBeInTheDocument();
  });

  it("v LIVE režime s čerstvými údajmi nič nezobrazí", () => {
    const { container } = render(<StatusBadge reading={{ status: "ok", source: "live", updated_at: new Date().toISOString(), message: null }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("zobrazí OFFLINE s časom poslednej aktualizácie", () => {
    render(<StatusBadge reading={{ status: "offline", source: "live", updated_at: new Date().toISOString(), message: "neodpovedá" }} />);
    expect(screen.getByText(/OFFLINE/)).toBeInTheDocument();
    expect(screen.getByText(/posledné dnes/)).toBeInTheDocument();
  });

  it("zobrazí čas pri zastaraných údajoch", () => {
    render(<StatusBadge reading={{ status: "stale", source: "live", updated_at: new Date().toISOString(), message: null }} />);
    expect(screen.getByText(/Aktualizované dnes/)).toBeInTheDocument();
  });
});
