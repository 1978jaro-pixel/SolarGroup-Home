import { useEffect, useRef, useState } from "react";

/**
 * Voliteľný šetrič obrazovky v aplikácii (predvolene VYPNUTÝ).
 *
 * Po nastavenej dobe nečinnosti prekryje obrazovku čiernou plochou. HDMI výstup sa nevypína,
 * takže obraz sa vždy obnoví prvým dotykom – na rozdiel od DPMS (wlopm/swayidle), pri ktorom
 * sa displej na Raspberry Pi nemusel prebudiť. Prvý dotyk iba zobudí obrazovku, nič nestlačí.
 * Podsvietenie HDMI displeja zostáva zapnuté (displej Waveshare ho cez HDMI neovláda).
 */

const KEY = "sgh.screensaver.minutes";
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function getSaverMinutes(): number {
  try {
    return Number(window.localStorage.getItem(KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function setSaverMinutes(m: number): void {
  try {
    if (m > 0) window.localStorage.setItem(KEY, String(m));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* úložisko nedostupné */
  }
  window.dispatchEvent(new Event("sgh-screensaver"));
}

export function Screensaver() {
  const [minutes, setMinutes] = useState(getSaverMinutes);
  const [active, setActive] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const update = () => setMinutes(getSaverMinutes());
    window.addEventListener("sgh-screensaver", update);
    return () => window.removeEventListener("sgh-screensaver", update);
  }, []);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!minutes) {
      setActive(false);
      return;
    }
    const arm = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setActive(true), minutes * 60_000);
    };
    arm();
    EVENTS.forEach((e) => window.addEventListener(e, arm, { passive: true, capture: true }));
    return () => {
      window.clearTimeout(timer.current);
      EVENTS.forEach((e) => window.removeEventListener(e, arm, { capture: true }));
    };
  }, [minutes]);

  if (!active) return null;
  return (
    <div
      className="screensaver"
      role="button"
      aria-label="Zobudiť obrazovku"
      tabIndex={-1}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setActive(false);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
