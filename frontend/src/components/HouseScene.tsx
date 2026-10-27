import type { CSSProperties } from "react";
import house1651 from "../assets/design/solar-house-1651.webp";
import house826 from "../assets/design/solar-house-826.webp";
import type { EnergySnapshot } from "../api/types";

/**
 * Schválený solárny dom (biely dom, sedlová strecha s panelmi, menič, batéria, garáž, sivé Porsche
 * Taycan a wallbox) – statický obrázok bez hodnôt a textov. Energetické toky sú samostatná SVG vrstva
 * nad obrázkom: zobrazia sa iba pri skutočnom výkone, smer a rýchlosť pohybu zodpovedajú údajom.
 * Súradnice trás sú v pixeloch zdrojového obrázka (1651 × 953), takže vrstva sedí pri každej veľkosti.
 */

const W = 1651;
const H = 953;
/** Pod touto hodnotou (kW) sa tok považuje za nulový. */
const IDLE_KW = 0.05;

interface Flow {
  id: "pv" | "house" | "battery" | "grid" | "ev";
  /** Trasa v smere „kladného“ toku. */
  d: string;
  /** Kladný výkon tečie v smere trasy, záporný proti nej. */
  kw: number | null;
}

/** Rýchlosť pohybu: väčší výkon = rýchlejšie (0,7 – 2,6 s na cyklus). */
export function flowDuration(kw: number): number {
  return Math.max(0.7, Math.min(2.6, 2.6 - Math.log2(1 + Math.abs(kw)) * 0.5));
}

export function flows(d: EnergySnapshot | null): Flow[] {
  return [
    // panely → menič (zvod zo strechy)
    { id: "pv", d: "M780 364 L780 488", kw: d ? d.pv_kw : null },
    // menič → dom
    { id: "house", d: "M720 556 L482 556", kw: d ? d.house_kw : null },
    // menič → batéria (kladné = nabíjanie)
    { id: "battery", d: "M842 556 L976 556", kw: d ? d.battery_kw : null },
    // sieť → menič (kladné = odber zo siete, záporné = dodávka)
    { id: "grid", d: "M780 724 L780 604", kw: d ? d.grid_kw : null },
    // wallbox → auto (nabíjací kábel)
    { id: "ev", d: "M1507 612 C1512 660 1506 690 1468 694", kw: d ? d.ev_kw : null },
  ];
}

export function HouseScene({ data, className = "", label }: { data: EnergySnapshot | null; className?: string; label?: string }) {
  return (
    <div className={`house-scene ${className}`}>
      <img
        className="house-scene__img"
        src={house826}
        srcSet={`${house826} 826w, ${house1651} 1651w`}
        sizes="(max-width: 1100px) 45vw, 60vw"
        width={W}
        height={H}
        alt={label ?? "Dom so solárnymi panelmi, meničom, batériou, garážou, autom a wallboxom"}
        draggable={false}
      />
      <svg className="house-scene__flows" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {flows(data).map((f) => {
          const active = f.kw != null && Math.abs(f.kw) >= IDLE_KW;
          const style = active ? ({ "--flow-dur": `${flowDuration(f.kw!).toFixed(2)}s` } as CSSProperties) : undefined;
          return (
            <g key={f.id} className={`flow flow--${f.id} ${active ? "is-active" : ""} ${active && f.kw! < 0 ? "is-reverse" : ""}`} style={style} data-flow={f.id}>
              <path d={f.d} className="flow__duct" />
              {active && (
                <>
                  <path d={f.d} className="flow__glow" />
                  <path d={f.d} className="flow__core" />
                  <path d={f.d} className="flow__pulse" />
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
