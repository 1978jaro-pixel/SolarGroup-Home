import type { ClimateMode, ClimateState, FanSpeed } from "../api/types";
import { Icon } from "../components/Icon";
import { ThermostatDial } from "../components/ThermostatDial";
import { Card, IntegrationNote, PageHeader, ReadingView, Segmented, StatusBadge } from "../components/ui";
import { useDevices } from "../hooks/devices";
import { formatTemp } from "../utils/format";

export const CLIMATE_MODES: { value: ClimateMode; label: string; icon: "home" | "snowflake" | "sun" | "drop" | "fan" }[] = [
  { value: "auto", label: "Auto", icon: "home" },
  { value: "cool", label: "Chladenie", icon: "snowflake" },
  { value: "heat", label: "Kúrenie", icon: "sun" },
  { value: "dry", label: "Odvlhč.", icon: "drop" },
  { value: "fan", label: "Ventilátor", icon: "fan" },
];

const FAN: { value: FanSpeed; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "1" },
  { value: "medium", label: "2" },
  { value: "high", label: "3" },
];

export function useClimate() {
  return useDevices<ClimateState>("/api/climate");
}

export function PowerButton({ on, onClick, disabled, label }: { on: boolean; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" className={`power-btn ${on ? "is-on" : ""}`} aria-pressed={on} aria-label={label} onClick={onClick} disabled={disabled}>
      <Icon name="power" size={22} />
      <span>{on ? "Zapnuté" : "Vypnuté"}</span>
    </button>
  );
}

export function ClimatePage() {
  const c = useClimate();

  return (
    <>
      <PageHeader title="Klimatizácia" subtitle="Príprava na Sinclair" badge={<StatusBadge reading={c.data?.[0] ?? null} />} />
      {c.cmdError && <div className="alert alert--danger" role="alert">{c.cmdError}</div>}
      {c.data?.length === 0 && <p className="muted">Nie je nakonfigurovaná žiadna klimatizácia.</p>}
      {(c.data ?? [null]).map((reading, i) => (
        <ReadingView key={reading?.data?.device_id ?? i} reading={reading} error={c.error} loading={c.loading}>
          {(s) => (
            <div className="grid grid--detail">
              <Card className="card--center" accent="blue">
                <div className="row row--between w-100">
                  <h2 className="h2">{s.name}</h2>
                  <PowerButton on={s.power} label="Zapnúť alebo vypnúť klimatizáciu" onClick={() => void c.send(s.device_id, { power: !s.power })} />
                </div>
                <ThermostatDial
                  value={s.target_temp}
                  current={s.current_temp}
                  min={16}
                  max={31}
                  variant="cool"
                  label="Nastavená teplota klimatizácie"
                  disabled={!s.power || s.mode === "fan"}
                  caption={!s.power ? "Vypnuté" : CLIMATE_MODES.find((m) => m.value === s.mode)?.label}
                  onCommit={(v) => void c.send(s.device_id, { target_temp: v })}
                  size={300}
                />
              </Card>
              <div className="stack">
                <Card title="Režim" icon="snowflake">
                  <Segmented label="Režim klimatizácie" value={s.mode} options={CLIMATE_MODES} onChange={(mode) => void c.send(s.device_id, { mode })} disabled={!s.power} />
                </Card>
                <Card title="Ventilátor" icon="fan">
                  <Segmented label="Rýchlosť ventilátora" value={s.fan} options={FAN} onChange={(fan) => void c.send(s.device_id, { fan })} disabled={!s.power} />
                </Card>
                <Card title="Stav" icon="thermo">
                  <dl className="kv">
                    <dt>Teplota v miestnosti</dt>
                    <dd>{formatTemp(s.current_temp)}</dd>
                    <dt>Miestnosť</dt>
                    <dd>{s.room ?? "–"}</dd>
                  </dl>
                </Card>
                <IntegrationNote name="Sinclair" text="Ovládanie jednotky Sinclair bude doplnené ako samostatný adaptér (lokálny Wi-Fi protokol, bez cloudu)." />
              </div>
            </div>
          )}
        </ReadingView>
      ))}
    </>
  );
}
