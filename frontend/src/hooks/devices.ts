import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { Reading } from "../api/types";
import { useApp } from "./AppContext";
import { useResource } from "./useResource";

type WithId = { device_id: string };

/**
 * Zoznam zariadení jedného typu + odoslanie príkazu.
 * Po úspešnom príkaze sa stav prepíše odpoveďou zo servera (nie optimisticky vymyslenou hodnotou).
 */
export function useDevices<T extends WithId>(path: string, intervalMs = 10000) {
  const res = useResource<Reading<T>[]>(path, intervalMs);
  const { deviceTick } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [cmdError, setCmdError] = useState<string | null>(null);
  const { refresh, setData } = res;

  useEffect(() => {
    if (deviceTick) void refresh();
  }, [deviceTick, refresh]);

  const apply = useCallback(
    (states: T[]) =>
      setData((prev) =>
        prev
          ? prev.map((r) => {
              const s = states.find((x) => r.data && x.device_id === r.data.device_id);
              return s ? { ...r, data: s, status: "ok", updated_at: new Date().toISOString() } : r;
            })
          : prev,
      ),
    [setData],
  );

  const send = useCallback(
    async (deviceId: string, body: unknown, subpath = deviceId) => {
      setBusy(deviceId);
      setCmdError(null);
      try {
        const out = await api.post<T | T[]>(`${path}/${subpath}`, body);
        apply(Array.isArray(out) ? out : [out]);
        return true;
      } catch (e) {
        setCmdError(e instanceof ApiError ? e.message : "Príkaz sa nepodarilo odoslať");
        return false;
      } finally {
        setBusy(null);
      }
    },
    [path, apply],
  );

  return { ...res, send, busy, cmdError, clearError: () => setCmdError(null) };
}
