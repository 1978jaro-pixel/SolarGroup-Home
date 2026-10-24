import type { CameraInfo, Reading } from "../api/types";
import { Icon } from "../components/Icon";
import { Card, EmptyState, IntegrationNote, PageHeader, StatusBadge } from "../components/ui";
import { useResource } from "../hooks/useResource";

export function CameraTile({ reading, name, compact = false }: { reading: Reading<CameraInfo>; name?: string; compact?: boolean }) {
  const c = reading.data;
  return (
    <div className="camera-tile">
      <div className="camera-tile__view">
        <Icon name="camera" size={36} />
        <span>{c?.note ?? reading.message ?? "Kamera nie je pripojená"}</span>
      </div>
      <div className="camera-tile__foot">
        <span>
          <strong>{c?.name ?? name ?? "Kamera"}</strong>
          {c?.model && <span className="muted small"> · Tapo {c.model}</span>}
        </span>
        {!compact && <StatusBadge reading={reading} compact />}
      </div>
    </div>
  );
}

export function CamerasPage() {
  const r = useResource<Reading<CameraInfo>[]>("/api/cameras", 30000);
  return (
    <>
      <PageHeader title="Kamery" subtitle="Tapo C310 a ďalšie" />
      {r.error && !r.data && <EmptyState icon="offline" title="OFFLINE" text={r.error.message} tone="danger" />}
      <div className="grid grid--cams">
        {(r.data ?? []).map((c, i) => (
          <CameraTile key={c.data?.device_id ?? i} reading={c} />
        ))}
      </div>
      <IntegrationNote
        name="Živý obraz"
        text="Priestor pre živý obraz je pripravený. Stream z kamier Tapo (RTSP) sa pripojí lokálne cez samostatný adaptér – zámerne nezobrazujeme žiadne falošné zábery."
      />
    </>
  );
}

export function IntercomPage() {
  const r = useResource<Reading<unknown>>("/api/intercom", 0);
  return (
    <>
      <PageHeader title="Videovrátnik" badge={<StatusBadge reading={r.data} />} />
      <Card className="card--center">
        <div className="intercom">
          <span className="intercom__icon">
            <Icon name="doorbell" size={44} />
          </span>
          <h2 className="h2">Videovrátnik</h2>
          <p className="muted">{r.data?.message ?? "Načítavam…"}</p>
          <div className="row gap-s">
            <button type="button" className="btn" disabled>
              <Icon name="camera" size={18} /> Zobraziť obraz
            </button>
            <button type="button" className="btn" disabled>
              <Icon name="lock" size={18} /> Otvoriť dvere
            </button>
          </div>
        </div>
      </Card>
      <IntegrationNote name="Budúca integrácia" text="Po výbere zariadenia doplníme adaptér (zvonenie, obraz, otvorenie dverí). Otvorenie dverí bude vždy vyžadovať prihlásenie." />
    </>
  );
}
