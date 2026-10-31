/**
 * Diagnostika displeja priamo v aplikácii (Nastavenia → Tento displej) – na overenie ostrosti
 * a výkonu na Raspberry Pi bez notebooku: rozlíšenie, mierka (device pixel ratio), GPU, pamäť, FPS.
 */

export interface DisplayInfo {
  viewport: string;
  screen: string;
  dpr: number;
  physical: string;
  gpu: string;
  gpuAccelerated: boolean | null;
  heapMb: number | null;
  cores: number | null;
  browser: string;
  warnings: string[];
}

const MOTION_KEY = "sgh.reduceMotion";

function gpuRenderer(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "WebGL nedostupné";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch {
    return "neznáme";
  }
}

export function displayInfo(): DisplayInfo {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const gpu = gpuRenderer();
  const soft = /swiftshader|llvmpipe|softpipe|software/i.test(gpu);
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  const browser = navigator.userAgent.match(/(Chromium|Chrome|Firefox|Safari)\/[\d.]+/)?.[0] ?? navigator.userAgent;
  const warnings: string[] = [];
  if (dpr !== 1 && Number.isInteger(dpr) === false) warnings.push(`Neceločíselná mierka ${dpr} – text a obrázky môžu byť rozmazané. Skontrolujte mierku výstupu (wlr-randr) a prepínač --force-device-scale-factor.`);
  if (soft) warnings.push("Prehliadač kreslí bez GPU (softvérové vykresľovanie) – animácie budú pomalšie.");
  if (w < window.screen.width - 1 || h < window.screen.height - 1) warnings.push("Okno nie je na celú obrazovku (kiosk by mal mať rovnaké rozmery okna a obrazovky).");
  return {
    viewport: `${w} × ${h}`,
    screen: `${window.screen.width} × ${window.screen.height}`,
    dpr,
    physical: `${Math.round(w * dpr)} × ${Math.round(h * dpr)}`,
    gpu,
    gpuAccelerated: gpu === "neznáme" ? null : !soft && !/nedostupné/.test(gpu),
    heapMb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
    cores: navigator.hardwareConcurrency ?? null,
    browser,
    warnings,
  };
}

/** Priemerný počet snímok za sekundu počas `ms` milisekúnd. */
export function measureFps(ms = 3000): Promise<number> {
  return new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = (t: number) => {
      frames++;
      if (t - start < ms) requestAnimationFrame(tick);
      else resolve(Math.round((frames * 1000) / (t - start)));
    };
    requestAnimationFrame(tick);
  });
}

export function getReduceMotion(): boolean {
  try {
    return window.localStorage.getItem(MOTION_KEY) === "1";
  } catch {
    return false;
  }
}

export function setReduceMotion(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(MOTION_KEY, "1");
    else window.localStorage.removeItem(MOTION_KEY);
  } catch {
    /* úložisko nedostupné */
  }
  applyReduceMotion();
}

export function applyReduceMotion(): void {
  document.documentElement.classList.toggle("reduce-motion", getReduceMotion());
}
