import type { ReactNode } from "react";
import backdropImg from "../assets/design/backdrop.webp";
import weatherImg from "../assets/design/weather-zilina.webp";
import { Link } from "react-router-dom";
import { PvScene } from "../components/HouseScene";
import { WeatherArt } from "../components/WeatherArt";
import { Card, ReadingView, StatusBadge, Toggle } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { weatherInfo, weekdayName } from "../utils/format";
import { ClimateThermostat, type ClimateCtl } from "./Climate";
import { HeatingDayNight, HeatingThermostat, type HeatingCtl } from "./Heating";
import { BlindsCard, CalendarCard, CamerasCard, ConsumptionCard, IntercomCard, LightsCard } from "./Home";
import { RadioCard } from "./Radio";
import { useWeather } from "./Weather";

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

function weatherTone(code: number): string {
  const icon = weatherInfo(code).icon;
  return icon === "sun" || icon === "partly" ? "clear" : icon === "rain" || icon === "storm" ? "rain" : icon === "snow" ? "snow" : "cloud";
}

function WeatherBoard() {
  const r = useWeather();
  const w = r.data?.data;
  return (
    <Card title="Žilina" icon="pin" to="/pocasie" expand className={`bcard bcard--weather ${w ? `is-${weatherTone(w.code)}` : ""}`} badge={badge(r.data)}>
      <img className="bcard__bg" src={weatherImg} alt="" draggable={false} />
      <ReadingView reading={r.data} error={r.error} loading={r.loading}>
        {(w) => (
          <>
            <div className="bw-now">
              <span className="bw-now__temp">{Math.round(w.temp)}°</span>
              <span className="bw-now__label">{weatherInfo(w.code).label}</span>
            </div>
            <ul className="bw-forecast">
              {w.daily.slice(0, 4).map((d) => (
                <li key={d.date}>
                  <span>{weekdayName(d.date)}</span>
                  <span>
                    {Math.round(d.temp_max)}° / {Math.round(d.temp_min)}°
                  </span>
                  <WeatherArt code={d.code} size={40} />
                </li>
              ))}
            </ul>
          </>
        )}
      </ReadingView>
    </Card>
  );
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
        <WeatherBoard />
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
