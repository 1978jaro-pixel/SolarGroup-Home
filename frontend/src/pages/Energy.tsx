import { useState } from "react";
import type { EnergySample, Reading } from "../api/types";
import { EnergyChart } from "../components/EnergyChart";
import { Card, PageHeader, ReadingView, Stat, StatusBadge } from "../components/ui";
import { useResource } from "../hooks/useResource";
import { formatKwh } from "../utils/format";

function isoDay(d: Date) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

function totals(samples: EnergySample[]) {
  const step = 0.25;
  let pv = 0, house = 0, imp = 0, exp = 0;
  for (const s of samples) {
    pv += s.pv_kw * step;
    house += s.house_kw * step;
    imp += Math.max(0, s.grid_kw) * step;
    exp += Math.max(0, -s.grid_kw) * step;
  }
  return { pv, house, imp, exp };
}

export function EnergyPage() {
  const [day, setDay] = useState(() => isoDay(new Date()));
  const r = useResource<Reading<EnergySample[]>>(`/api/energy/history?day=${day}`, 60000);
  const max = isoDay(new Date());

  return (
    <>
      <PageHeader title="Energetické grafy" badge={<StatusBadge reading={r.data} />} />
      <div className="row gap-s mb wrap">
        <label className="field field--inline">
          <span>Deň</span>
          <input type="date" value={day} max={max} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </label>
      </div>
      <ReadingView reading={r.data} error={r.error} loading={r.loading}>
        {(samples) => {
          const t = totals(samples);
          return (
            <div className="stack">
              <Card>
                <div className="stats stats--4">
                  <Stat label="Výroba FV" color="var(--c-pv)" value={formatKwh(t.pv)} />
                  <Stat label="Spotreba" color="var(--c-house)" value={formatKwh(t.house)} />
                  <Stat label="Odber zo siete" color="var(--c-grid)" value={formatKwh(t.imp)} />
                  <Stat label="Dodávka do siete" color="var(--c-grid)" value={formatKwh(t.exp)} />
                </div>
              </Card>
              <Card title="Výkony (kW)" icon="chart">
                <EnergyChart samples={samples} height={300} />
              </Card>
            </div>
          );
        }}
      </ReadingView>
    </>
  );
}
