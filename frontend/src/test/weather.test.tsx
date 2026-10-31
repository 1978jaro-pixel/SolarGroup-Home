import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Reading, Weather, WeatherHour } from "../api/types";
import { wmo } from "../components/WxIcon";
import { dewPoint, dirName, hourKey, uvLabel, WeatherCard, WeatherDayPage, WeatherPage } from "../pages/Weather";

const NOW = hourKey();
const TODAY = NOW.slice(0, 10);
const plus = (n: number) => {
  const d = new Date(`${TODAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function hours(): WeatherHour[] {
  const out: WeatherHour[] = [];
  for (let d = 0; d < 7; d++)
    for (let h = 0; h < 24; h++)
      out.push({ time: `${plus(d)}T${String(h).padStart(2, "0")}:00`, temp: 5 + h / 4, code: d === 1 ? 61 : 2, precip_prob: d === 1 ? 70 : 10, precip_mm: d === 1 ? 0.5 : 0, wind_kmh: 14, wind_dir: 225, gust_kmh: 30, is_day: h >= 7 && h <= 16 });
  return out;
}

const WEATHER: Weather = {
  location: "Žilina",
  temp: 9.2,
  feels_like: 7,
  humidity: 78,
  wind_kmh: 14,
  wind_dir: 225,
  gust_kmh: 32,
  visibility_m: 18000,
  uv: 1,
  precip_mm: 0,
  is_day: true,
  code: 3,
  daily: Array.from({ length: 7 }, (_, i) => ({
    date: plus(i),
    temp_min: 3 + i,
    temp_max: 9 + i,
    code: i === 1 ? 61 : 2,
    sunrise: `${plus(i)}T06:40`,
    sunset: `${plus(i)}T16:29`,
    uv_max: 1,
    precip_mm: i === 1 ? 6.9 : 0,
    precip_prob: i === 1 ? 80 : 10,
    wind_max_kmh: 22,
    gust_max_kmh: 45,
    wind_dir: 300,
  })),
  hourly: hours(),
};

let reading: Reading<Weather>;
function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      const body = path.startsWith("/api/weather") ? reading : { detail: "x" };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
    }),
  );
}

beforeEach(() => {
  reading = { status: "ok", source: "live", updated_at: new Date().toISOString(), message: null, data: WEATHER };
  mockFetch();
});
afterEach(() => vi.unstubAllGlobals());

describe("pomocné funkcie počasia", () => {
  it("WMO kódy, smer vetra, UV, rosný bod, kľúč hodiny", () => {
    expect(wmo(0).kind).toBe("sun");
    expect(wmo(0, false).kind).toBe("moon");
    expect(wmo(3).label).toBe("Zamračené");
    expect(wmo(63).sky).toBe("dazd");
    expect(wmo(75).kind).toBe("snow");
    expect(wmo(95).kind).toBe("storm");
    expect(dirName(225)).toBe("JZ");
    expect(dirName(0)).toBe("S");
    expect(dirName(359)).toBe("S");
    expect(uvLabel(1)).toBe("nízky");
    expect(uvLabel(7)).toBe("vysoký");
    expect(Math.round(dewPoint(9, 78)!)).toBe(5);
    expect(dewPoint(null, 50)).toBeNull();
    expect(NOW).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/);
  });
});

describe("karta Počasie", () => {
  it("svetlá obloha podľa počasia, teplota, opis, 4 dni a odkaz na detail", async () => {
    render(
      <MemoryRouter>
        <WeatherCard />
      </MemoryRouter>,
    );
    await screen.findByText("Zamračené");
    expect(document.querySelector(".wc-t")?.textContent).toBe("9°");
    const link = screen.getByRole("link", { name: /Počasie Žilina/ });
    expect(link).toHaveAttribute("href", "/pocasie");
    expect(screen.getByText("Zamračené")).toBeInTheDocument();
    expect(link.querySelectorAll(".wc-day")).toHaveLength(4);
    expect(link.querySelector("img.wc-sky")?.getAttribute("src")).toContain("sky-zamracene");
    expect(link.querySelector(".expand, [aria-label='Zväčšiť']")).toBeNull(); // bez ikony dvoch šípok
  });

  it("bez internetu: posledná predpoveď s označením, nie ako aktuálna", async () => {
    reading = { status: "offline", source: "live", updated_at: new Date().toISOString(), message: "Služba počasia neodpovedá", data: WEATHER };
    render(
      <MemoryRouter>
        <WeatherCard />
      </MemoryRouter>,
    );
    await screen.findByText("Zamračené");
    expect(document.querySelector(".wc-t")?.textContent).toBe("9°");
    expect(document.querySelector(".wc-badge")).not.toBeNull();
  });
});

describe("stránky počasia", () => {
  it("hlavná stránka: 7 klikateľných dní, dlaždice, radar iba ako odkaz", async () => {
    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>,
    );
    await screen.findByText("Nasledujúcich 24 hodín");
    const days = document.querySelectorAll("a.wx-day");
    expect(days).toHaveLength(7);
    expect(days[1].getAttribute("href")).toBe(`/pocasie/den/${plus(1)}`);
    expect(screen.getByText("Dnes")).toBeInTheDocument();
    expect(screen.getByText("Rosný bod 6°")).toBeInTheDocument(); // 9,2 °C a 78 % → 5,5 °C
    expect(screen.getByText(/Nárazy/)).toBeInTheDocument();
    expect(screen.getByText("↑ 06:40")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Radar zrážok/ })).toHaveAttribute("href", "/pocasie/radar");
    expect(document.querySelector(".leaflet-container")).toBeNull();
    expect(screen.getByText(/Open-Meteo/)).toBeInTheDocument();
  });

  it("offline bez údajov: OFFLINE, žiadne vymyslené hodnoty", async () => {
    reading = { status: "offline", source: "live", updated_at: null, message: "Služba počasia neodpovedá (bez internetu?)", data: null };
    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("OFFLINE")).toBeInTheDocument();
    expect(document.querySelectorAll(".wx-day")).toHaveLength(0);
  });

  it("detail dňa: 24 hodín, zrážky a vietor, prepínanie dní", async () => {
    render(
      <MemoryRouter initialEntries={[`/pocasie/den/${plus(1)}`]}>
        <Routes>
          <Route path="/pocasie/den/:date" element={<WeatherDayPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("Po hodinách");
    expect(document.querySelectorAll(".wx-col")).toHaveLength(24);
    expect(screen.getByText("6,9 mm · 80 %")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Späť: Počasie" })).toHaveAttribute("href", "/pocasie");
    const chips = document.querySelectorAll(".wx-chip");
    expect(chips).toHaveLength(7);
    expect(chips[1]).toHaveAttribute("aria-current", "page");
  });
});

describe("radar", () => {
  it("načíta snímky, prehrávanie sa dá zastaviť, pri odchode sa zastaví a mapa uvoľní", async () => {
    const t0 = Math.floor(Date.now() / 1000) - 3600;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const path = String(input);
        const body = path === "/api/weather/radar/frames" ? { frames: [0, 1, 2].map((i) => ({ time: t0 + i * 600, kind: "past" })), max_zoom: 7, color: 2, attribution: "Radar: RainViewer" } : {};
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
      }),
    );
    const { WeatherRadarPage } = await import("../pages/WeatherRadar");
    const clear = vi.spyOn(window, "clearInterval");
    const { unmount } = render(
      <MemoryRouter>
        <WeatherRadarPage />
      </MemoryRouter>,
    );
    expect(document.querySelector(".leaflet-container")).not.toBeNull();
    const play = await screen.findByRole("button", { name: "Prehrať animáciu" });
    await waitFor(() => expect(play).not.toBeDisabled());
    expect(screen.getByText(/RainViewer/)).toBeInTheDocument();
    act(() => fireEvent.click(play));
    expect(screen.getByRole("button", { name: "Zastaviť animáciu" })).toBeInTheDocument();
    const before = clear.mock.calls.length;
    unmount();
    expect(clear.mock.calls.length).toBeGreaterThan(before); // časovače prehrávania aj obnovy zrušené
    expect(document.querySelector(".leaflet-container")).toBeNull();
  });
});
