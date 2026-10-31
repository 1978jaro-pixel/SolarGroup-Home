import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler } from "../api/client";
import type { AuthStatus, EnergySnapshot, Reading, Source, User } from "../api/types";

interface AppState {
  ready: boolean;
  serverReachable: boolean;
  mode: Source | null;
  user: User | null;
  setupRequired: boolean;
  setupAllowedHere: boolean;
  /** Posledný snapshot fotovoltiky z WebSocketu (alebo z REST zálohy). */
  energy: Reading<EnergySnapshot> | null;
  liveConnected: boolean;
  /** Počítadlo zmien zariadení – stránky podľa neho obnovia údaje. */
  deviceTick: number;
  reloadAuth: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp mimo AppProvider");
  return v;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [serverReachable, setServerReachable] = useState(true);
  const [mode, setMode] = useState<Source | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [energy, setEnergy] = useState<Reading<EnergySnapshot> | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [deviceTick, setDeviceTick] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  const reloadAuth = useCallback(async () => {
    try {
      const [health, st] = await Promise.all([
        api.get<{ mode: Source }>("/api/health"),
        api.get<AuthStatus>("/api/auth/status"),
      ]);
      setMode(health.mode);
      setAuth(st);
      setServerReachable(true);
    } catch {
      setServerReachable(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reloadAuth();
    setUnauthorizedHandler(() => void reloadAuth());
    return () => setUnauthorizedHandler(null);
  }, [reloadAuth]);

  // Pri nedostupnom serveri skúšame znova.
  useEffect(() => {
    if (serverReachable) return;
    const id = window.setInterval(() => void reloadAuth(), 5000);
    return () => window.clearInterval(id);
  }, [serverReachable, reloadAuth]);

  const user = auth?.user ?? null;

  // WebSocket so živými údajmi + automatické znovupripojenie.
  useEffect(() => {
    if (!user) return;
    let stopped = false;
    let retry = 1000;
    let timer: number | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/api/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        retry = 1000;
        setLiveConnected(true);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === "energy") setEnergy(msg.payload);
          else setDeviceTick((t) => t + 1);
        } catch {
          /* ignorujeme poškodenú správu */
        }
      };
      ws.onclose = () => {
        setLiveConnected(false);
        if (!stopped) timer = window.setTimeout(connect, (retry = Math.min(retry * 2, 30000)));
      };
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [user]);

  // Záloha cez REST, keď WebSocket nebeží.
  useEffect(() => {
    if (!user || liveConnected) return;
    const load = () =>
      api
        .get<Reading<EnergySnapshot>>("/api/energy/snapshot")
        .then(setEnergy)
        .catch(() =>
          setEnergy((prev) => ({
            status: "offline",
            source: prev?.source ?? mode ?? "live",
            updated_at: prev?.updated_at ?? null,
            message: "Server je nedostupný",
            data: null,
          })),
        );
    void load();
    const id = window.setInterval(load, 5000);
    return () => window.clearInterval(id);
  }, [user, liveConnected, mode]);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      setEnergy(null);
      await reloadAuth();
    }
  }, [reloadAuth]);

  const value = useMemo<AppState>(
    () => ({
      ready,
      serverReachable,
      mode,
      user,
      setupRequired: auth?.setup_required ?? false,
      setupAllowedHere: auth?.setup_allowed_here ?? false,
      energy,
      liveConnected,
      deviceTick,
      reloadAuth,
      logout,
    }),
    [ready, serverReachable, mode, user, auth, energy, liveConnected, deviceTick, reloadAuth, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
