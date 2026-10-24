import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Reading } from "../api/types";
import { formatDateTime } from "../utils/format";
import { Icon, type IconName } from "./Icon";

export function Card({
  title,
  icon,
  to,
  badge,
  className = "",
  children,
  accent,
}: {
  title?: string;
  icon?: IconName;
  to?: string;
  badge?: ReactNode;
  className?: string;
  children: ReactNode;
  accent?: "blue" | "teal" | "warm";
}) {
  return (
    <section className={`card ${accent ? `card--${accent}` : ""} ${className}`}>
      {title && (
        <header className="card__head">
          {icon && (
            <span className="card__icon">
              <Icon name={icon} size={20} />
            </span>
          )}
          <h2 className="card__title">{title}</h2>
          <span className="card__badge">{badge}</span>
          {to && (
            <Link to={to} className="card__more" aria-label={`Otvoriť ${title}`}>
              <Icon name="chevron" size={18} />
            </Link>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

/** Označenie stavu údajov: DEMO, OFFLINE, zastarané, nedostupné. */
export function StatusBadge({ reading, compact = false }: { reading: Pick<Reading<unknown>, "status" | "source" | "updated_at" | "message"> | null; compact?: boolean }) {
  if (!reading) return null;
  const { status, source, updated_at } = reading;
  if (status === "offline")
    return (
      <span className="badge badge--danger" title={reading.message ?? undefined}>
        <Icon name="offline" size={14} /> OFFLINE
        {!compact && updated_at && <span className="badge__sub">· posledné {formatDateTime(updated_at)}</span>}
      </span>
    );
  if (status === "unavailable")
    return (
      <span className="badge badge--muted" title={reading.message ?? undefined}>
        <Icon name="info" size={14} /> Nedostupné
      </span>
    );
  if (status === "stale")
    return (
      <span className="badge badge--warn">
        <Icon name="alert" size={14} /> {compact ? "Zastarané" : `Aktualizované ${formatDateTime(updated_at)}`}
      </span>
    );
  if (source === "demo")
    return (
      <span className="badge badge--demo" title="Simulované údaje">
        DEMO
      </span>
    );
  return null;
}

/** Zobrazí obsah iba ak sú k dispozícii skutočné (alebo DEMO) údaje; inak poctivý prázdny stav. */
export function ReadingView<T>({
  reading,
  error,
  loading,
  children,
}: {
  reading: Reading<T> | null | undefined;
  error?: { message: string } | null;
  loading?: boolean;
  children: (data: T, reading: Reading<T>) => ReactNode;
}) {
  if (error && !reading) return <EmptyState icon="offline" title="OFFLINE" text={error.message} tone="danger" />;
  if (!reading) return loading ? <div className="skeleton" aria-busy="true" /> : null;
  if (reading.data == null)
    return (
      <EmptyState
        icon={reading.status === "offline" ? "offline" : "info"}
        title={reading.status === "offline" ? "OFFLINE" : "Údaje nie sú k dispozícii"}
        text={
          (reading.message ?? "") +
          (reading.status === "offline" && reading.updated_at ? ` · posledná aktualizácia ${formatDateTime(reading.updated_at)}` : "")
        }
        tone={reading.status === "offline" ? "danger" : "muted"}
      />
    );
  return <>{children(reading.data, reading)}</>;
}

export function EmptyState({ icon, title, text, tone = "muted" }: { icon: IconName; title: string; text?: string; tone?: "muted" | "danger" }) {
  return (
    <div className={`empty empty--${tone}`}>
      <Icon name={icon} size={26} />
      <div>
        <strong>{title}</strong>
        {text && <p>{text}</p>}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? "is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__thumb" />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          className={o.value === value ? "is-active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={18} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  onChange,
  onCommit,
  min = 0,
  max = 100,
  step = 1,
  label,
  suffix = "%",
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  suffix?: string;
  disabled?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider">
      <span className="sr-only">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ "--pct": `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
      />
      <output>
        {value}
        {suffix}
      </output>
    </label>
  );
}

export function Stat({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="stat">
      <span className="stat__label">
        {color && <i className="dot" style={{ background: color }} />}
        {label}
      </span>
      <span className="stat__value">{value}</span>
      {sub && <span className="stat__sub">{sub}</span>}
    </div>
  );
}

export function PageHeader({ title, subtitle, badge, back = true }: { title: string; subtitle?: string; badge?: ReactNode; back?: boolean }) {
  return (
    <div className="page-head">
      {back && (
        <Link to="/" className="icon-btn" aria-label="Späť na Môj domov">
          <Icon name="back" />
        </Link>
      )}
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-head__sub">{subtitle}</p>}
      </div>
      <div className="page-head__badge">{badge}</div>
    </div>
  );
}

export function IntegrationNote({ name, text }: { name: string; text: string }) {
  return (
    <div className="integration-note">
      <Icon name="plug" size={18} />
      <div>
        <strong>{name}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
