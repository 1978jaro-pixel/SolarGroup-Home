/**
 * Režim dotykového kiosku (Raspberry Pi s 7" displejom).
 *
 * Zapína sa adresou `?kiosk=1` (spúšťač Chromia ju používa) alebo v Nastaveniach, vypína `?kiosk=0`.
 * Ukladá sa iba v tomto prehliadači – mobil či počítač ostávajú v bežnom režime, takže sa tam
 * nezobrazí druhá (vstavaná) klávesnica.
 */

const KEY = "sgh.kiosk";
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function initKioskFromUrl(search = window.location.search): void {
  const v = new URLSearchParams(search).get("kiosk");
  if (v === "1") storage()?.setItem(KEY, "1");
  if (v === "0") storage()?.removeItem(KEY);
  applyKioskClass();
}

export function isKiosk(): boolean {
  return storage()?.getItem(KEY) === "1";
}

export function setKiosk(on: boolean): void {
  if (on) storage()?.setItem(KEY, "1");
  else storage()?.removeItem(KEY);
  applyKioskClass();
  listeners.forEach((l) => l());
}

export function onKioskChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function applyKioskClass(): void {
  document.documentElement.classList.toggle("kiosk", isKiosk());
}
