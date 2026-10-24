import { Link } from "react-router-dom";
import type { CameraInfo, EnergySample, Reading } from "../api/types";
import { EnergyChart } from "../components/EnergyChart";
import { Icon } from "../components/Icon";
import { SolarHouse } from "../components/SolarHouse";
import { ThermostatDial } from "../components/ThermostatDial";
import { Card, EmptyState, ReadingView, Stat, StatusBadge, Toggle } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { useResource } from "../hooks/useResource";
import { formatKwh, formatPower, greeting } from "../utils/format";
import { useBlindGroup, useBlinds } from "./Blinds";
import { CameraTile } from "./Cameras";
import { CLIMATE_MODES, PowerButton, useClimate } from "./Climate";
import { HEATING_MODES, useHeating } from "./Heating";
import { useLights } from "./Lights";
import { WeatherDays, WeatherSummary, useWeather } from "./Weather";

function SolarCard() {
  const { energy } = useApp();
  const d = energy?.data ?? null;
  return (
    <Link to="/fotovoltika" className="card card--hero card--link span-2" aria-label="Fotovoltika – otvoriť detail">
      <header className="card__head">
        <span className="card__icon">
          <Icon name="solar" size={20} />
        </span>
        <h2 className="card__title">Fotovoltika</h2>
        <span className="card__badge">
          <StatusBadge reading={energy} />
        </span>
        <span className="card__more">
          <Icon name="chevron" size={18} />
        </span>
      </header>
      <SolarHouse data={d} />
      {d ? (
        <div className="stats stats--4">
          <Stat label="Výroba" color="var(--c-pv)" value={formatPower(d.pv_kw)} sub={`dnes ${formatKwh(d.today_pv_kwh)}`} />
          <Stat label="Spotreba" color="var(--c-house)" value={formatPower(d.house_kw + d.ev_kw)} sub={`dnes ${formatKwh(d.today_house_kwh)}`} />
          <Stat label="Batéria" color="var(--c-battery)" value={`${Math.round(d.battery_soc)} %`} sub={formatPower(d.battery_kw)} />
          <Stat label="Sieť" color="var(--c-grid)" value={formatPower(d.grid_kw)} sub={d.grid_kw < -0.05 ? "dodávka" : d.grid_kw > 0.05 ? "odber" : "bez toku"} />
        </div>
      ) : (
        energy && <ReadingView reading={energy}>{() => null}</ReadingView>
      )}
    </Link>
  );
}

function HeatingCard() {
  const h = useHeating();
  const r = h.data?.[0];
  return (
    <Card title="Kúrenie" icon="flame" to="/kurenie" badge={<StatusBadge reading={r ?? null} compact />} accent="warm">
      <ReadingView reading={r} error={h.error} loading={h.loading}>
        {(s) => (
          <div className="mini-climate">
            <ThermostatDial
              value={s.target_temp}
              current={s.current_temp}
              size={190}
              variant="heat"
              label="Nastavená teplota kúrenia"
              disabled={s.mode === "off"}
              caption={HEATING_MODES.find((m) => m.value === s.mode)?.label}
              onCommit={(v) => void h.send(s.device_id, { target_temp: v })}
            />
            <div className="chips">
              {HEATING_MODES.map((m) => (
                <button key={m.value} type="button" className={`chip ${s.mode === m.value ? "is-active" : ""}`} aria-pressed={s.mode === m.value} onClick={() => void h.send(s.device_id, { mode: m.value })}>
                  <Icon name={m.icon} size={16} /> {m.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </ReadingView>
    </Card>
  );
}

function ClimateCard() {
  const c = useClimate();
  const r = c.data?.[0];
  return (
    <Card title="Klimatizácia" icon="snowflake" to="/klimatizacia" badge={<StatusBadge reading={r ?? null} compact />} accent="blue">
      <ReadingView reading={r} error={c.error} loading={c.loading}>
        {(s) => (
          <div className="mini-climate">
            <ThermostatDial
              value={s.target_temp}
              current={s.current_temp}
              min={16}
              max={31}
              size={190}
              variant="cool"
              label="Nastavená teplota klimatizácie"
              disabled={!s.power}
              caption={s.power ? CLIMATE_MODES.find((m) => m.value === s.mode)?.label : "Vypnuté"}
              onCommit={(v) => void c.send(s.device_id, { target_temp: v })}
            />
            <PowerButton on={s.power} label="Zapnúť alebo vypnúť klimatizáciu" onClick={() => void c.send(s.device_id, { power: !s.power })} />
          </div>
        )}
      </ReadingView>
    </Card>
  );
}

function LightsCard() {
  const l = useLights();
  const items = (l.data ?? []).filter((r) => r.data);
  const on = items.filter((r) => r.data!.on).length;
  return (
    <Card title="Svetlá" icon="bulb" to="/svetla" badge={<StatusBadge reading={l.data?.[0] ?? null} compact />}>
      {items.length === 0 ? (
        <ReadingView reading={l.data?.[0]} error={l.error} loading={l.loading}>
          {() => null}
        </ReadingView>
      ) : (
        <>
          <p className="big-number">
            {on}
            <small> / {items.length} zapnuté</small>
          </p>
          <div className="quick-list">
            {items.slice(0, 5).map((r) => (
              <div key={r.data!.device_id} className="quick-list__row">
                <span>
                  {r.data!.room} <span className="muted">· {r.data!.name}</span>
                </span>
                <Toggle label={`${r.data!.room} ${r.data!.name}`} checked={r.data!.on} onChange={(v) => void l.send(r.data!.device_id, { on: v })} />
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function BlindsCard() {
  const b = useBlinds();
  const { group } = useBlindGroup(b.refresh);
  const items = (b.data ?? []).filter((r) => r.data);
  const avg = items.length ? Math.round(items.reduce((a, r) => a + r.data!.position, 0) / items.length) : 0;
  return (
    <Card title="Žalúzie" icon="blinds" to="/zaluzie" badge={<StatusBadge reading={b.data?.[0] ?? null} compact />}>
      {items.length === 0 ? (
        <ReadingView reading={b.data?.[0]} error={b.error} loading={b.loading}>
          {() => null}
        </ReadingView>
      ) : (
        <>
          <p className="big-number">
            {avg} %<small> priemerne otvorené</small>
          </p>
          <div className="bars">
            {items.map((r) => (
              <div key={r.data!.device_id} className="bars__item" title={`${r.data!.room}: ${r.data!.position} %`}>
                <i style={{ height: `${Math.max(4, r.data!.position)}%` }} />
                <span>{r.data!.room?.slice(0, 3)}</span>
              </div>
            ))}
          </div>
          <div className="row gap-s">
            <button type="button" className="btn btn--ghost" onClick={() => void group(100)}>
              <Icon name="arrowUp" size={18} /> Otvoriť
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => void group(0)}>
              <Icon name="arrowDown" size={18} /> Zatvoriť
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

function CamerasCard() {
  const r = useResource<Reading<CameraInfo>[]>("/api/cameras", 60000);
  return (
    <Card title="Kamery" icon="camera" to="/kamery" badge={<StatusBadge reading={r.data?.[0] ?? null} compact />}>
      <div className="grid grid--cams-mini">
        {(r.data ?? []).slice(0, 2).map((c, i) => (
          <CameraTile key={c.data?.device_id ?? i} reading={c} compact />
        ))}
      </div>
      {r.error && !r.data && <EmptyState icon="offline" title="OFFLINE" text={r.error.message} tone="danger" />}
    </Card>
  );
}

function IntercomCard() {
  return (
    <Card title="Videovrátnik" icon="doorbell" to="/videovratnik">
      <EmptyState icon="doorbell" title="Pripravené na integráciu" text="Zvonenie, obraz a otvorenie dverí doplníme neskôr." />
    </Card>
  );
}

function WeatherCard() {
  const r = useWeather();
  return (
    <Card title="Počasie" icon="partly" to="/pocasie" badge={<StatusBadge reading={r.data} compact />}>
      <ReadingView reading={r.data} error={r.error} loading={r.loading}>
        {(w) => (
          <>
            <WeatherSummary w={w} />
            <WeatherDays w={w} days={4} />
          </>
        )}
      </ReadingView>
    </Card>
  );
}

function EnergyCard() {
  const r = useResource<Reading<EnergySample[]>>("/api/energy/history", 5 * 60000);
  return (
    <Card title="Energia dnes" icon="chart" to="/energia" className="span-2" badge={<StatusBadge reading={r.data} compact />}>
      <ReadingView reading={r.data} error={r.error} loading={r.loading}>
        {(s) => <EnergyChart samples={s} height={170} series={["pv_kw", "house_kw"]} showTable={false} />}
      </ReadingView>
    </Card>
  );
}

function SimpleCard({ title, icon, to, text }: { title: string; icon: "music" | "calendar" | "server" | "settings"; to: string; text: string }) {
  return (
    <Card title={title} icon={icon} to={to}>
      <p className="muted small">{text}</p>
    </Card>
  );
}

export function HomePage() {
  const { user } = useApp();
  const now = new Date();
  return (
    <>
      <div className="home-head">
        <div>
          <p className="muted">
            {greeting(now)}
            {user ? `, ${user.username}` : ""} · {now.toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="display">Môj domov</h1>
        </div>
      </div>
      <div className="grid grid--home">
        <SolarCard />
        <HeatingCard />
        <ClimateCard />
        <LightsCard />
        <BlindsCard />
        <WeatherCard />
        <EnergyCard />
        <CamerasCard />
        <IntercomCard />
        <SimpleCard title="Hudba" icon="music" to="/hudba" text="Modul pripravujeme." />
        <SimpleCard title="Kalendár" icon="calendar" to="/kalendar" text="Prehľad mesiaca, prepojenie doplníme." />
        <SimpleCard title="Stav systému" icon="server" to="/system" text="Server, integrácie a spojenie." />
        <SimpleCard title="Nastavenia" icon="settings" to="/nastavenia" text="Účet, režim DEMO/LIVE." />
      </div>
    </>
  );
}
