import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CalendarEvent } from "../api/types";
import { CalendarCard, CalendarPage, eventsOn } from "../pages/Calendar";
import { easterSunday, holidayOn, holidaysOf, ymd } from "../utils/holidays";

const today = new Date();
const T = ymd(today);
const EV = (p: Partial<CalendarEvent>): CalendarEvent => ({
  source_id: "s1",
  cal_id: "c1",
  uid: "u1",
  title: "Servis auta",
  location: "",
  start: `${T}T23:58:00+01:00`,
  end: `${T}T23:59:00+01:00`,
  all_day: false,
  color: "#1f7bff",
  calendar: "Jaro",
  ...p,
});

let events: { events: CalendarEvent[]; sources: number; synced_at: string | null; stale: boolean };
let calls: { method: string; path: string; body?: unknown }[] = [];

beforeEach(() => {
  calls = [];
  events = { events: [EV({})], sources: 1, synced_at: new Date().toISOString(), stale: false };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      let body: unknown = { ok: true };
      if (path.startsWith("/api/calendar/events")) body = events;
      if (path === "/api/calendar/status")
        body = {
          google_configured: false,
          google_login_host: "http://127.0.0.1:8080",
          sync_minutes: 10,
          sources: [{ id: "s1", kind: "ical", name: "Rodina", account: "", enabled: true, last_sync: null, last_ok: null, last_error: "", calendars: [] }],
        };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Slovenské sviatky", () => {
  it("Veľká noc a pohyblivé sviatky", () => {
    expect(ymd(easterSunday(2025))).toBe("2025-04-20");
    expect(ymd(easterSunday(2026))).toBe("2026-04-05");
    const h = holidaysOf(2026);
    expect(h.get("2026-04-03")?.name).toBe("Veľký piatok");
    expect(h.get("2026-04-06")?.name).toBe("Veľkonočný pondelok");
    expect(holidayOn(new Date(2026, 7, 29))?.name).toMatch(/povstania/);
    expect(holidayOn(new Date(2026, 7, 28))).toBeUndefined();
  });

  it("celodenná udalosť nepresahuje do nasledujúceho dňa", () => {
    const e = EV({ all_day: true, start: "2026-05-04", end: "2026-05-05" });
    expect(eventsOn([e], new Date(2026, 4, 4))).toHaveLength(1);
    expect(eventsOn([e], new Date(2026, 4, 5))).toHaveLength(0);
  });
});

describe("Kalendár", () => {
  it("karta ukáže dátum, meniny a najbližšiu udalosť", async () => {
    render(
      <MemoryRouter>
        <CalendarCard />
      </MemoryRouter>,
    );
    expect(screen.getByText(String(today.getDate()))).toBeInTheDocument();
    expect(screen.getByText(/Meniny|meniny nikto/)).toBeInTheDocument();
    expect(await screen.findByText(/Servis auta/)).toBeInTheDocument();
  });

  it("bez internetu: ostanú posledné udalosti s označením nesynchronizované", async () => {
    events = { ...events, stale: true };
    render(
      <MemoryRouter>
        <CalendarCard />
      </MemoryRouter>,
    );
    expect(await screen.findByText("nesynchronizované")).toBeInTheDocument();
    expect(screen.getByText(/Servis auta/)).toBeInTheDocument();
  });

  it("detail: zobrazenia, zdroje a pridanie iCal adresy", async () => {
    render(
      <MemoryRouter initialEntries={["/kalendar?google=ok"]}>
        <CalendarPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Servis auta")).toBeInTheDocument();
    expect(screen.getByText("Google Kalendár je prepojený.")).toBeInTheDocument();
    expect(await screen.findByText("Rodina")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pripojiť Google Kalendár/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Mesiac" }));
    expect(await screen.findByRole("grid")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/basic\.ics/), { target: { value: "https://calendar.google.com/x/basic.ics" } });
    fireEvent.click(screen.getByRole("button", { name: /Pridať iCal kalendár/ }));
    await waitFor(() => expect(calls).toContainEqual({ method: "POST", path: "/api/calendar/ical", body: { name: "Môj kalendár", url: "https://calendar.google.com/x/basic.ics" } }));
  });
});
