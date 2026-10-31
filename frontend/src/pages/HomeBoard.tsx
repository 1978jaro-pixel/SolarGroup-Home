import type { ReactNode } from "react";
import backdropImg from "../assets/design/backdrop.webp";
import { Link } from "react-router-dom";
import { PvScene } from "../components/HouseScene";
import { Card, ReadingView, StatusBadge, Toggle } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { ClimateThermostat, type ClimateCtl } from "./Climate";
import { HeatingDayNight, HeatingThermostat, type HeatingCtl } from "./Heating";
import { CalendarCard } from "./Calendar";
import { BlindsCard, CamerasCard, ConsumptionCard, IntercomCard, LightsCard } from "./Home";
import { RadioCard } from "./Radio";
import { WeatherCard } from "./Weather";

/**
 * Hlavná obrazovka podľa schváleného návrhu „Môj domov“ – pevné, deterministické rozloženie:
 *
 *   ┌──────────────┬─────────┬─────────┬─────────┐
 *   │ Počasie      │ Klíma   │ Kúrenie │ Rolety  │
 *   │              ├─────────┼─────────┼─────────┤
 *   ├──────────────┤ Svetlá  │ Kamery  │ Vrátnik │
 *   │ Fotovoltika  ├─────────┼─────────┼─────────┤
 *   │              │ Hudba   │ Kalendár│ Spotreba│
 *   └──────────────┴─────────┴─────────┴─────────┘
 *
 * Platí pre každý displej na šírku (7" 1024 × 600 až 15" Full HD a viac). Veľkosti sa odvodzujú
 * od rozmerov bunky (container queries), nie zo zoomu – text ostáva ostrý.
 */

const badge = (r: Parameters<typeof StatusBadge>[0]["reading"]) => <StatusBadge reading={r} compact hideDemo />;

function Cell({ area, children }: { area: string; children: ReactNode }) {
  return <div className={`board__cell board__cell--${area}`}>{children}</div>;
}

/** Karta Fotovoltika: schválený dom s hodnotami, bez nadpisu; celá karta otvorí detail. */
function SolarBoard() {
  const { energy } = useApp();
  return (
    <Link to="/fotovoltika" className="card bcard bcard--pv" aria-label="Fotovoltika – otvoriť detail">
      <PvScene reading={energy} />
    </Link>
  );
}

function ClimateBoard({ c, open }: { c: ClimateCtl; open: () => void }) {
  const r = c.data?.[0];
  const s = r?.data;
  return (
    <Card
      title="Klíma"
      icon="thermo"
      onOpen={open}
      className="bcard bcard--thermo"
      badge={badge(r ?? null)}
      actions={s && <Toggle label="Zapnúť alebo vypnúť klimatizáciu" checked={s.power} disabled={c.busy === s.device_id} onChange={(power) => void c.send(s.device_id, { power })} />}
    >
      <ReadingView reading={r} error={c.error} loading={c.loading}>
        {(s) => (
          <div className="bthermo">
            <ClimateThermostat c={c} s={s} size={240} onCenterTap={open} />
          </div>
        )}
      </ReadingView>
      {c.cmdError && <p className="card-error">{c.cmdError}</p>}
    </Card>
  );
}

function HeatingBoard({ h, open }: { h: HeatingCtl; open: () => void }) {
  const r = h.data?.[0];
  return (
    <Card title="Kúrenie" icon="heat" onOpen={open} className="bcard bcard--thermo bcard--heating" badge={badge(r ?? null)}>
      <ReadingView reading={r} error={h.error} loading={h.loading}>
        {(s) => (
          <>
            <div className="bthermo">
              <HeatingThermostat h={h} s={s} size={240} onCenterTap={open} />
            </div>
            <HeatingDayNight h={h} s={s} />
          </>
        )}
      </ReadingView>
      {h.cmdError && <p className="card-error">{h.cmdError}</p>}
    </Card>
  );
}

export function HomeBoard({ climate, heating, openClimate, openHeating }: { climate: ClimateCtl; heating: HeatingCtl; openClimate: () => void; openHeating: () => void }) {
  return (
    <div className="board" style={{ "--board-bg": `url(${backdropImg})` } as React.CSSProperties}>
      <Cell area="weather">
        <WeatherCard />
      </Cell>
      <Cell area="pv">
        <SolarBoard />
      </Cell>
      <Cell area="climate">
        <ClimateBoard c={climate} open={openClimate} />
      </Cell>
      <Cell area="heating">
        <HeatingBoard h={heating} open={openHeating} />
      </Cell>
      <Cell area="blinds">
        <BlindsCard />
      </Cell>
      <Cell area="lights">
        <LightsCard />
      </Cell>
      <Cell area="cameras">
        <CamerasCard />
      </Cell>
      <Cell area="intercom">
        <IntercomCard />
      </Cell>
      <Cell area="music">
        <RadioCard />
      </Cell>
      <Cell area="calendar">
        <CalendarCard />
      </Cell>
      <Cell area="consumption">
        <ConsumptionCard />
      </Cell>
    </div>
  );
}
