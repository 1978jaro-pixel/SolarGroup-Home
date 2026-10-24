import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { AppProvider } from "../hooks/AppContext";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

function mockApi(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const path = String(input).split("?")[0];
      return path in routes ? json(routes[path]) : json({ detail: "x" }, 404);
    }),
  );
}

class FakeWS {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  close() {}
}

describe("App", () => {
  beforeEach(() => vi.stubGlobal("WebSocket", FakeWS));
  afterEach(() => vi.unstubAllGlobals());

  it("bez prihlásenia zobrazí prihlasovací formulár", async () => {
    mockApi({
      "/api/health": { status: "ok", mode: "demo" },
      "/api/auth/status": { setup_required: false, setup_allowed_here: true, user: null },
    });
    render(
      <MemoryRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Prihlásenie" })).toBeInTheDocument();
  });

  it("po prihlásení zobrazí Môj domov s označením DEMO", async () => {
    const ok = (data: unknown) => ({ status: "ok", source: "demo", updated_at: new Date().toISOString(), message: null, data });
    mockApi({
      "/api/health": { status: "ok", mode: "demo" },
      "/api/auth/status": { setup_required: false, setup_allowed_here: true, user: { username: "jaro", role: "admin" } },
      "/api/energy/snapshot": ok({
        pv_kw: 5, house_kw: 1, battery_kw: 2, battery_soc: 50, grid_kw: -2, ev_kw: 0, ev_connected: false,
        today_pv_kwh: 10, today_house_kwh: 5, today_grid_import_kwh: 1, today_grid_export_kwh: 3, self_sufficiency: 80,
      }),
      "/api/energy/history": ok([]),
      "/api/heating": [ok({ device_id: "h", name: "Kúrenie", current_temp: 20, target_temp: 21, mode: "auto", day_temp: 21, night_temp: 19, heating_active: true, water_temp: 50 })],
      "/api/climate": [],
      "/api/lights": [],
      "/api/blinds": [],
      "/api/cameras": [],
      "/api/weather": ok(null),
    });
    render(
      <MemoryRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Môj domov" })).toBeInTheDocument();
    // DEMO je jasne označené v hlavičke aj v spodnej lište
    expect(screen.getByText("simulované údaje", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText("DEMO").length).toBeGreaterThan(0);
    expect(await screen.findByRole("slider", { name: "Nastavená teplota kúrenia" })).toHaveAttribute("aria-valuenow", "21");
    // Hodnoty fotovoltiky z API (nie z obrázka návrhu)
    expect(await screen.findByText("Výroba")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    // Navigácia podľa návrhu
    for (const name of ["Domov", "Miestnosti", "Kamery", "Nastavenia"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("v LIVE režime pri nedostupných údajoch nezobrazí vymyslené hodnoty", async () => {
    mockApi({
      "/api/health": { status: "ok", mode: "live" },
      "/api/auth/status": { setup_required: false, setup_allowed_here: true, user: { username: "jaro", role: "admin" } },
      "/api/energy/snapshot": { status: "offline", source: "live", updated_at: null, message: "SolarGroup Dashboard neodpovedá", data: null },
      "/api/energy/history": { status: "offline", source: "live", updated_at: null, message: "neodpovedá", data: null },
      "/api/heating": [{ status: "unavailable", source: "live", updated_at: null, message: "Integrácia zatiaľ nie je implementovaná", data: null }],
      "/api/climate": [],
      "/api/lights": [],
      "/api/blinds": [],
      "/api/cameras": [],
      "/api/weather": { status: "unavailable", source: "live", updated_at: null, message: "vypnuté", data: null },
    });
    render(
      <MemoryRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: "Môj domov" })).toBeInTheDocument();
    expect(screen.queryByText("DEMO")).not.toBeInTheDocument();
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect((await screen.findAllByText(/OFFLINE/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("slider", { name: "Nastavená teplota kúrenia" })).not.toBeInTheDocument();
    // Fotovoltika bez údajov: iba pomlčky, žiadne čísla z obrázka návrhu
    expect(screen.queryByText(/15[,.]8/)).not.toBeInTheDocument();
    expect(screen.getAllByText("–").length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText("Bez merania")).toBeInTheDocument();
  });
});
