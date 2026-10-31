import { useId } from "react";

/**
 * Ikony počasia E4 (SVG, plastický vzhľad, bez rastrových obrázkov). Statické – žiadna nepretržitá
 * animácia; hlavná ikona môže mať jednorazový nástup cez CSS triedu.
 */

export type WxKind = "sun" | "moon" | "partly" | "night" | "cloud" | "fog" | "rain" | "showers" | "storm" | "snow";

/** WMO kód (Open-Meteo) → slovenský popis, druh ikony a variant oblohy pre kartu. */
export function wmo(code: number, isDay = true): { label: string; kind: WxKind; sky: SkyKind } {
  const day = isDay !== false;
  const L: Record<number, string> = {
    0: "Jasno",
    1: "Prevažne jasno",
    2: "Polojasno",
    3: "Zamračené",
    45: "Hmla",
    48: "Hmla s námrazou",
    51: "Slabé mrholenie",
    53: "Mrholenie",
    55: "Silné mrholenie",
    56: "Mrznúce mrholenie",
    57: "Mrznúce mrholenie",
    61: "Slabý dážď",
    63: "Dážď",
    65: "Silný dážď",
    66: "Mrznúci dážď",
    67: "Mrznúci dážď",
    71: "Slabé sneženie",
    73: "Sneženie",
    75: "Silné sneženie",
    77: "Snehové zrná",
    80: "Prehánky",
    81: "Dažďové prehánky",
    82: "Silné prehánky",
    85: "Snehové prehánky",
    86: "Silné snehové prehánky",
    95: "Búrka",
    96: "Búrka s krúpami",
    99: "Búrka s krúpami",
  };
  const label = L[code] ?? "Neznáme počasie";
  if (code === 0) return { label, kind: day ? "sun" : "moon", sky: "jasno" };
  if (code <= 2) return { label, kind: day ? "partly" : "night", sky: "polojasno" };
  if (code === 3) return { label, kind: "cloud", sky: "zamracene" };
  if (code <= 48) return { label, kind: "fog", sky: "hmla" };
  if (code <= 67) return { label, kind: "rain", sky: "dazd" };
  if (code <= 77 || code === 85 || code === 86) return { label, kind: "snow", sky: "sneh" };
  if (code <= 82) return { label, kind: day ? "showers" : "rain", sky: "dazd" };
  return { label, kind: "storm", sky: "dazd" };
}

export type SkyKind = "jasno" | "polojasno" | "zamracene" | "dazd" | "sneh" | "hmla";

const CLOUD =
  "M20 48H46C52.6 48 57 43.5 57 38C57 32.6 52.8 28.3 47.5 28C46 21.5 40.3 17 33.5 17C26.6 17 20.9 21.8 19.6 28.2C13.6 28.9 9 33.6 9 39C9 44 13.5 48 20 48Z";

function Sun({ id, cx, cy, r }: { id: string; cx: number; cy: number; r: number }) {
  return (
    <>
      <defs>
        <radialGradient id={id} cx="38%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset=".45" stopColor="#ffc93c" />
          <stop offset="1" stopColor="#ff9418" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r * 1.55} fill="rgba(255,190,60,.16)" />
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id})`} />
    </>
  );
}

function Moon({ cx, cy }: { cx: number; cy: number }) {
  return <path d={`M${cx - 2} ${cy - 22}a16 16 0 1 0 18 22a13 13 0 0 1-18-22z`} fill="#cfd9ff" />;
}

function Cloud({ id, tx = 0, ty = 0, s = 1, dark = false }: { id: string; tx?: number; ty?: number; s?: number; dark?: boolean }) {
  const [a, b] = dark ? ["#e3e9f3", "#8e9db4"] : ["#ffffff", "#b8c7dc"];
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <g transform={`translate(${tx} ${ty}) scale(${s})`}>
        <path d={CLOUD} fill="rgba(0,0,0,.18)" transform="translate(0 2.5)" />
        <path d={CLOUD} fill={`url(#${id})`} />
      </g>
    </>
  );
}

const Drops = ({ n = 3 }: { n?: number }) => (
  <>
    {Array.from({ length: n }, (_, i) => (
      <path key={i} d={`M${22 + i * 10} 51 l-3 8`} stroke="#56b6ff" strokeWidth="3.4" strokeLinecap="round" />
    ))}
  </>
);

export function WxIcon({ kind, size = 48, className = "", title }: { kind: WxKind; size?: number; className?: string; title?: string }) {
  const u = useId().replace(/:/g, "");
  const s = `s${u}`;
  const c = `c${u}`;
  let body;
  switch (kind) {
    case "sun":
      body = <Sun id={s} cx={32} cy={32} r={14} />;
      break;
    case "moon":
      body = <Moon cx={32} cy={32} />;
      break;
    case "partly":
      body = (
        <>
          <Sun id={s} cx={24} cy={24} r={11} />
          <Cloud id={c} tx={8} ty={8} s={0.85} />
        </>
      );
      break;
    case "night":
      body = (
        <>
          <Moon cx={26} cy={26} />
          <Cloud id={c} tx={8} ty={10} s={0.8} dark />
        </>
      );
      break;
    case "cloud":
      body = <Cloud id={c} tx={-2} ty={-1} s={1.03} dark />;
      break;
    case "fog":
      body = (
        <>
          <Cloud id={c} tx={0} ty={-8} s={1} dark />
          <path d="M12 50h40M16 57h32" stroke="#c9d6ea" strokeWidth="3.4" strokeLinecap="round" />
        </>
      );
      break;
    case "rain":
      body = (
        <>
          <Cloud id={c} tx={0} ty={-7} s={1} dark />
          <Drops n={4} />
        </>
      );
      break;
    case "showers":
      body = (
        <>
          <Sun id={s} cx={22} cy={20} r={9} />
          <Cloud id={c} tx={6} ty={0} s={0.85} dark />
          <Drops n={3} />
        </>
      );
      break;
    case "storm":
      body = (
        <>
          <Cloud id={c} tx={0} ty={-7} s={1} dark />
          <path d="M33 38l-8 13h7l-4 11 12-15h-7l5-9z" fill="#ffd23c" stroke="#e69a00" strokeWidth="1" />
        </>
      );
      break;
    case "snow":
      body = (
        <>
          <Cloud id={c} tx={0} ty={-7} s={1} dark />
          {[
            [22, 52],
            [32, 57],
            [42, 52],
          ].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="3" fill="#fff" stroke="#b8c7dc" />
          ))}
        </>
      );
      break;
  }
  return (
    <svg className={`wx-ic ${className}`} width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {body}
    </svg>
  );
}
