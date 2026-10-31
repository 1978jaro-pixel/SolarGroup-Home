import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { EnergySample } from "../api/types";
import { formatSignedPower, formatTime } from "../utils/format";

type Key = "pv_kw" | "house_kw" | "grid_kw" | "battery_kw";

const SERIES: { key: Key; label: string; color: string; area?: boolean }[] = [
  { key: "pv_kw", label: "Výroba FV", color: "var(--c-pv)", area: true },
  { key: "house_kw", label: "Spotreba", color: "var(--c-house)" },
  { key: "battery_kw", label: "Batéria (+ nabíjanie)", color: "var(--c-battery)" },
  { key: "grid_kw", label: "Sieť (+ odber)", color: "var(--c-grid)" },
];

const PAD = { l: 44, r: 12, t: 12, b: 26 };

/** Denný priebeh výkonov (jedna os v kW) s krížovým kurzorom a tabuľkovým pohľadom. */
export function EnergyChart({ samples, height = 260, series = SERIES.map((s) => s.key), showTable = true }: { samples: EnergySample[]; height?: number; series?: Key[]; showTable?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);

  // Šírka grafu podľa kontajnera – text a čiary sa nedeformujú.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);
  const active = SERIES.filter((s) => series.includes(s.key));

  const { x, y, ticksY, dayStart } = useMemo(() => {
    const first = samples[0] ? new Date(samples[0].ts) : new Date();
    const ds = new Date(first);
    ds.setHours(0, 0, 0, 0);
    let lo = 0;
    let hi = 1;
    for (const s of samples) for (const a of active) {
      lo = Math.min(lo, s[a.key]);
      hi = Math.max(hi, s[a.key]);
    }
    const step = hi - lo > 8 ? 2 : 1;
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const ih = height - PAD.t - PAD.b;
    const iw = W - PAD.l - PAD.r;
    const xf = (ts: string) => PAD.l + ((new Date(ts).getTime() - ds.getTime()) / 86400000) * iw;
    const yf = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo)) * ih;
    const t: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) t.push(v);
    return { x: xf, y: yf, ticksY: t, dayStart: ds };
  }, [samples, height, series.join(), W]);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || samples.length === 0) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    let bd = Infinity;
    samples.forEach((s, i) => {
      const dd = Math.abs(x(s.ts) - px);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setHover(best);
  };

  if (samples.length === 0) return <p className="muted">Pre tento deň zatiaľ nie sú údaje.</p>;

  const line = (k: Key) => samples.map((s, i) => `${i ? "L" : "M"}${x(s.ts).toFixed(1)},${y(s[k]).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  const h = hover != null ? samples[hover] : null;
  const hx = h ? x(h.ts) : 0;

  return (
    <div className="chart">
      <div className="chart__top">
        <ul className="legend">
          {active.map((s) => (
            <li key={s.key}>
              <i style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
        {showTable && (
          <button type="button" className="link-btn" onClick={() => setTable((t) => !t)}>
            {table ? "Graf" : "Tabuľka"}
          </button>
        )}
      </div>
      {table ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Čas</th>
                {active.map((s) => (
                  <th key={s.key}>{s.label}</th>
                ))}
                <th>Batéria SoC</th>
              </tr>
            </thead>
            <tbody>
              {samples.filter((_, i) => i % 4 === 0).map((s) => (
                <tr key={s.ts}>
                  <td>{formatTime(s.ts)}</td>
                  {active.map((a) => (
                    <td key={a.key}>{s[a.key].toFixed(2)} kW</td>
                  ))}
                  <td>{Math.round(s.battery_soc)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart__plot" ref={boxRef}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${height}`}
            className="chart__svg"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label="Graf výkonov počas dňa"
          >
            <defs>
              <linearGradient id="pv-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--c-pv)" stopOpacity="0.35" />
                <stop offset="1" stopColor="var(--c-pv)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticksY.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className={t === 0 ? "chart__zero" : "chart__grid"} />
                <text x={PAD.l - 8} y={y(t) + 4} className="chart__axis" textAnchor="end">
                  {t}
                </text>
              </g>
            ))}
            {[0, 6, 12, 18, 24].map((hh) => {
              const ts = new Date(dayStart.getTime() + hh * 3600000).toISOString();
              return (
                <text key={hh} x={x(ts)} y={height - 6} className="chart__axis" textAnchor={hh === 0 ? "start" : hh === 24 ? "end" : "middle"}>
                  {hh}:00
                </text>
              );
            })}
            {active.map((s) =>
              s.area ? (
                <path key={`a${s.key}`} d={`${line(s.key)} L${x(samples[samples.length - 1].ts)},${zeroY} L${x(samples[0].ts)},${zeroY} Z`} fill="url(#pv-area)" />
              ) : null,
            )}
            {active.map((s) => (
              <path key={s.key} d={line(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
            ))}
            {h && <line x1={hx} x2={hx} y1={PAD.t} y2={height - PAD.b} className="chart__cross" />}
          </svg>
          {h && (
            <div className="chart__tip" style={{ left: `${(hx / W) * 100}%` }}>
              <strong>{formatTime(h.ts)}</strong>
              {active.map((s) => (
                <span key={s.key}>
                  <i style={{ background: s.color }} />
                  {s.label}: {formatSignedPower(h[s.key])}
                </span>
              ))}
              <span>Batéria: {Math.round(h.battery_soc)} %</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
