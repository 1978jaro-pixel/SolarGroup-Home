import { useEffect, useState } from "react";

/**
 * Režim rozloženia hlavnej obrazovky:
 *  - "board" – každý displej na šírku (7" 1024 × 600 až 15" Full HD a viac): pevné rozloženie
 *              podľa schváleného návrhu „Môj domov“, bez posúvania
 *  - "flow"  – mobil, tablet na výšku: karty pod sebou s posúvaním
 */
export type LayoutMode = "board" | "flow";

export const BOARD_QUERY = "(min-width: 900px) and (min-height: 500px) and (orientation: landscape)";

function current(): LayoutMode {
  if (typeof window === "undefined" || !window.matchMedia) return "flow";
  return window.matchMedia(BOARD_QUERY).matches ? "board" : "flow";
}

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(current);
  useEffect(() => {
    if (!window.matchMedia) return;
    const q = window.matchMedia(BOARD_QUERY);
    const update = () => setMode(current());
    q.addEventListener?.("change", update);
    return () => q.removeEventListener?.("change", update);
  }, []);
  return mode;
}
