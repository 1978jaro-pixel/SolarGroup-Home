import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "../api/client";
import type { CatalogStation, RadioState, RadioStation, StreamCheck } from "../api/types";
import { useApp } from "../hooks/AppContext";

/**
 * Internetové rádio pre celú aplikáciu: jeden prvok <audio> mimo stránok, takže hrá ďalej pri
 * prepínaní obrazoviek. Po štarte (aj po reštarte Raspberry Pi) sa NIČ nespúšťa samo – iba sa
 * obnoví posledná stanica a hlasitosť; prehrávanie začne až ťuknutím na Prehrať.
 */

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";
export type Playable = Pick<RadioStation, "id" | "name" | "url" | "codec" | "logo" | "countrycode" | "bitrate" | "tags"> & Partial<RadioStation>;

const SINK_KEY = "sgh.radio.sink";

const MIME: Record<string, string> = {
  MP3: "audio/mpeg",
  AAC: "audio/aac",
  "AAC+": "audio/aac",
  OGG: "audio/ogg",
  OPUS: 'audio/ogg; codecs="opus"',
  FLAC: "audio/flac",
};

/** Vie tento prehliadač prehrať daný formát? null = neznámy formát (skúsi sa prehrať). */
export function codecSupported(codec: string, audio: Pick<HTMLAudioElement, "canPlayType">): boolean | null {
  const c = (codec || "").toUpperCase();
  if (c === "HLS") return false;
  const mime = MIME[c];
  if (!mime) return null;
  return audio.canPlayType(mime) !== "";
}

interface RadioCtx {
  stations: RadioStation[];
  current: Playable | null;
  status: PlayerStatus;
  error: string | null;
  volume: number;
  play: (s?: Playable) => Promise<void>;
  pause: () => void;
  toggle: () => void;
  stop: () => void;
  next: (dir?: 1 | -1) => void;
  setVolume: (v: number) => void;
  reload: () => Promise<void>;
  setFavorite: (s: RadioStation | CatalogStation, on: boolean) => Promise<void>;
  addCustom: (name: string, url: string) => Promise<{ station: RadioStation; check: RadioStation }>;
  checkStation: (id: string) => Promise<RadioStation>;
  remove: (id: string) => Promise<void>;
  sinkSupported: boolean;
  setSink: (deviceId: string) => Promise<void>;
  sinkId: string;
}

const Ctx = createContext<RadioCtx | null>(null);

export function useRadio(): RadioCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRadio mimo RadioProvider");
  return c;
}

function storageGet(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function RadioProvider({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const userName = user?.username ?? null;
  const audio = useMemo(() => {
    const a = typeof Audio !== "undefined" ? new Audio() : ({} as HTMLAudioElement);
    a.preload = "none";
    return a;
  }, []);
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [current, setCurrent] = useState<Playable | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(0.6);
  const [sinkId, setSinkId] = useState(storageGet(SINK_KEY));
  const stopping = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const stateRef = useRef<RadioState>({ station_id: null, volume: 0.6 });

  const persist = useCallback((patch: Partial<RadioState>) => {
    stateRef.current = { ...stateRef.current, ...patch };
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void api.put("/api/radio/state", stateRef.current).catch(() => undefined);
    }, 600);
  }, []);

  const reload = useCallback(async () => {
    const list = await api.get<RadioStation[]>("/api/radio/stations");
    setStations(list);
  }, []);

  // Po prihlásení: stanice + posledná stanica a hlasitosť (bez prehrávania)
  useEffect(() => {
    if (!userName) return;
    let alive = true;
    void (async () => {
      try {
        const [list, st] = await Promise.all([api.get<RadioStation[]>("/api/radio/stations"), api.get<RadioState>("/api/radio/state")]);
        if (!alive) return;
        setStations(list);
        stateRef.current = st;
        setVolumeState(st.volume);
        audio.volume = st.volume;
        const last = list.find((s) => s.id === st.station_id);
        if (last) setCurrent((c) => c ?? last);
      } catch {
        /* rádio nie je kritické – dashboard funguje ďalej */
      }
    })();
    return () => {
      alive = false;
    };
  }, [userName, audio]);

  // Udalosti prehrávača
  useEffect(() => {
    if (!audio.addEventListener) return;
    const on = (ev: string, fn: () => void) => {
      audio.addEventListener(ev, fn);
      return () => audio.removeEventListener(ev, fn);
    };
    const offs = [
      on("playing", () => {
        setStatus("playing");
        setError(null);
      }),
      on("waiting", () => setStatus((s) => (s === "playing" || s === "loading" ? "loading" : s))),
      on("pause", () => {
        if (!stopping.current) setStatus((s) => (s === "error" ? s : "paused"));
      }),
      on("error", () => {
        if (stopping.current || !audio.getAttribute("src")) return;
        setStatus("error");
        setError("Stanicu sa nepodarilo prehrať – stream je nedostupný alebo v nepodporovanom formáte.");
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [audio]);

  // zvukový výstup (napr. USB zvuková karta, zosilňovač) – iba ak to prehliadač podporuje
  const sinkSupported = typeof (audio as HTMLAudioElement & { setSinkId?: unknown }).setSinkId === "function";
  useEffect(() => {
    if (sinkSupported && sinkId) void (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(sinkId).catch(() => undefined);
  }, [audio, sinkId, sinkSupported]);

  const play = useCallback(
    async (s?: Playable) => {
      const st = s ?? current;
      if (!st) return;
      const supported = codecSupported(st.codec, audio);
      if (supported === false) {
        setCurrent(st);
        setStatus("error");
        setError(`Formát ${st.codec} tento prehliadač neprehrá.`);
        return;
      }
      stopping.current = false;
      setError(null);
      if (!current || current.id !== st.id || !audio.getAttribute("src")) {
        audio.src = st.url;
        setCurrent(st);
        persist({ station_id: st.id.startsWith("rb-") && !stations.some((x) => x.id === st.id) ? stateRef.current.station_id : st.id });
      }
      setStatus("loading");
      try {
        await audio.play();
      } catch (e) {
        const name = (e as DOMException)?.name;
        setStatus("error");
        setError(name === "NotAllowedError" ? "Prehliadač zablokoval spustenie – ťuknite na Prehrať." : "Stanicu sa nepodarilo pripojiť.");
      }
    },
    [audio, current, persist, stations],
  );

  const pause = useCallback(() => audio.pause(), [audio]);

  const stop = useCallback(() => {
    stopping.current = true;
    audio.pause();
    audio.removeAttribute("src");
    audio.load?.();
    setStatus("idle");
    setError(null);
  }, [audio]);

  const toggle = useCallback(() => {
    if (status === "playing" || status === "loading") pause();
    else void play();
  }, [status, pause, play]);

  const next = useCallback(
    (dir: 1 | -1 = 1) => {
      const list = stations.filter((s) => (s.favorite || s.source === "preset") && s.status !== "unavailable" && s.status !== "unsupported");
      if (!list.length) return;
      const i = current ? list.findIndex((s) => s.id === current.id) : -1;
      const nextSt = list[(i + dir + list.length) % list.length];
      void play(nextSt);
    },
    [stations, current, play],
  );

  const setVolume = useCallback(
    (v: number) => {
      const vol = Math.max(0, Math.min(1, v));
      audio.volume = vol;
      setVolumeState(vol);
      persist({ volume: vol });
    },
    [audio, persist],
  );

  const setFavorite = useCallback(
    async (s: RadioStation | CatalogStation, on: boolean) => {
      const saved = stations.find((x) => x.id === s.id || x.url === s.url);
      if (saved) await api.patch(`/api/radio/stations/${saved.id}`, { favorite: on });
      else if (on)
        await api.post("/api/radio/stations", {
          id: s.id,
          name: s.name,
          url: s.url,
          homepage: s.homepage,
          favicon: s.favicon,
          countrycode: s.countrycode,
          tags: s.tags,
          codec: s.codec,
          bitrate: s.bitrate,
          favorite: true,
        });
      await reload();
    },
    [stations, reload],
  );

  const checkStation = useCallback(
    async (id: string) => {
      const st = await api.post<RadioStation>(`/api/radio/stations/${id}/check`);
      await reload();
      return st;
    },
    [reload],
  );

  const addCustom = useCallback(
    async (name: string, url: string) => {
      const station = await api.post<RadioStation>("/api/radio/stations", { name, url, favorite: true });
      const check = await api.post<RadioStation>(`/api/radio/stations/${station.id}/check`);
      await reload();
      return { station, check };
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      if (current?.id === id) stop();
      await api.del(`/api/radio/stations/${id}`);
      await reload();
    },
    [current, stop, reload],
  );

  const setSink = useCallback(
    async (deviceId: string) => {
      try {
        window.localStorage.setItem(SINK_KEY, deviceId);
      } catch {
        /* úložisko nedostupné */
      }
      setSinkId(deviceId);
    },
    [],
  );

  const value: RadioCtx = { stations, current, status, error, volume, play, pause, toggle, stop, next, setVolume, reload, setFavorite, addCustom, checkStation, remove, sinkSupported, setSink, sinkId };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export async function checkUrl(url: string): Promise<StreamCheck> {
  return api.post<StreamCheck>("/api/radio/check", { url });
}

export { ApiError };
