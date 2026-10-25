import { useEffect, useState } from "react";

/**
 * Režim rozloženia hlavnej obrazovky:
 *  - "fit"  – na šírku, nízky displej (napr. 7" 1024 × 600, 1280 × 800): všetko na jednu obrazovku
 *  - "wall" – veľký nástenný displej (od 1500 × 880): rozloženie podľa schváleného návrhu
 *  - "flow" – mobil, tablet na výšku: karty pod sebou s posúvaním
 */
export type LayoutMode = "fit" | "wall" | "flow";

export const FIT_QUERY = "(min-width: 900px) and (max-height: 879px) and (orientation: landscape)";
export const WALL_QUERY = "(min-width: 1500px) and (min-height: 880px)";

function current(): LayoutMode {
  if (typeof window === "undefined" || !window.matchMedia) return "flow";
  if (window.matchMedia(FIT_QUERY).matches) return "fit";
  if (window.matchMedia(WALL_QUERY).matches) return "wall";
  return "flow";
}

export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(current);
  useEffect(() => {
    if (!window.matchMedia) return;
    const queries = [window.matchMedia(FIT_QUERY), window.matchMedia(WALL_QUERY)];
    const update = () => setMode(current());
    queries.forEach((q) => q.addEventListener?.("change", update));
    return () => queries.forEach((q) => q.removeEventListener?.("change", update));
  }, []);
  return mode;
}
