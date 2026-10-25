import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import blindsImg from "../assets/design/blinds.webp";
import floorImg from "../assets/design/floor.webp";
import type { CameraInfo, Reading } from "../api/types";
import { Icon } from "../components/Icon";
import { SolarScene } from "../components/SolarScene";
import { WeatherArt } from "../components/WeatherArt";
import { Card, ReadingView, StatusBadge, Toggle } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { useResource } from "../hooks/useResource";
import { plural, weatherInfo, weekdayName } from "../utils/format";
import { useBlindGroup, useBlinds } from "./Blinds";
import { ClimateThermostat, type ClimateCtl } from "./Climate";
import { HeatingThermostat, type HeatingCtl } from "./Heating";
import { useLights } from "./Lights";
import { useWeather } from "./Weather";

/**
 * Kompaktná hlavná obrazovka pre nízke displeje na šírku (7" 1024 × 600, 1280 × 800 …).
 * Všetkých osem modulov je na jednej obrazovke bez posúvania; ťuknutie na kartu otvorí detail.
 * Rozmery sa odvodzujú od výšky okna (CSS), takže väčší displej využije priestor.
 */

const badge = (r: Parameters<typeof StatusBadge>[0]["reading"]) => <StatusBadge reading={r} compact hideDemo />;

function FitCard({ title, icon, onOpen, className = "", badge, actions, children }: { title: string; icon: Parameters<typeof Card>[0]["icon"]; onOpen: () => void; className?: string; badge?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card title={title} icon={icon} onOpen={onOpen} className={`fit-card ${className}`} badge={badge} actions={actions}>
      {children}
    </Card>
  );
}

function WeatherFit({ open }: { open: () => void }) {
  const r = useWeather();
  return (
    <FitCard title="Žilina" icon="pin" onOpen={open} className="fit-weather" badge={badge(r.data)}>
      <ReadingView reading={r.data} error={r.error} loading={r.loading}>
        {(w) => (
          <>
            <div className="fit-weather__now">
              <span className="fit-weather__temp">{Math.round(w.temp)}°</span>
              <WeatherArt code={w.code} size={64} />
            </div>
            <span className="fit-weather__label">{weatherInfo(w.code).label}</span>
            <ul className="fit-forecast">
              {w.daily.slice(1, 4).map((d) => (
                <li key={d.date}>
                  <span>{weekdayName(d.date).slice(0, 2)}</span>
                  <WeatherArt code={d.code} size={26} />
                  <span>
                    {Math.round(d.temp_max)}°<small>/{Math.round(d.temp_min)}°</small>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </ReadingView>
    </FitCard>
  );
}

function SolarFit({ open }: { open: () => void }) {
  const { energy } = useApp();
  const d = energy?.data ?? null;
  return (
    <FitCard title="Fotovoltika" icon="solar" onOpen={open} className="fit-pv" badge={badge(energy)}>
      <div className="fit-pv__scene">
        <SolarScene data={d} />
      </div>
      {!d && energy && energy.status !== "ok" && <p className="pv-note">{energy.message ?? "Údaje nie sú k dispozícii"}</p>}
    </FitCard>
  );
}

function ClimateFit({ c, open }: { c: ClimateCtl; open: () => void }) {
  const r = c.data?.[0];
  const s = r?.data;
  return (
    <FitCard
      title="Klíma"
      icon="thermo"
      onOpen={open}
      className="fit-thermo"
      badge={badge(r ?? null)}
      actions={s && <Toggle label="Zapnúť alebo vypnúť klimatizáciu" checked={s.power} disabled={c.busy === s.device_id} onChange={(power) => void c.send(s.device_id, { power })} />}
    >
      <ReadingView reading={r} error={c.error} loading={c.loading}>
        {(s) => (
          <div className="fit-thermo__dial">
            <ClimateThermostat c={c} s={s} size={240} onCenterTap={open} />
          </div>
        )}
      </ReadingView>
      {c.cmdError && <p className="card-error">{c.cmdError}</p>}
    </FitCard>
  );
}

function HeatingFit({ h, open }: { h: HeatingCtl; open: () => void }) {
  const r = h.data?.[0];
  return (
    <FitCard title="Kúrenie" icon="heat" onOpen={open} className="fit-thermo" badge={badge(r ?? null)}>
      <ReadingView reading={r} error={h.error} loading={h.loading}>
        {(s) => (
          <div className="fit-thermo__dial">
            <HeatingThermostat h={h} s={s} size={240} onCenterTap={open} />
          </div>
        )}
      </ReadingView>
      {h.cmdError && <p className="card-error">{h.cmdError}</p>}
    </FitCard>
  );
}

function BlindsFit({ open }: { open: () => void }) {
  const b = useBlinds();
  const { group } = useBlindGroup(b.refresh);
  const items = (b.data ?? []).filter((r) => r.data);
  const avg = items.length ? Math.round(items.reduce((a, r) => a + r.data!.position, 0) / items.length) : null;
  return (
    <FitCard title="Rolety" icon="blinds" onOpen={open} className="fit-media" badge={badge(b.data?.[0] ?? null)}>
      <div className="media media--fit">
        <img src={blindsImg} alt="" />
        {avg != null && <span className="media__chip">{avg} % otvorené</span>}
      </div>
      <div className="split-btns split-btns--row">
        <button type="button" onClick={() => void group(100)} disabled={!items.length}>
          <Icon name="chevronUp" size={20} /> Otvoriť
        </button>
        <button type="button" onClick={() => void group(0)} disabled={!items.length}>
          <Icon name="chevronDown" size={20} /> Zatvoriť
        </button>
      </div>
    </FitCard>
  );
}

function LightsFit({ open }: { open: () => void }) {
  const l = useLights();
  const items = (l.data ?? []).filter((r) => r.data);
  const on = items.filter((r) => r.data!.on).length;
  return (
    <FitCard title="Svetlá" icon="bulb" onOpen={open} className="fit-media" badge={badge(l.data?.[0] ?? null)}>
      <div className="media media--fit">
        <img src={floorImg} alt="" />
        {items.length > 0 && (
          <span className="media__chip">
            <Icon name="bulb" size={14} /> {on} z {items.length} svieti
          </span>
        )}
      </div>
    </FitCard>
  );
}

function CamerasFit({ open }: { open: () => void }) {
  const r = useResource<Reading<CameraInfo>[]>("/api/cameras", 60000);
  const cams = r.data ?? [];
  const streaming = cams.some((c) => c.data?.stream_available);
  return (
    <FitCard title="Kamery" icon="camera" onOpen={open} className="fit-small" badge={badge(cams[0] ?? null)}>
      <button type="button" className="row-btn" onClick={open}>
        <span>
          {cams.length} {plural(cams.length, "kamera", "kamery", "kamier")}
          <span className="row-btn__sub"> · {streaming ? "živý obraz" : "obraz nepripojený"}</span>
        </span>
        <Icon name="chevron" size={20} />
      </button>
    </FitCard>
  );
}

function IntercomFit({ open }: { open: () => void }) {
  return (
    <FitCard title="Vrátnik" icon="doorbell" onOpen={open} className="fit-small">
      <button type="button" className="row-btn" onClick={open}>
        <span className="row-btn__lead">
          <Icon name="phone" size={20} filled /> Vstup
        </span>
        <Icon name="chevron" size={20} />
      </button>
    </FitCard>
  );
}

export function HomeFit({ climate, heating, openClimate, openHeating }: { climate: ClimateCtl; heating: HeatingCtl; openClimate: () => void; openHeating: () => void }) {
  const nav = useNavigate();
  const go = (path: string) => () => nav(path);
  return (
    <div className="home-fit">
      <WeatherFit open={go("/pocasie")} />
      <SolarFit open={go("/fotovoltika")} />
      <ClimateFit c={climate} open={openClimate} />
      <HeatingFit h={heating} open={openHeating} />
      <BlindsFit open={go("/zaluzie")} />
      <LightsFit open={go("/svetla")} />
      <div className="home-fit__stack">
        <CamerasFit open={go("/kamery")} />
        <IntercomFit open={go("/videovratnik")} />
      </div>
    </div>
  );
}
