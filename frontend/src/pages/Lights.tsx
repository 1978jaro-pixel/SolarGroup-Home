import { useState } from "react";
import type { LightState, Reading } from "../api/types";
import { Icon } from "../components/Icon";
import { Card, EmptyState, PageHeader, ReadingView, Slider, StatusBadge, Toggle } from "../components/ui";
import { useDevices } from "../hooks/devices";

export function useLights() {
  return useDevices<LightState>("/api/lights");
}

export function groupByRoom<T extends { room: string | null }>(items: Reading<T>[]): [string, Reading<T>[]][] {
  const m = new Map<string, Reading<T>[]>();
  for (const r of items) {
    const key = r.data?.room ?? "Ostatné";
    m.set(key, [...(m.get(key) ?? []), r]);
  }
  return [...m.entries()];
}

function LightRow({ s, send, busy }: { s: LightState; send: (id: string, body: unknown) => Promise<boolean>; busy: boolean }) {
  const [draft, setDraft] = useState<number | null>(null);
  return (
    <div className={`device-row ${s.on ? "is-on" : ""}`}>
      <span className="device-row__icon">
        <Icon name="bulb" size={20} />
      </span>
      <div className="device-row__body">
        <span className="device-row__name">{s.name}</span>
        {s.dimmable ? (
          <Slider
            label={`Jas ${s.name}`}
            value={draft ?? s.brightness}
            onChange={setDraft}
            onCommit={(v) => void send(s.device_id, { brightness: Math.max(1, v) }).then(() => setDraft(null))}
            min={1}
            disabled={busy}
          />
        ) : (
          <span className="muted small">{s.on ? "Zapnuté" : "Vypnuté"}</span>
        )}
      </div>
      <Toggle label={`${s.name} zapnúť/vypnúť`} checked={s.on} onChange={(on) => void send(s.device_id, { on })} disabled={busy} />
    </div>
  );
}

export function LightsPage() {
  const l = useLights();
  const items = l.data ?? [];
  const anyData = items.some((r) => r.data);

  return (
    <>
      <PageHeader title="Svetlá" subtitle="Ovládanie podľa miestností" badge={<StatusBadge reading={items[0] ?? null} />} />
      {l.cmdError && <div className="alert alert--danger" role="alert">{l.cmdError}</div>}
      {l.error && !l.data && <EmptyState icon="offline" title="OFFLINE" text={l.error.message} tone="danger" />}
      {!anyData && items[0] && <ReadingView reading={items[0]}>{() => null}</ReadingView>}
      <div className="grid grid--rooms">
        {anyData &&
          groupByRoom(items).map(([room, list]) => {
            const onCount = list.filter((r) => r.data?.on).length;
            return (
              <Card key={room} title={room} icon="home" badge={<span className="muted small">{onCount ? `${onCount} zap.` : "vyp."}</span>}>
                {list.map((r) => r.data && <LightRow key={r.data.device_id} s={r.data} send={l.send} busy={l.busy === r.data.device_id} />)}
                <div className="row gap-s">
                  <button type="button" className="btn btn--ghost" onClick={() => list.forEach((r) => r.data && void l.send(r.data.device_id, { on: true }))}>
                    Všetky zap.
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => list.forEach((r) => r.data && void l.send(r.data.device_id, { on: false }))}>
                    Všetky vyp.
                  </button>
                </div>
              </Card>
            );
          })}
        <Card title="Pôdorys bytu" icon="plan" className="card--plan">
          <EmptyState icon="plan" title="Pôdorys dodáme neskôr" text="Po nahratí pôdorysu bude možné ovládať svetlá priamo kliknutím na miestnosť." />
        </Card>
      </div>
    </>
  );
}
