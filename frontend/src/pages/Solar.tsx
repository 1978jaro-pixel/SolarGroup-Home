import type { EnergySample, Reading } from "../api/types";
import { EnergyChart } from "../components/EnergyChart";
import { SolarScene } from "../components/SolarScene";
import { Card, IntegrationNote, PageHeader, ReadingView, Stat, StatusBadge } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { useResource } from "../hooks/useResource";
import { formatKwh, formatPower } from "../utils/format";

export function SolarPage() {
  const { energy } = useApp();
  const hist = useResource<Reading<EnergySample[]>>("/api/energy/history", 60000);
  const d = energy?.data ?? null;

  return (
    <>
      <PageHeader title="Fotovoltika" subtitle="Výroba, spotreba, batéria a sieť" badge={<StatusBadge reading={energy} />} />
      <div className="grid grid--solar">
        <Card className="card--hero" accent="blue">
          <SolarScene data={d} />
          {!d && energy && <ReadingView reading={energy}>{() => null}</ReadingView>}
        </Card>
        <div className="stack">
          <Card title="Teraz" icon="solar">
            <div className="stats">
              <Stat label="Výroba" color="var(--c-pv)" value={d ? formatPower(d.pv_kw) : "–"} />
              <Stat label="Spotreba" color="var(--c-house)" value={d ? formatPower(d.house_kw + d.ev_kw) : "–"} sub={d && d.ev_kw > 0 ? `z toho auto ${formatPower(d.ev_kw)}` : undefined} />
              <Stat
                label="Batéria"
                color="var(--c-battery)"
                value={d ? `${Math.round(d.battery_soc)} %` : "–"}
                sub={d ? (d.battery_kw > 0.05 ? `nabíja ${formatPower(d.battery_kw)}` : d.battery_kw < -0.05 ? `vybíja ${formatPower(d.battery_kw)}` : "nečinná") : undefined}
              />
              <Stat label="Sieť" color="var(--c-grid)" value={d ? formatPower(d.grid_kw) : "–"} sub={d ? (d.grid_kw < -0.05 ? "dodávka" : d.grid_kw > 0.05 ? "odber" : "bez toku") : undefined} />
            </div>
          </Card>
          <Card title="Dnes" icon="calendar">
            <div className="stats">
              <Stat label="Vyrobené" value={d ? formatKwh(d.today_pv_kwh) : "–"} />
              <Stat label="Spotrebované" value={d ? formatKwh(d.today_house_kwh) : "–"} />
              <Stat label="Zo siete" value={d ? formatKwh(d.today_grid_import_kwh) : "–"} />
              <Stat label="Do siete" value={d ? formatKwh(d.today_grid_export_kwh) : "–"} />
            </div>
            {d && (
              <div className="meter" aria-label={`Sebestačnosť ${d.self_sufficiency} %`}>
                <div className="meter__head">
                  <span>Sebestačnosť</span>
                  <strong>{Math.round(d.self_sufficiency)} %</strong>
                </div>
                <div className="meter__bar">
                  <i style={{ width: `${d.self_sufficiency}%` }} />
                </div>
              </div>
            )}
          </Card>
        </div>
        <Card title="Priebeh dňa" icon="chart" className="span-full" badge={<StatusBadge reading={hist.data} compact />}>
          <ReadingView reading={hist.data} error={hist.error} loading={hist.loading}>
            {(samples) => <EnergyChart samples={samples} />}
          </ReadingView>
        </Card>
        <div className="span-full">
          <IntegrationNote
            name="SolarGroup Dashboard"
            text="V režime LIVE sa údaje načítavajú z existujúceho SolarGroup Dashboardu cez jeho API (iba čítanie). Jeho pôvodný kód sa nekopíruje ani nemení. Adresa sa nastavuje v súbore backend/.env."
          />
        </div>
      </div>
    </>
  );
}
