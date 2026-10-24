import type { EnergySnapshot } from "../api/types";
import { formatPower } from "../utils/format";
import { Icon } from "./Icon";

/**
 * Izometrický 3D dom s čiernymi solárnymi panelmi a animovanými tokmi energie.
 * Smer animácie zodpovedá smeru toku (napr. dodávka vs. odber zo siete).
 */

type Pt = [number, number];
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const pts = (...p: Pt[]) => p.map((q) => q.join(",")).join(" ");

// Geometria domu
const F: Pt = [300, 300]; // predný roh pri zemi
const U: Pt = [130, -65]; // smer pravej steny
const V: Pt = [-120, -60]; // smer ľavej steny
const H: Pt = [0, -95]; // výška steny
const R = add(F, U);
const L = add(F, V);
const F2 = add(F, H);
const R2 = add(R, H);
const L2 = add(L, H);
const APEX = add(add(F2, V, 0.5), [0, -62]);
const RIDGE = add(APEX, U);

// Bod na pravej rovine strechy: u pozdĺž odkvapu, v smerom k hrebeňu
function roof(u: number, v: number): Pt {
  const edge = add(F2, U, u);
  return add(edge, [APEX[0] - F2[0], APEX[1] - F2[1]], v);
}

function panels() {
  const cols = 5;
  const rows = 2;
  const out: { cell: string; lines: string[] }[] = [];
  const u0 = 0.06;
  const u1 = 0.94;
  const v0 = 0.14;
  const v1 = 0.9;
  const gu = 0.012;
  const gv = 0.03;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ua = u0 + ((u1 - u0) / cols) * c + gu;
      const ub = u0 + ((u1 - u0) / cols) * (c + 1) - gu;
      const va = v0 + ((v1 - v0) / rows) * r + gv;
      const vb = v0 + ((v1 - v0) / rows) * (r + 1) - gv;
      const lines: string[] = [];
      for (let k = 1; k < 3; k++) {
        const uu = ua + ((ub - ua) * k) / 3;
        lines.push(pts(roof(uu, va), roof(uu, vb)));
      }
      const vm = (va + vb) / 2;
      lines.push(pts(roof(ua, vm), roof(ub, vm)));
      out.push({ cell: pts(roof(ua, va), roof(ub, va), roof(ub, vb), roof(ua, vb)), lines });
    }
  }
  return out;
}
const PANELS = panels();

// Okná na stenách
function wallQuad(origin: Pt, dir: Pt, a: number, b: number, h0: number, h1: number) {
  const p0 = add(add(origin, dir, a), H, h0);
  const p1 = add(add(origin, dir, b), H, h0);
  const p2 = add(add(origin, dir, b), H, h1);
  const p3 = add(add(origin, dir, a), H, h1);
  return pts(p0, p1, p2, p3);
}

// Uzly tokov
const HUB: Pt = add(add(F, U, 0.7), H, 0.2);
const N = {
  pv: roof(0.55, 0.45),
  battery: add(add(F, U, 0.87), H, 0.3),
  grid: [92, 258] as Pt,
  house: add(add(F, V, 0.45), H, 0.3),
  ev: [522, 306] as Pt,
};

function flowPath(a: Pt, b: Pt, bend = 0.25): string {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const cx = mx - dy * bend;
  const cy = my + dx * bend;
  return `M ${a[0]} ${a[1]} Q ${cx} ${cy} ${b[0]} ${b[1]}`;
}

interface FlowProps {
  d: string;
  kw: number;
  color: string;
  reverse?: boolean;
}

function Flow({ d, kw, color, reverse }: FlowProps) {
  const active = Math.abs(kw) >= 0.05;
  // rýchlosť podľa výkonu (0.6–2.4 s na cyklus)
  const dur = active ? Math.max(0.6, 2.4 - Math.min(Math.abs(kw), 8) * 0.22) : 0;
  return (
    <g className={`flow ${active ? "is-active" : ""}`} style={{ color }}>
      <path d={d} className="flow__base" />
      {active && (
        <path
          d={d}
          className={`flow__dash ${reverse ? "is-reverse" : ""}`}
          style={{ animationDuration: `${dur}s` }}
        />
      )}
    </g>
  );
}

export function SolarHouse({ data, compact = false }: { data: EnergySnapshot | null; compact?: boolean }) {
  const d = data;
  const pv = d?.pv_kw ?? 0;
  const grid = d?.grid_kw ?? 0;
  const bat = d?.battery_kw ?? 0;
  const ev = d?.ev_kw ?? 0;
  const house = d?.house_kw ?? 0;

  return (
    <div className={`solar-house ${compact ? "is-compact" : ""} ${d ? "" : "is-empty"}`}>
      <svg viewBox="40 10 580 370" className="solar-house__svg" role="img" aria-label="Ilustrácia domu s tokmi energie">
        <defs>
          <linearGradient id="sh-wall-l" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e9ebef" />
            <stop offset="1" stopColor="#cfd3da" />
          </linearGradient>
          <linearGradient id="sh-wall-r" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#b9bfc8" />
            <stop offset="1" stopColor="#9ea5b0" />
          </linearGradient>
          <linearGradient id="sh-roof" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#30353e" />
            <stop offset="1" stopColor="#23272e" />
          </linearGradient>
          <linearGradient id="sh-panel" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#07090d" />
            <stop offset="0.55" stopColor="#111722" />
            <stop offset="1" stopColor="#1d2a3d" />
          </linearGradient>
          <linearGradient id="sh-glass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a6fa6" />
            <stop offset="1" stopColor="#16283d" />
          </linearGradient>
          <radialGradient id="sh-ground" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="rgba(59,143,232,0.22)" />
            <stop offset="1" stopColor="rgba(59,143,232,0)" />
          </radialGradient>
        </defs>

        {/* Podklad */}
        <ellipse cx="320" cy="300" rx="270" ry="62" fill="url(#sh-ground)" />

        {/* Stĺp distribučnej siete */}
        <g className="sh-pylon" transform="translate(92 175)">
          <path d="M0 0 L-18 110 M0 0 L18 110 M-12 72 L12 72 M-7 40 L7 40 M-14 72 L7 40 M14 72 L-7 40 M-26 14 L26 14 M-20 28 L20 28 M-26 14 L-7 40 M26 14 L7 40" />
        </g>

        {/* Steny */}
        <polygon points={pts(L, F, F2, L2)} fill="url(#sh-wall-l)" />
        <polygon points={pts(F, R, R2, F2)} fill="url(#sh-wall-r)" />
        <polygon points={pts(L2, F2, APEX)} fill="#dde0e5" />

        {/* Okná a dvere */}
        <polygon points={wallQuad(L, [-V[0], -V[1]], 0.12, 0.42, 0.25, 0.75)} fill="url(#sh-glass)" className="sh-window" />
        <polygon points={wallQuad(L, [-V[0], -V[1]], 0.55, 0.85, 0.25, 0.75)} fill="url(#sh-glass)" className="sh-window" />
        <polygon points={wallQuad(F, U, 0.1, 0.28, 0, 0.72)} fill="#2a2f37" />
        <polygon points={wallQuad(F, U, 0.36, 0.62, 0.35, 0.78)} fill="url(#sh-glass)" className="sh-window" />

        {/* Strecha */}
        <polygon points={pts(F2, R2, RIDGE, APEX)} fill="url(#sh-roof)" />
        <polyline points={pts(L2, APEX, RIDGE)} className="sh-ridge" />
        <polyline points={pts(L2, F2, R2)} className="sh-eave" />

        {/* Solárne panely */}
        <g className="sh-panels">
          {PANELS.map((p, i) => (
            <g key={i}>
              <polygon points={p.cell} fill="url(#sh-panel)" className="sh-panel" />
              {p.lines.map((l, j) => (
                <polyline key={j} points={l} className="sh-panel-line" />
              ))}
            </g>
          ))}
          <polygon points={pts(roof(0.06, 0.6), roof(0.4, 0.9), roof(0.5, 0.9), roof(0.12, 0.6))} className="sh-sheen" />
        </g>

        {/* Batéria na stene */}
        <g className="sh-battery">
          <polygon points={wallQuad(F, U, 0.8, 0.94, 0.05, 0.6)} fill="#eef0f3" />
          <polygon points={wallQuad(F, U, 0.83, 0.91, 0.12, 0.52)} fill="#1b2027" />
          <polygon points={wallQuad(F, U, 0.83, 0.91, 0.12, 0.12 + 0.4 * ((d?.battery_soc ?? 0) / 100))} className="sh-battery-level" />
        </g>

        {/* Nabíjačka a elektromobil */}
        <g className="sh-charger">
          <rect x="488" y="262" width="12" height="44" rx="3" fill="#dfe2e7" />
          <rect x="490.5" y="268" width="7" height="9" rx="1.5" fill="#1b2027" />
        </g>
        <g className="sh-car" transform="translate(510 300)">
          <path d="M0 22 L4 8 Q8 0 18 -2 L44 -4 Q54 -4 62 4 L78 10 Q86 12 86 20 L86 26 L0 28 Z" fill="#2f5d8f" />
          <path d="M14 4 L22 -1 L42 -2 L52 6 Z" fill="#9cc3ea" opacity="0.85" />
          <circle cx="18" cy="28" r="7" fill="#15181d" />
          <circle cx="68" cy="27" r="7" fill="#15181d" />
          <circle cx="18" cy="28" r="2.5" fill="#8a929e" />
          <circle cx="68" cy="27" r="2.5" fill="#8a929e" />
        </g>

        {/* Toky energie */}
        <Flow d={flowPath(N.pv, HUB, -0.2)} kw={pv} color="var(--flow-pv)" />
        <Flow d={flowPath(N.grid, HUB, 0.18)} kw={grid} color="var(--flow-grid)" reverse={grid < 0} />
        <Flow d={flowPath(HUB, N.battery, -0.3)} kw={bat} color="var(--flow-battery)" reverse={bat < 0} />
        <Flow d={flowPath(HUB, N.house, 0.25)} kw={house} color="var(--flow-house)" />
        <Flow d={flowPath(HUB, N.ev, -0.25)} kw={ev} color="var(--flow-house)" />
        <circle cx={HUB[0]} cy={HUB[1]} r="6" className="sh-hub" />
      </svg>

      {!compact && (
        <>
          <Chip x={50} y={2} icon="solar" label="Výroba" value={d ? formatPower(pv) : "–"} color="var(--flow-pv)" />
          <Chip x={1} y={24} icon="grid" label={grid < 0 ? "Dodávka do siete" : "Odber zo siete"} value={d ? formatPower(grid) : "–"} color="var(--flow-grid)" />
          <Chip x={20} y={86} icon="home" label="Spotreba domu" value={d ? formatPower(house) : "–"} color="var(--flow-house)" />
          <Chip
            right={1}
            y={26}
            icon="battery"
            label={bat > 0.05 ? "Nabíja sa" : bat < -0.05 ? "Vybíja sa" : "Batéria"}
            value={d ? `${Math.round(d.battery_soc)} % · ${formatPower(bat)}` : "–"}
            color="var(--flow-battery)"
          />
          <Chip right={1} y={58} icon="car" label={!d ? "Elektromobil" : d.ev_connected ? (ev > 0 ? "Nabíjanie auta" : "Auto pripojené") : "Auto nepripojené"} value={d ? formatPower(ev) : "–"} color="var(--flow-house)" />
        </>
      )}
    </div>
  );
}

function Chip({ x, right, y, icon, label, value, color }: { x?: number; right?: number; y: number; icon: string; label: string; value: string; color: string }) {
  return (
    <div className="flow-chip" style={{ left: x != null ? `${x}%` : undefined, right: right != null ? `${right}%` : undefined, top: `${y}%` }}>
      <span className="flow-chip__icon" style={{ color }}>
        <Icon name={icon} size={16} />
      </span>
      <span>
        <span className="flow-chip__label">{label}</span>
        <span className="flow-chip__value">{value}</span>
      </span>
    </div>
  );
}
