import type { CSSProperties, ReactNode } from "react";
import base1536 from "../assets/design/pv-house-white-1536.webp";
import base768 from "../assets/design/pv-house-white-768.webp";
import glowImg from "../assets/design/pv-house-white-glow.webp";
import type { EnergySnapshot, Reading } from "../api/types";
import { formatTime } from "../utils/format";

/**
 * Schválený solárny dom (biely dom, panely, striedač, batéria, garáž s bielym Porsche Taycan a wallboxom).
 *
 * Vrstvy:
 *  1. statický obrázok bez čísel – panely a vedenia v nesvietiacom stave,
 *  2. svietiace panely (výrez z originálu) – jas podľa výkonu FV,
 *  3. toky energie – statické vedenie (SVG, vykreslí sa raz) a plynulé tyrkysovo-zelené svetlo ako samostatný
 *     prvok posúvaný cez `transform` (animácia beží na GPU kompozítore bez prekresľovania – šetrí Raspberry Pi 4);
 *     iba pri skutočnom výkone, smer podľa znamienka,
 *  4. hodnoty (HTML) rozložené okolo domu presne ako na schválenom obrázku.
 * Súradnice sú v pixeloch zdrojového obrázka 1536 × 1024, takže všetko sedí pri každej veľkosti.
 */

const W = 1536;
const H = 1024;
/** Pod touto hodnotou (kW) je tok neaktívny. */
export const IDLE_KW = 0.05;
/** Výrez vrstvy svietiacich panelov (tools/design/e5/house_white.py → pv-house-white.json). */
const GLOW = { x: 398, y: 202, w: 667, h: 199 };

export type FlowId = "pv" | "house" | "battery" | "grid" | "ev";

interface Flow {
  id: FlowId;
  /** Trasa v smere kladného toku. */
  d: string;
  /** Začiatok a koniec svetla (priamka v smere kladného toku). */
  a: [number, number];
  b: [number, number];
  kw: number | null;
}

/**
 * Trvanie jedného prebehnutia svetla: väčší výkon = rýchlejšie (1,2 – 4 s), zaokrúhlené na 0,4 s,
 * aby sa animácia pri každej aktualizácii údajov (každé 3 s) zbytočne neprepočítavala.
 */
export function flowDuration(kw: number): number {
  const raw = Math.max(1.2, Math.min(4, 4 - Math.log2(1 + Math.abs(kw)) * 0.75));
  return Number((Math.round(raw / 0.4) * 0.4).toFixed(1));
}

export function flows(d: EnergySnapshot | null): Flow[] {
  return [
    // panely → striedač (zvod zo strechy)
    { id: "pv", d: "M723.6 384.5 L723.6 509.1", a: [723.6, 384.5], b: [723.6, 509.1], kw: d ? d.pv_kw : null },
    // striedač → dom
    { id: "house", d: "M683 562.2 L496.6 570.9", a: [683, 562.2], b: [496.6, 570.9], kw: d ? d.house_kw : null },
    // striedač → batéria (kladné = nabíjanie)
    { id: "battery", d: "M774.8 557.4 L885.9 552.6", a: [774.8, 557.4], b: [885.9, 552.6], kw: d ? d.battery_kw : null },
    // sieť → striedač (kladné = odber, záporné = dodávka)
    { id: "grid", d: "M717.8 707.1 L717.8 610.5", a: [717.8, 707.1], b: [717.8, 610.5], kw: d ? d.grid_kw : null },
    // wallbox → auto (nabíjací kábel)
    { id: "ev", d: "M1273.2 589.3 Q1287.6 605 1311.8 622.3", a: [1273.2, 589.3], b: [1311.8, 622.3], kw: d ? d.ev_kw : null },
  ];
}

/** Jas svietiacich panelov 0–1 podľa výkonu FV (bez výroby panely nesvietia). */
export function panelGlow(pvKw: number | null | undefined): number {
  if (pvKw == null || pvKw < IDLE_KW) return 0;
  return Math.min(1, 0.35 + pvKw / 10);
}

const nf1 = new Intl.NumberFormat("sk-SK", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Power({ kw }: { kw: number | null }) {
  if (kw == null) return <span className="pvs-val">–</span>;
  const a = Math.abs(kw);
  return (
    <span className="pvs-val">
      {a < 1 ? Math.round(a * 1000) : nf1.format(a)}
      <small>{a < 1 ? " W" : " kW"}</small>
    </span>
  );
}

function Label({ id, name, kw, extra, x, y, align }: { id: FlowId; name: string; kw: number | null; extra?: ReactNode; x: number; y: number; align: "start" | "center" }) {
  return (
    <div className={`pvs-lab pvs-lab--${id} pvs-lab--${align}`} style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }} data-label={id}>
      <span className="pvs-name">{name}</span>
      <span className="pvs-row">
        <Power kw={kw} />
        {extra}
      </span>
    </div>
  );
}

const dir = (kw: number | undefined, pos: string, neg: string) => (kw == null ? "" : kw > IDLE_KW ? ` · ${pos}` : kw < -IDLE_KW ? ` · ${neg}` : "");

export function PvScene({ reading, className = "" }: { reading: Reading<EnergySnapshot> | null | undefined; className?: string }) {
  // OFFLINE / zastarané / nedostupné: žiadne staré hodnoty ani toky
  const live = reading?.status === "ok" && reading.data ? reading.data : null;
  const glow = panelGlow(live?.pv_kw);
  const offline = !live;
  const active = flows(live).filter((f) => f.kw != null && Math.abs(f.kw) >= IDLE_KW);
  return (
    <div className={`pvs ${offline ? "is-offline" : ""} ${className}`}>
      <img
        className="pvs-img"
        src={base768}
        srcSet={`${base768} 768w, ${base1536} 1536w`}
        sizes="(max-width: 1100px) 50vw, 70vw"
        width={W}
        height={H}
        alt="Dom so solárnymi panelmi, striedačom, batériou, garážou, autom a wallboxom"
        draggable={false}
      />
      <img
        className="pvs-glow"
        src={glowImg}
        alt=""
        draggable={false}
        style={{ left: `${(GLOW.x / W) * 100}%`, top: `${(GLOW.y / H) * 100}%`, width: `${(GLOW.w / W) * 100}%`, opacity: glow }}
        data-glow={glow.toFixed(2)}
      />
      <svg className="pvs-flows" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {active.map((f) => (
          <g key={f.id} className={`pvf ${f.kw! < 0 ? "is-reverse" : ""}`} data-flow={f.id}>
            <path d={f.d} className="pvf-glow" />
            <path d={f.d} className="pvf-core" />
          </g>
        ))}
      </svg>
      {active.map((f) => {
        const [x1, y1] = f.a;
        const [x2, y2] = f.b;
        const style = {
          left: `${(x1 / W) * 100}%`,
          top: `${(y1 / H) * 100}%`,
          width: `${(Math.hypot(x2 - x1, y2 - y1) / W) * 100}%`,
          transform: `translateY(-50%) rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)`,
          "--flow-dur": `${flowDuration(f.kw!).toFixed(1)}s`,
        } as CSSProperties;
        return (
          <span key={f.id} className={`pvl ${f.kw! < 0 ? "is-reverse" : ""}`} style={style} data-light={f.id} aria-hidden="true">
            <i />
          </span>
        );
      })}
      <Label id="pv" name="Výroba" kw={live?.pv_kw ?? null} x={459} y={15} align="center" />
      <Label
        id="battery"
        name={`Batéria${dir(live?.battery_kw, "nabíja", "vybíja")}`}
        kw={live?.battery_kw ?? null}
        extra={
          live && (
            <span className="pvs-val pvs-soc">
              {Math.round(live.battery_soc)}
              <small> %</small>
            </span>
          )
        }
        x={974}
        y={15}
        align="start"
      />
      <Label id="house" name="Dom" kw={live?.house_kw ?? null} x={384} y={870} align="center" />
      <Label id="grid" name={`Sieť${dir(live?.grid_kw, "odber", "dodávka")}`} kw={live?.grid_kw ?? null} x={773} y={870} align="center" />
      <Label id="ev" name="Nabíjačka" kw={live?.ev_kw ?? null} x={1216} y={870} align="center" />
      {offline && (
        <div className="pvs-offline" role="status">
          <strong>{reading?.status === "stale" ? "Údaje nie sú aktuálne" : reading ? "OFFLINE" : "Načítava sa…"}</strong>
          {reading && <span>{reading.updated_at ? `Posledné údaje ${formatTime(reading.updated_at)}` : (reading.message ?? "Fotovoltika nie je pripojená")}</span>}
        </div>
      )}
    </div>
  );
}
