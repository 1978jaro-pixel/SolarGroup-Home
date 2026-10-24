import { useState } from "react";
import { api, ApiError } from "../api/client";
import type { BlindState } from "../api/types";
import { Icon } from "../components/Icon";
import { Card, EmptyState, PageHeader, ReadingView, Slider, StatusBadge } from "../components/ui";
import { useDevices } from "../hooks/devices";

export function useBlinds() {
  return useDevices<BlindState>("/api/blinds");
}

function BlindVisual({ position }: { position: number }) {
  // position: 0 = zatvorené, 100 = otvorené
  const closed = 100 - position;
  return (
    <div className="blind-visual" aria-hidden="true">
      <div className="blind-visual__slats" style={{ height: `${Math.max(6, closed)}%` }} />
    </div>
  );
}

export function useBlindGroup(refresh: () => Promise<void>) {
  const [err, setErr] = useState<string | null>(null);
  const group = async (position: number, device_ids?: string[]) => {
    setErr(null);
    try {
      await api.post("/api/blinds/group", { position, device_ids: device_ids ?? null });
      await refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Príkaz zlyhal");
    }
  };
  return { group, err };
}

export function BlindsPage() {
  const b = useBlinds();
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const { group, err } = useBlindGroup(b.refresh);
  const items = b.data ?? [];
  const anyData = items.some((r) => r.data);

  return (
    <>
      <PageHeader title="Žalúzie" subtitle="0 % = zatvorené · 100 % = otvorené" badge={<StatusBadge reading={items[0] ?? null} />} />
      {(b.cmdError || err) && <div className="alert alert--danger" role="alert">{b.cmdError || err}</div>}
      {b.error && !b.data && <EmptyState icon="offline" title="OFFLINE" text={b.error.message} tone="danger" />}
      {!anyData && items[0] && <ReadingView reading={items[0]}>{() => null}</ReadingView>}
      {anyData && (
        <>
          <Card title="Skupinové ovládanie" icon="blinds" className="mb">
            <div className="row gap-s wrap">
              <button type="button" className="btn" onClick={() => void group(100)}>
                <Icon name="arrowUp" size={18} /> Otvoriť všetky
              </button>
              <button type="button" className="btn" onClick={() => void group(50)}>
                Všetky na 50 %
              </button>
              <button type="button" className="btn" onClick={() => void group(0)}>
                <Icon name="arrowDown" size={18} /> Zatvoriť všetky
              </button>
            </div>
          </Card>
          <div className="grid grid--rooms">
            {items.map(
              (r) =>
                r.data && (
                  <Card key={r.data.device_id} title={r.data.room ?? r.data.name} icon="blinds" badge={<span className="pct">{drafts[r.data.device_id] ?? r.data.position} %</span>}>
                    <BlindVisual position={drafts[r.data.device_id] ?? r.data.position} />
                    <Slider
                      label={`Otvorenie ${r.data.name}`}
                      value={drafts[r.data.device_id] ?? r.data.position}
                      onChange={(v) => setDrafts((d) => ({ ...d, [r.data!.device_id]: v }))}
                      onCommit={(v) => {
                        const id = r.data!.device_id;
                        void b.send(id, { position: v }).then(() =>
                          setDrafts((d) => {
                            const n = { ...d };
                            delete n[id];
                            return n;
                          }),
                        );
                      }}
                      step={5}
                    />
                    <div className="row gap-s">
                      <button type="button" className="btn btn--ghost" aria-label="Otvoriť" onClick={() => void b.send(r.data!.device_id, { position: 100 })}>
                        <Icon name="arrowUp" size={18} />
                      </button>
                      <button type="button" className="btn btn--ghost" aria-label="Zatvoriť" onClick={() => void b.send(r.data!.device_id, { position: 0 })}>
                        <Icon name="arrowDown" size={18} />
                      </button>
                    </div>
                  </Card>
                ),
            )}
          </div>
        </>
      )}
    </>
  );
}
