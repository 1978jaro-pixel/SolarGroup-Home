import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { clamp, roundToStep } from "../utils/format";
import { Icon, type IconName } from "./Icon";

/**
 * Jednotný kruhový regulátor (dizajn č. 8) pre klimatizáciu aj kúrenie.
 *
 * Čisto grafický komponent – nevie nič o zariadeniach. Hodnotu mení ťahaním po prstenci,
 * klávesnicou alebo tlačidlami −/+ a výsledok ohlási cez ``onCommit``.
 * Farebný akcent určuje režim: chladenie (modrá), kúrenie (oranžová), útlm (tlmená modrá),
 * ECO (zelená), vypnuté (sivá).
 */

export type ThermostatAccent = "cool" | "heat" | "setback" | "eco" | "off";

const START = 135;
const SWEEP = 270;
const C = 100;
const R = 80;

function polar(deg: number, r = R) {
  const rad = (deg * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
}

function arc(from: number, to: number, r = R) {
  const a = polar(from, r);
  const b = polar(to, r);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

const nf = new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export interface ThermostatProps {
  value: number;
  current?: number | null;
  min: number;
  max: number;
  step?: number;
  accent: ThermostatAccent;
  /** Ikona režimu nad hodnotou (vločka, plameň, list…) */
  icon?: IconName;
  /** Popis režimu pod hodnotou (Chladenie, Auto, Útlm…) */
  modeLabel?: string;
  label: string;
  /** Maximálna veľkosť v px – komponent sa zmenší podľa šírky kontajnera. */
  size?: number;
  disabled?: boolean;
  /** Príkaz sa práve odosiela – hodnota ešte nie je potvrdená zariadením. */
  pending?: boolean;
  /** Zmena kľúča vráti zobrazenú hodnotu na ``value`` (napr. po neúspešnom príkaze). */
  resetKey?: number;
  onCommit?: (v: number) => void;
}

export function Thermostat({
  value,
  current,
  min,
  max,
  step = 0.5,
  accent,
  icon,
  modeLabel,
  label,
  size = 300,
  disabled,
  pending,
  resetKey = 0,
  onCommit,
}: ThermostatProps) {
  const [draft, setDraft] = useState(value);
  const dragging = useRef(false);
  const lastSent = useRef(value);
  const svgRef = useRef<SVGSVGElement>(null);
  const gid = useId().replace(/:/g, "");

  useEffect(() => {
    lastSent.current = value;
    if (!dragging.current) setDraft(value);
  }, [value, resetKey]);

  const frac = (clamp(draft, min, max) - min) / (max - min);
  const angle = START + SWEEP * frac;
  const knob = polar(angle);

  const fromPointer = (e: PointerEvent) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return draft;
    let a = (Math.atan2(e.clientY - (box.top + box.height / 2), e.clientX - (box.left + box.width / 2)) * 180) / Math.PI;
    a = (a - START + 720) % 360;
    if (a > SWEEP) a = a > SWEEP + (360 - SWEEP) / 2 ? 0 : SWEEP;
    return clamp(roundToStep(min + (a / SWEEP) * (max - min), step), min, max);
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
    // ťahať sa dá iba po prstenci – stred necháva priestor na posúvanie stránky
    const box = svgRef.current!.getBoundingClientRect();
    const dist = Math.hypot(e.clientX - (box.left + box.width / 2), e.clientY - (box.top + box.height / 2)) / (box.width / 200);
    if (dist < R - 26) return;
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDraft(fromPointer(e));
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

  const [whole, dec] = nf.format(draft).split(",");

  return (
    <div className={`thermo thermo--${accent} ${disabled ? "is-disabled" : ""} ${pending ? "is-pending" : ""}`} style={{ ["--t-max" as string]: `${size}px` }}>
      <svg
        ref={svgRef}
        viewBox="0 0 200 200"
        className="thermo__svg"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={draft}
        aria-valuetext={`${nf.format(draft)} °C`}
        aria-disabled={disabled || undefined}
        aria-busy={pending || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => dragging.current && setDraft(fromPointer(e))}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          commit(fromPointer(e));
        }}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={onKey}
      >
        <defs>
          <linearGradient id={`v${gid}`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" className="thermo__s1" />
            <stop offset="1" className="thermo__s2" />
          </linearGradient>
          <radialGradient id={`f${gid}`} cx="50%" cy="38%" r="62%">
            <stop offset="0" stopColor="#253043" />
            <stop offset="0.75" stopColor="#141b27" />
            <stop offset="1" stopColor="#0e141e" />
          </radialGradient>
          <filter id={`b${gid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {/* drážka prstenca (3D: tmavý žľab so svetlou hranou) */}
        <path d={arc(START, START + SWEEP)} className="thermo__groove" />
        <path d={arc(START, START + SWEEP)} className="thermo__scale" stroke={`url(#v${gid})`} />
        {frac > 0.002 && (
          <>
            <path d={arc(START, angle)} className="thermo__glow" stroke={`url(#v${gid})`} filter={`url(#b${gid})`} />
            <path d={arc(START, angle)} className="thermo__value" stroke={`url(#v${gid})`} />
          </>
        )}
        {/* vnútorný disk */}
        <circle cx={C} cy={C} r={R - 15} fill={`url(#f${gid})`} className="thermo__disc" />
        {/* jazdec */}
        <circle cx={knob.x} cy={knob.y + 1.5} r={9.5} className="thermo__knob-shadow" />
        <circle cx={knob.x} cy={knob.y} r={9} className="thermo__knob" />
      </svg>

      <div className="thermo__center" aria-hidden="true">
        {icon && <Icon name={icon} size={22} className="thermo__icon" filled={icon === "flame"} />}
        <span className="thermo__value-text">
          {whole}
          <small>,{dec}</small>
          <sup>°C</sup>
        </span>
        {modeLabel && <span className="thermo__mode">{pending ? "Odosiela sa…" : modeLabel}</span>}
        {current != null && <span className="thermo__current">Aktuálna {nf.format(current)} °C</span>}
      </div>

      <button type="button" className="thermo__btn thermo__btn--minus" aria-label="Znížiť teplotu" disabled={disabled || draft <= min} onClick={() => commit(draft - step)}>
        <Icon name="minus" size={22} />
      </button>
      <button type="button" className="thermo__btn thermo__btn--plus" aria-label="Zvýšiť teplotu" disabled={disabled || draft >= max} onClick={() => commit(draft + step)}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  );
}

export interface ModeTile<T extends string> {
  value: T;
  label: string;
  icon: IconName;
  accent?: ThermostatAccent;
}

/** Rad dlaždíc režimov (Auto, Chladenie, Kúrenie…) pod regulátorom. */
export function ModeTiles<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T | null;
  options: ModeTile<T>[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="mode-tiles" role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          className={`mode-tile mode-tile--${o.accent ?? "cool"} ${o.value === value ? "is-active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          <Icon name={o.icon} size={22} filled={o.icon === "flame"} />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
