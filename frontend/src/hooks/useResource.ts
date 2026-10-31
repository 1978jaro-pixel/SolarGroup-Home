import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";

export interface Resource<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setData: (fn: (prev: T | null) => T | null) => void;
}

/** Načíta GET endpoint a pravidelne ho obnovuje (iba keď je karta viditeľná). */
export function useResource<T>(path: string | null, intervalMs = 10000): Resource<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api.get<T>(path);
      if (!alive.current) return;
      setDataState(d);
      setError(null);
    } catch (e) {
      if (alive.current) setError(e instanceof ApiError ? e : new ApiError(0, String(e)));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    void refresh();
    if (!intervalMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, intervalMs);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [refresh, intervalMs]);

  const setData = useCallback((fn: (prev: T | null) => T | null) => setDataState(fn), []);
  return { data, error, loading, refresh, setData };
}
