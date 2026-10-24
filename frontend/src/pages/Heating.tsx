import type { HeatingMode, HeatingState } from "../api/types";
import { Icon } from "../components/Icon";
import { ThermostatDial } from "../components/ThermostatDial";
import { Card, IntegrationNote, PageHeader, ReadingView, Segmented, StatusBadge } from "../components/ui";
import { useDevices } from "../hooks/devices";
import { formatTemp } from "../utils/format";

export const HEATING_MODES: { value: HeatingMode; label: string; icon: "sun" | "moon" | "power" | "home" }[] = [
  { value: "auto", label: "Auto", icon: "home" },
  { value: "day", label: "Deň", icon: "sun" },
  { value: "night", label: "Noc", icon: "moon" },
  { value: "off", label: "Vyp.", icon: "power" },
];

export function useHeating() {
  return useDevices<HeatingState>("/api/heating");
}

function TempStepper({ label, icon, value, onChange, disabled }: { label: string; icon: "sun" | "moon"; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="stepper">
      <span className="stepper__label">
        <Icon name={icon} size={18} /> {label}
      </span>
      <div className="stepper__ctrl">
        <button type="button" className="round-btn round-btn--sm" aria-label={`${label} – znížiť`} disabled={disabled || value <= 5} onClick={() => onChange(value - 0.5)}>
          <Icon name="minus" size={18} />
        </button>
        <output>{formatTemp(value)}</output>
        <button type="button" className="round-btn round-btn--sm" aria-label={`${label} – zvýšiť`} disabled={disabled || value >= 30} onClick={() => onChange(value + 0.5)}>
          <Icon name="plus" size={18} />
        </button>
      </div>
    </div>
  );
}

export function HeatingPage() {
  const h = useHeating();
  const reading = h.data?.[0];

  return (
    <>
      <PageHeader title="Kúrenie" subtitle="Ústredné kúrenie · príprava na Buderus" badge={<StatusBadge reading={reading ?? null} />} />
      {h.cmdError && <div className="alert alert--danger" role="alert">{h.cmdError}</div>}
      <ReadingView reading={reading} error={h.error} loading={h.loading}>
        {(s) => (
          <div className="grid grid--detail">
            <Card className="card--center" accent="warm">
              <ThermostatDial
                value={s.target_temp}
                current={s.current_temp}
                min={5}
                max={30}
                variant="heat"
                label="Nastavená teplota kúrenia"
                disabled={s.mode === "off" || h.busy === s.device_id}
                caption={s.mode === "off" ? "Vypnuté" : s.heating_active ? "Kúri sa" : "Nastavené"}
                onCommit={(v) => void h.send(s.device_id, { target_temp: v })}
                size={300}
              />
              <Segmented label="Režim kúrenia" value={s.mode} options={HEATING_MODES} onChange={(mode) => void h.send(s.device_id, { mode })} />
            </Card>
            <div className="stack">
              <Card title="Program" icon="calendar">
                <TempStepper label="Denná teplota" icon="sun" value={s.day_temp} onChange={(v) => void h.send(s.device_id, { day_temp: v })} />
                <TempStepper label="Nočná teplota" icon="moon" value={s.night_temp} onChange={(v) => void h.send(s.device_id, { night_temp: v })} />
                <p className="muted small">Režim Auto: deň 6:00 – 22:00, noc 22:00 – 6:00.</p>
              </Card>
              <Card title="Stav" icon="thermo">
                <dl className="kv">
                  <dt>Aktuálna teplota</dt>
                  <dd>{formatTemp(s.current_temp)}</dd>
                  <dt>Kotol</dt>
                  <dd>
                    <span className={`pill ${s.heating_active ? "pill--warm" : ""}`}>
                      <Icon name="flame" size={14} /> {s.heating_active ? "Kúri" : "Nekúri"}
                    </span>
                  </dd>
                  <dt>Teplota vody</dt>
                  <dd>{formatTemp(s.water_temp)}</dd>
                </dl>
              </Card>
              <IntegrationNote name="Buderus" text="Integrácia kotla Buderus bude doplnená ako samostatný adaptér. V režime LIVE sa do jej pripojenia zobrazí stav Nedostupné." />
            </div>
          </div>
        )}
      </ReadingView>
    </>
  );
}
