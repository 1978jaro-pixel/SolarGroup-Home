import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { clamp, formatTempValue, roundToStep } from "../utils/format";
import { Icon } from "./Icon";

const START = 135;
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

export interface ThermostatDialProps {
  value: number;
  current?: number | null;
  min?: number;
  max?: number;
  step?: number;
  variant?: "heat" | "cool";
  size?: number;
  label: string;
  disabled?: boolean;
  caption?: string;
  /** Volá sa po dokončení zmeny (pustenie, klávesnica, tlačidlá). */
  onCommit?: (v: number) => void;
  showButtons?: boolean;
}

/**
 * Kruhový regulátor teploty podľa schváleného návrhu: modrý oblúk po nastavenú hodnotu,
 * jemné ryhy na zvyšku stupnice. Ovládanie ťahaním prstom/myšou, klávesnicou aj tlačidlami +/−.
 */
export function ThermostatDial({
  value,
  current,
  min = 5,
  max = 30,
  step = 0.5,
  variant = "heat",
  size = 280,
  label,
  disabled,
  caption = "Požadovaná",
  onCommit,
  showButtons = true,
}: ThermostatDialProps) {
  const [draft, setDraft] = useState(value);
  const dragging = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  // Posledná odoslaná hodnota – porovnávame s ňou, nie s (možno ešte neaktualizovaným) value.
  const lastSent = useRef(value);
  const gid = useId().replace(/:/g, "");

  useEffect(() => {
    lastSent.current = value;
    if (!dragging.current) setDraft(value);
  }, [value]);

  const c = 100;
  const r = 84;
  const frac = (clamp(draft, min, max) - min) / (max - min);
  const angle = START + SWEEP * frac;
  const capIn = polar(c, c, r - 9, angle);
  const capOut = polar(c, c, r + 9, angle);

  const fromPointer = (e: PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return draft;
    const box = svg.getBoundingClientRect();
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    let a = (Math.atan2(dy, dx) * 180) / Math.PI;
    a = (a - START + 720) % 360;
    if (a > SWEEP) a = a > SWEEP + (360 - SWEEP) / 2 ? 0 : SWEEP;
    return roundToStep(min + (a / SWEEP) * (max - min), step);
  };

  const commit = (v: number) => {
    const nv = clamp(roundToStep(v, step), min, max);
    setDraft(nv);
    if (nv !== lastSent.current) {
      lastSent.current = nv;
      onCommit?.(nv);
    }
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDraft(fromPointer(e));
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (dragging.current) setDraft(fromPointer(e));
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    commit(fromPointer(e));
  };

  const onKey = (e: KeyboardEvent) => {
    if (disabled) return;
    const delta = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step }[e.key];
    if (delta) {
      e.preventDefault();
      commit(draft + delta);
    } else if (e.key === "Home") commit(min);
    else if (e.key === "End") commit(max);
  };

  // Ryhy iba na nevyplnenej časti stupnice (ako v návrhu).
  const TICKS = 72;
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => START + (SWEEP * i) / TICKS).filter((t) => t > angle + 3);

  return (
    <div className={`dial dial--${variant} ${disabled ? "is-disabled" : ""}`} style={{ width: size, ["--dial-size" as string]: `${size}px` }}>
      <svg
        ref={svgRef}
        viewBox="0 0 200 200"
        width={size}
        height={size}
        className="dial__svg"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={draft}
        aria-valuetext={`${draft.toFixed(1)} °C`}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={onKey}
      >
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="1" x2="0.6" y2="0">
            <stop offset="0%" className="dial__stop1" />
            <stop offset="100%" className="dial__stop2" />
          </linearGradient>
          <filter id={`glow${gid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {ticks.map((t, i) => {
          const a = polar(c, c, r - 6, t);
          const b = polar(c, c, r + 6, t);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="dial__tick" />;
        })}
        {frac > 0.001 && (
          <>
            <path d={arc(c, c, r, START, angle)} className="dial__glow" stroke={`url(#g${gid})`} filter={`url(#glow${gid})`} />
            <path d={arc(c, c, r, START, angle)} className="dial__value" stroke={`url(#g${gid})`} />
          </>
        )}
        <line x1={capIn.x} y1={capIn.y} x2={capOut.x} y2={capOut.y} className="dial__cap" />
      </svg>
      <div className="dial__center" aria-hidden="true">
        <span className="dial__value-text">
          {formatTempValue(draft)}
          <sup>°C</sup>
        </span>
        <span className="dial__caption">{caption}</span>
        {current != null && (
          <span className="dial__current-text">
            <Icon name="thermo" size={13} /> {current.toFixed(1).replace(".", ",")} °C
          </span>
        )}
      </div>
      {showButtons && (
        <div className="dial__buttons">
          <button type="button" className="round-btn" aria-label="Znížiť teplotu" disabled={disabled || draft <= min} onClick={() => commit(draft - step)}>
            <Icon name="minus" />
          </button>
          <button type="button" className="round-btn" aria-label="Zvýšiť teplotu" disabled={disabled || draft >= max} onClick={() => commit(draft + step)}>
            <Icon name="plus" />
          </button>
        </div>
      )}
    </div>
  );
}
