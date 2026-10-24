import type { ReactNode } from "react";
import houseImg from "../assets/design/house.webp";
import type { EnergySnapshot } from "../api/types";

/**
 * Fotovoltika podľa schváleného návrhu: 3D dom so solárnymi panelmi, batériou, garážou
 * a nabíjačkou elektromobilu. Hodnoty sa dopĺňajú zo živých údajov – bez údajov sa zobrazí „–“.
 */

const nf1 = new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Value({ kw }: { kw: number | null }) {
  if (kw == null) return <span className="pv-label__value">–</span>;
  const abs = Math.abs(kw);
  return (
    <span className="pv-label__value">
      {abs < 1 ? Math.round(abs * 1000) : nf1.format(abs)}
      <small>{abs < 1 ? "W" : "kW"}</small>
    </span>
  );
}

function Label({ cls, label, kw, extra, line }: { cls: string; label: string; kw: number | null; extra?: ReactNode; line?: "blue" | "green" }) {
  return (
    <div className={`pv-label ${cls}`}>
      <span className="pv-label__name">{label}</span>
      <span className="pv-label__row">
        <Value kw={kw} />
        {extra}
      </span>
      {line && <i className={`pv-label__line pv-label__line--${line}`} />}
    </div>
  );
}

export function SolarScene({ data }: { data: EnergySnapshot | null }) {
  const d = data;
  const batDir = d ? (d.battery_kw > 0.05 ? " · nabíja" : d.battery_kw < -0.05 ? " · vybíja" : "") : "";
  const gridDir = d ? (d.grid_kw > 0.05 ? " · odber" : d.grid_kw < -0.05 ? " · dodávka" : "") : "";
  return (
    <div className={`pv-scene ${d ? "" : "is-empty"}`}>
      <img src={houseImg} alt="Dom so solárnymi panelmi, batériou, garážou a nabíjačkou elektromobilu" className="pv-scene__img" draggable={false} />
      <Label cls="pv-label--solar" label="Výroba" kw={d?.pv_kw ?? null} line="blue" />
      <Label
        cls="pv-label--battery"
        label={`Batéria${batDir}`}
        kw={d?.battery_kw ?? null}
        extra={d && <span className="pv-label__soc">{Math.round(d.battery_soc)}%</span>}
        line="green"
      />
      <Label cls="pv-label--home" label="Dom" kw={d?.house_kw ?? null} />
      <Label cls="pv-label--grid" label={`Sieť${gridDir}`} kw={d?.grid_kw ?? null} />
      <Label cls="pv-label--charger" label={d && !d.ev_connected ? "Nabíjačka · voľná" : "Nabíjačka"} kw={d?.ev_kw ?? null} />
    </div>
  );
}
