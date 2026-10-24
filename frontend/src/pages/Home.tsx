import { useId } from "react";
import { Link } from "react-router-dom";
import blindsImg from "../assets/design/blinds.webp";
import cameraImg from "../assets/design/camera.webp";
import doorImg from "../assets/design/door.webp";
import floorImg from "../assets/design/floor.webp";
import type { CameraInfo, EnergySample, Reading } from "../api/types";
import { Icon } from "../components/Icon";
import { SolarScene } from "../components/SolarScene";
import { ThermostatDial } from "../components/ThermostatDial";
import { WeatherArt, WeatherHero } from "../components/WeatherArt";
import { Card, EmptyState, ReadingView, StatusBadge, Toggle } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { useResource } from "../hooks/useResource";
import { dateParts, formatKwh, plural, weatherInfo, weekdayName } from "../utils/format";
import { meninyFor } from "../utils/meniny";
import { useBlindGroup, useBlinds } from "./Blinds";
import { useClimate } from "./Climate";
import { useHeating } from "./Heating";
import { useLights } from "./Lights";
import { useWeather } from "./Weather";

const badge = (r: Parameters<typeof StatusBadge>[0]["reading"]) => <StatusBadge reading={r} compact hideDemo />;

function WeatherCard() {
  const r = useWeather();
  return (
    <Card title="Žilina" icon="pin" to="/pocasie" expand className="card--weather" badge={badge(r.data)}>
      <ReadingView reading={r.data} error={r.error} loading={r.loading}>
        {(w) => (
          <>
            <div className="weather-main">
              <div>
                <span className="weather-main__temp">{Math.round(w.temp)}°</span>
                <span className="weather-main__label">{weatherInfo(w.code).label}</span>
              </div>
              <WeatherHero code={w.code} />
            </div>
            <ul className="forecast">
              {w.daily.slice(0, 4).map((d) => (
                <li key={d.date}>
                  <span className="forecast__day">{weekdayName(d.date)}</span>
                  <span>
                    {Math.round(d.temp_max)}° / {Math.round(d.temp_min)}°
                  </span>
                  <WeatherArt code={d.code} size={44} />
                </li>
              ))}
            </ul>
          </>
        )}
      </ReadingView>
    </Card>
  );
}

function SolarCard() {
  const { energy } = useApp();
  const d = energy?.data ?? null;
  return (
    <Card title="Fotovoltika" icon="solar" to="/fotovoltika" expand className="card--pv" badge={badge(energy)}>
      <Link to="/fotovoltika" className="pv-link" aria-label="Fotovoltika – detail">
        <SolarScene data={d} />
      </Link>
      {!d && energy && energy.status !== "ok" && (
        <p className="pv-note">
          <Icon name="offline" size={16} /> {energy.message ?? "Údaje nie sú k dispozícii"}
        </p>
      )}
    </Card>
  );
}

function ClimateCard() {
  const c = useClimate();
  const r = c.data?.[0];
  const s = r?.data;
  return (
    <Card
      title="Klíma"
      icon="thermo"
      to="/klimatizacia"
      badge={badge(r ?? null)}
      actions={s && <Toggle label="Zapnúť alebo vypnúť klimatizáciu" checked={s.power} onChange={(power) => void c.send(s.device_id, { power })} />}
    >
      <ReadingView reading={r} error={c.error} loading={c.loading}>
        {(s) => (
          <div className="mini-dial">
            <ThermostatDial
              value={s.target_temp}
              min={16}
              max={31}
              size={200}
              variant="cool"
              label="Nastavená teplota klimatizácie"
              disabled={!s.power}
              caption={s.power ? "Požadovaná" : "Vypnutá"}
              onCommit={(v) => void c.send(s.device_id, { target_temp: v })}
            />
          </div>
        )}
      </ReadingView>
    </Card>
  );
}

function HeatingCard() {
  const h = useHeating();
  const r = h.data?.[0];
  return (
    <Card title="Kúrenie" icon="heat" to="/kurenie" badge={badge(r ?? null)}>
      <ReadingView reading={r} error={h.error} loading={h.loading}>
        {(s) => {
          // V režime Auto zvýrazníme práve aktívny program (deň/noc).
          const period = s.mode === "auto" ? (s.target_temp === s.night_temp && s.night_temp !== s.day_temp ? "night" : "day") : s.mode;
          return (
            <div className="mini-dial">
              <ThermostatDial
                value={s.target_temp}
                current={s.current_temp}
                size={165}
                variant="heat"
                label="Nastavená teplota kúrenia"
                disabled={s.mode === "off"}
                caption={s.mode === "off" ? "Vypnuté" : s.mode === "auto" ? "Požadovaná · Auto" : "Požadovaná"}
                onCommit={(v) => void h.send(s.device_id, { target_temp: v })}
              />
              <div className="daynight" role="radiogroup" aria-label="Program kúrenia">
                {(
                  [
                    ["day", "Deň", "sun"],
                    ["night", "Noc", "moon"],
                  ] as const
                ).map(([value, label, icon]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={period === value}
                    className={period === value ? "is-active" : ""}
                    onClick={() => void h.send(s.device_id, { mode: value })}
                  >
                    <Icon name={icon} size={20} filled={icon === "moon"} /> {label}
                  </button>
                ))}
              </div>
            </div>
          );
        }}
      </ReadingView>
    </Card>
  );
}

function BlindsCard() {
  const b = useBlinds();
  const { group } = useBlindGroup(b.refresh);
  const items = (b.data ?? []).filter((r) => r.data);
  const avg = items.length ? Math.round(items.reduce((a, r) => a + r.data!.position, 0) / items.length) : null;
  return (
    <Card title="Rolety" icon="blinds" to="/zaluzie" badge={badge(b.data?.[0] ?? null)}>
      <Link to="/zaluzie" className="media" aria-label="Žalúzie – detail">
        <img src={blindsImg} alt="" />
        {avg != null && <span className="media__chip">{avg} % otvorené</span>}
      </Link>
      <div className="split-btns">
        <button type="button" onClick={() => void group(100)} disabled={!items.length}>
          <Icon name="chevronUp" size={22} />
          Otvoriť
        </button>
        <button type="button" onClick={() => void group(0)} disabled={!items.length}>
          <Icon name="chevronDown" size={22} />
          Zatvoriť
        </button>
      </div>
    </Card>
  );
}

function LightsCard() {
  const l = useLights();
  const items = (l.data ?? []).filter((r) => r.data);
  const on = items.filter((r) => r.data!.on).length;
  return (
    <Card title="Svetlá" icon="bulb" to="/svetla" badge={badge(l.data?.[0] ?? null)}>
      <Link to="/svetla" className="media media--fill" aria-label="Svetlá – ovládanie podľa miestností">
        <img src={floorImg} alt="" />
        {items.length > 0 && (
          <span className="media__chip">
            <Icon name="bulb" size={14} /> {on} z {items.length} svieti
          </span>
        )}
      </Link>
    </Card>
  );
}

function CamerasCard() {
  const r = useResource<Reading<CameraInfo>[]>("/api/cameras", 60000);
  const cams = r.data ?? [];
  const streaming = cams.some((c) => c.data?.stream_available);
  const model = cams.find((c) => c.data?.model)?.data?.model;
  return (
    <Card
      title="Kamery"
      icon="camera"
      to="/kamery"
      badge={badge(cams[0] ?? null)}
      actions={<Toggle label="Živý obraz kamier" checked={streaming} onChange={() => undefined} disabled />}
    >
      <Link to="/kamery" className="cam-hero" aria-label="Kamery – detail">
        <img src={cameraImg} alt="Kamera Tapo" />
        <span className="cam-hero__model">Tapo {model ?? "C310"}</span>
      </Link>
      <Link to="/kamery" className="row-btn">
        <span>
          {cams.length} {plural(cams.length, "kamera", "kamery", "kamier")}
          {!streaming && <span className="row-btn__sub"> · obraz nepripojený</span>}
        </span>
        <Icon name="chevron" size={20} />
      </Link>
    </Card>
  );
}

function IntercomCard() {
  return (
    <Card title="Vrátnik" icon="doorbell" to="/videovratnik">
      <Link to="/videovratnik" className="media media--door" aria-label="Videovrátnik – detail">
        <img src={doorImg} alt="" />
      </Link>
      <Link to="/videovratnik" className="row-btn">
        <span className="row-btn__lead">
          <Icon name="phone" size={22} filled /> Vstup
        </span>
        <Icon name="chevron" size={20} />
      </Link>
    </Card>
  );
}

function MusicCard() {
  return (
    <Card title="Rádio a hudba" icon="music" to="/hudba">
      <div className="player">
        <div className="player__art" aria-hidden="true">
          <Icon name="music" size={34} />
        </div>
        <div className="player__info">
          <strong>Nič sa neprehráva</strong>
          <span>Prehrávač nie je pripojený</span>
          <div className="player__bar">
            <i style={{ width: "0%" }} />
          </div>
          <div className="player__times">
            <span>0:00</span>
            <span>–:––</span>
          </div>
        </div>
      </div>
      <div className="player__ctrl">
        <button type="button" aria-label="Predchádzajúca" disabled>
          <Icon name="prev" size={24} filled />
        </button>
        <button type="button" className="player__play" aria-label="Prehrať" disabled title="Prehrávač nie je pripojený">
          <Icon name="play" size={26} filled />
        </button>
        <button type="button" aria-label="Ďalšia" disabled>
          <Icon name="next" size={24} filled />
        </button>
      </div>
    </Card>
  );
}

function CalendarCard() {
  const now = new Date();
  const { weekday, day, month } = dateParts(now);
  const meniny = meninyFor(now);
  return (
    <Card title="Kalendár" icon="calendar" to="/kalendar">
      <div className="cal-today">
        <span>{weekday}</span>
        <strong>{day}</strong>
        <span>{month}</span>
      </div>
      <div className="cal-pill">{meniny ? `Meniny: ${meniny}` : "Dnes nemá meniny nikto"}</div>
    </Card>
  );
}

function ConsumptionChart({ samples }: { samples: EnergySample[] }) {
  const id = useId().replace(/:/g, "");
  // Hodinová spotreba v kWh zo štvrťhodinových výkonov.
  const hours = new Map<number, number>();
  for (const s of samples) {
    const h = new Date(s.ts).getHours();
    hours.set(h, (hours.get(h) ?? 0) + s.house_kw * 0.25);
  }
  const vals = [...hours.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  if (vals.length < 2) return null;
  const W = 300;
  const H = 90;
  const max = Math.max(...vals, 0.5) * 1.15;
  const pts = vals.map((v, i) => [(i / 23) * W, H - (v / max) * H] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const total = vals.reduce((a, b) => a + b, 0);
  return (
    <figure className="spark">
      <span className="spark__unit">kWh</span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Spotreba dnes po hodinách, spolu ${formatKwh(total)}`}>
        <defs>
          <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1f7bff" stopOpacity="0.45" />
            <stop offset="1" stopColor="#1f7bff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="spark__grid" />
        ))}
        <path d={`${line} L${pts[pts.length - 1][0]},${H} L0,${H} Z`} fill={`url(#sp${id})`} />
        <path d={line} className="spark__line" />
      </svg>
      <figcaption>
        <Icon name="clock" size={26} />
        <span>
          <strong>Dnes {formatKwh(total)}</strong>
          <span>Spotreba domu po hodinách</span>
        </span>
      </figcaption>
    </figure>
  );
}

function ConsumptionCard() {
  const r = useResource<Reading<EnergySample[]>>("/api/energy/history", 5 * 60000);
  const samples = r.data?.data ?? [];
  const chart = samples.length >= 8 ? <ConsumptionChart samples={samples} /> : null;
  return (
    <Card title="Spotreba" icon="bars" to="/energia" badge={badge(r.data)}>
      {chart ?? (
        <figure className="spark spark--empty">
          <span className="spark__unit">kWh</span>
          <svg viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden="true">
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1="0" x2="300" y1={90 * f} y2={90 * f} className="spark__grid" />
            ))}
          </svg>
          <figcaption>
            <Icon name="clock" size={26} />
            <span>
              <strong>Bez merania</strong>
              <span>{r.error ? "Server je nedostupný" : "Meranie zatiaľ nie je aktívne"}</span>
            </span>
          </figcaption>
        </figure>
      )}
    </Card>
  );
}

export function HomePage() {
  return (
    <div className="home">
      <div className="home__left">
        <WeatherCard />
        <SolarCard />
      </div>
      <div className="home__right">
        <div className="home__row home__row--a">
          <ClimateCard />
          <HeatingCard />
          <BlindsCard />
        </div>
        <div className="home__row home__row--b">
          <LightsCard />
          <CamerasCard />
          <IntercomCard />
        </div>
        <div className="home__row home__row--c">
          <MusicCard />
          <CalendarCard />
          <ConsumptionCard />
        </div>
      </div>
      {/* Upozornenie, keď server prestane odpovedať */}
      <EmptyStateFallback />
    </div>
  );
}

function EmptyStateFallback() {
  const { serverReachable } = useApp();
  if (serverReachable) return null;
  return <EmptyState icon="offline" title="Server je nedostupný" text="Zobrazené údaje nemusia byť aktuálne." tone="danger" />;
}
