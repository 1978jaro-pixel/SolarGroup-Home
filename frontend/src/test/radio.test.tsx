import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { RadioStation } from "../api/types";
import { RadioCard, RadioPage } from "../pages/Radio";
import { codecSupported, RadioProvider } from "../radio/RadioProvider";

const APP = { user: { username: "jaro", role: "admin" } };
vi.mock("../hooks/AppContext", () => ({ useApp: () => APP }));

const ST = (p: Partial<RadioStation>): RadioStation => ({
  id: "sk-expres",
  name: "Rádio Expres",
  url: "https://stream.example.com/expres.mp3",
  homepage: "",
  favicon: "",
  countrycode: "SK",
  tags: [],
  codec: "MP3",
  bitrate: 128,
  source: "preset",
  favorite: true,
  status: "ok",
  status_detail: "",
  checked_at: null,
  logo: null,
  ...p,
});

const STATIONS = [ST({}), ST({ id: "sk-fun", name: "Fun rádio", url: "https://stream.example.com/fun.mp3", favorite: false }), ST({ id: "c-hls", name: "HLS rádio", url: "https://x.sk/a.m3u8", codec: "HLS", source: "custom", status: "unsupported" })];

let calls: { method: string; path: string; body?: unknown }[] = [];
const playSpy = vi.fn(() => Promise.resolve());
const pauseSpy = vi.fn();

beforeEach(() => {
  calls = [];
  playSpy.mockClear();
  pauseSpy.mockClear();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(playSpy);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pauseSpy);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockImplementation((t: string) => (t.includes("mpeg") ? "probably" : ""));
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const body = path === "/api/radio/stations" ? STATIONS : path === "/api/radio/state" ? { station_id: "sk-expres", volume: 0.4 } : { ok: true };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Shell() {
  return (
    <RadioProvider>
      <nav>
        <Link to="/">domov</Link>
        <Link to="/ina">ina</Link>
      </nav>
      <Routes>
        <Route path="/" element={<RadioCard />} />
        <Route path="/ina" element={<p>Iná obrazovka</p>} />
        <Route path="/hudba" element={<RadioPage />} />
      </Routes>
    </RadioProvider>
  );
}

describe("Internetové rádio", () => {
  it("po štarte obnoví poslednú stanicu a hlasitosť, ale nespustí prehrávanie", async () => {
    render(
      <MemoryRouter>
        <Shell />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Rádio Expres")).toBeInTheDocument();
    expect((screen.getByLabelText("Hlasitosť") as HTMLInputElement).value).toBe("40");
    expect(playSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Pripravené – ťuknite na Prehrať")).toBeInTheDocument();
  });

  it("Prehrať spustí stream, rádio hrá ďalej pri prepnutí obrazovky", async () => {
    render(
      <MemoryRouter>
        <Shell />
      </MemoryRouter>,
    );
    await screen.findByText("Rádio Expres");
    fireEvent.click(screen.getByRole("button", { name: "Prehrať" }));
    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(1));
    const audio = playSpy.mock.contexts[0] as unknown as HTMLAudioElement;
    expect(audio.src).toBe("https://stream.example.com/expres.mp3");
    act(() => {
      audio.dispatchEvent(new Event("playing"));
    });
    expect(screen.getByText("Hrá")).toBeInTheDocument();
    // prepnutie obrazovky – prehrávač ostáva (žiadne pause, ten istý prvok)
    fireEvent.click(screen.getByText("ina"));
    expect(screen.getByText("Iná obrazovka")).toBeInTheDocument();
    expect(pauseSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("domov"));
    expect(screen.getByText("Hrá")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pozastaviť" })).toBeInTheDocument();
  });

  it("hlasitosť sa uloží (posledná stanica a hlasitosť prežijú reštart)", async () => {
    render(
      <MemoryRouter>
        <Shell />
      </MemoryRouter>,
    );
    await screen.findByText("Rádio Expres");
    fireEvent.change(screen.getByLabelText("Hlasitosť"), { target: { value: "75" } });
    await waitFor(
      () => expect(calls.filter((c) => c.method === "PUT" && c.path === "/api/radio/state").map((c) => c.body)).toContainEqual({ station_id: "sk-expres", volume: 0.75 }),
      { timeout: 2000 },
    );
  });

  it("nepodporovaný formát (HLS) sa nespustí a stanica je označená", async () => {
    render(
      <MemoryRouter initialEntries={["/hudba"]}>
        <Shell />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("radio", { name: /Obľúbené/ }));
    expect(await screen.findByText("Nepodporovaný formát")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prehrať HLS rádio" })).toBeDisabled();
    expect(codecSupported("HLS", { canPlayType: () => "probably" })).toBe(false);
    expect(codecSupported("MP3", { canPlayType: () => "" })).toBe(false);
    expect(codecSupported("NEZNAMY", { canPlayType: () => "" })).toBeNull();
  });

  it("hviezdička pridá stanicu medzi obľúbené", async () => {
    render(
      <MemoryRouter initialEntries={["/hudba"]}>
        <Shell />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("radio", { name: "Slovenské" }));
    fireEvent.click(await screen.findByRole("button", { name: "Pridať Fun rádio medzi obľúbené" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.path === "/api/radio/stations/sk-fun")).toBe(true));
  });
});
