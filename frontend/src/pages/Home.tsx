import { useId, useState } from "react";
import { Link } from "react-router-dom";
import blindsImg from "../assets/design/blinds.webp";
import cameraImg from "../assets/design/camera.webp";
import doorImg from "../assets/design/door.webp";
import floorImg from "../assets/design/floor.webp";
import type { CameraInfo, EnergySample, Reading } from "../api/types";
import { Icon } from "../components/Icon";
import { PvScene } from "../components/HouseScene";
import { WeatherArt, WeatherHero } from "../components/WeatherArt";
import { Card, EmptyState, ReadingView, StatusBadge } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { useResource } from "../hooks/useResource";
import { formatKwh, plural, weatherInfo, weekdayName } from "../utils/format";
import { useBlindGroup, useBlinds } from "./Blinds";
import { ClimateCard, ClimateModal, useClimate } from "./Climate";
import { HeatingCard, HeatingModal, useHeating } from "./Heating";
import { useLights } from "./Lights";
import { CalendarCard } from "./Calendar";
import { RadioCard } from "./Radio";
import { useWeather } from "./Weather";
import { HomeBoard } from "./HomeBoard";
import { useLayoutMode } from "../hooks/useLayoutMode";

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
  return (
    <Card title="Fotovoltika" icon="solar" to="/fotovoltika" expand className="card--pv" badge={badge(energy)}>
      <Link to="/fotovoltika" className="pv-link" aria-label="Fotovoltika – detail">
        <PvScene reading={energy} />
      </Link>
    </Card>
  );
}

export function BlindsCard() {
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

export function LightsCard() {
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

export function CamerasCard() {
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

export function IntercomCard() {
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

export function ConsumptionCard() {
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
  // Jedna inštancia stavu pre kartu aj detailné okno – zmeny sa prejavia v oboch.
  const climate = useClimate();
  const heating = useHeating();
  const [open, setOpen] = useState<"climate" | "heating" | null>(null);
  const layout = useLayoutMode();
  const modals = (
    <>
      {open === "climate" && <ClimateModal c={climate} onClose={() => setOpen(null)} />}
      {open === "heating" && <HeatingModal h={heating} onClose={() => setOpen(null)} />}
    </>
  );

  if (layout === "board") {
    return (
      <>
        <HomeBoard climate={climate} heating={heating} openClimate={() => setOpen("climate")} openHeating={() => setOpen("heating")} />
        {modals}
        <div className="board-alert">
          <EmptyStateFallback />
        </div>
      </>
    );
  }

  return (
    <div className="home">
      <div className="home__left">
        <WeatherCard />
        <SolarCard />
      </div>
      <div className="home__right">
        <div className="home__col home__col--a">
          <ClimateCard c={climate} onOpen={() => setOpen("climate")} />
          <LightsCard />
          <RadioCard />
        </div>
        <div className="home__col home__col--b">
          <HeatingCard h={heating} onOpen={() => setOpen("heating")} />
          <CamerasCard />
          <CalendarCard />
        </div>
        <div className="home__col home__col--c">
          <BlindsCard />
          <IntercomCard />
          <ConsumptionCard />
        </div>
      </div>
      {modals}
      {/* Upozornenie, keď server prestane odpovedať */}
      <EmptyStateFallback />
    </div>
  );
}

export function EmptyStateFallback() {
  const { serverReachable } = useApp();
  if (serverReachable) return null;
  return <EmptyState icon="offline" title="Server je nedostupný" text="Zobrazené údaje nemusia byť aktuálne." tone="danger" />;
}
