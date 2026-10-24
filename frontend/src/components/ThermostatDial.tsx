import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { clamp, roundToStep } from "../utils/format";
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

/** Kruhový regulátor teploty – ťahanie prstom/myšou, klávesnica aj tlačidlá +/−. */
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
  caption,
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
  const r = 82;
  const frac = (clamp(draft, min, max) - min) / (max - min);
  const angle = START + SWEEP * frac;
  const knob = polar(c, c, r, angle);
  const curFrac = current == null ? null : (clamp(current, min, max) - min) / (max - min);
  const curPos = curFrac == null ? null : polar(c, c, r, START + SWEEP * curFrac);

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

  const ticks = Array.from({ length: 55 }, (_, i) => START + (SWEEP * i) / 54);
  const [whole, dec] = draft.toFixed(1).split(".");

  return (
    <div className={`dial dial--${variant} ${disabled ? "is-disabled" : ""}`} style={{ width: size }}>
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
          <linearGradient id={`g${gid}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" className="dial__stop1" />
            <stop offset="100%" className="dial__stop2" />
          </linearGradient>
          <radialGradient id={`f${gid}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#2a2f38" />
            <stop offset="100%" stopColor="#1a1d23" />
          </radialGradient>
        </defs>
        {ticks.map((t, i) => {
          const a = polar(c, c, 96, t);
          const b = polar(c, c, i % 9 === 0 ? 90 : 92.5, t);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={t <= angle ? "dial__tick is-on" : "dial__tick"} />;
        })}
        <path d={arc(c, c, r, START, START + SWEEP)} className="dial__track" />
        {frac > 0.001 && <path d={arc(c, c, r, START, angle)} className="dial__value" stroke={`url(#g${gid})`} />}
        <circle cx={c} cy={c} r={66} fill={`url(#f${gid})`} className="dial__face" />
        {curPos && <circle cx={curPos.x} cy={curPos.y} r={3.5} className="dial__current" />}
        <circle cx={knob.x} cy={knob.y} r={10} className="dial__knob" />
      </svg>
      <div className="dial__center" aria-hidden="true">
        <span className="dial__caption">{caption ?? "Nastavené"}</span>
        <span className="dial__value-text">
          {whole}
          <small>,{dec}</small>
          <sup>°C</sup>
        </span>
        {current != null && (
          <span className="dial__current-text">
            <Icon name="thermo" size={14} /> {current.toFixed(1).replace(".", ",")} °C
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
