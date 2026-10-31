import type { SystemInfo } from "../api/types";
import { Icon, type IconName } from "../components/Icon";
import { Card, EmptyState, PageHeader } from "../components/ui";
import { useApp } from "../hooks/AppContext";
import { useResource } from "../hooks/useResource";
import { formatDuration } from "../utils/format";

const STATUS: Record<string, { label: string; cls: string; icon: IconName }> = {
  ok: { label: "OK", cls: "pill--ok", icon: "check" },
  stale: { label: "Zastarané", cls: "pill--warn", icon: "alert" },
  offline: { label: "OFFLINE", cls: "pill--danger", icon: "offline" },
  unavailable: { label: "Nedostupné", cls: "", icon: "info" },
};

export function SystemPage() {
  const r = useResource<SystemInfo>("/api/system", 30000);
  const { liveConnected } = useApp();
  const s = r.data;
  return (
    <>
      <PageHeader title="Stav systému" />
      {r.error && !s && <EmptyState icon="offline" title="Server je nedostupný" text={r.error.message} tone="danger" />}
      {s && (
        <div className="grid grid--detail">
          <Card title="Server" icon="server">
            <dl className="kv">
              <dt>Aplikácia</dt>
              <dd>
                {s.app} {s.version}
              </dd>
              <dt>Režim</dt>
              <dd>{s.mode === "demo" ? <span className="badge badge--demo">DEMO</span> : <span className="badge badge--live">LIVE</span>}</dd>
              <dt>Zariadenie</dt>
              <dd>{s.hostname}</dd>
              <dt>Python</dt>
              <dd>{s.python}</dd>
              <dt>Beží</dt>
              <dd>{formatDuration(s.uptime_s)}</dd>
              <dt>Živé spojenie</dt>
              <dd>{liveConnected ? "pripojené (WebSocket)" : "nepripojené – záložné načítavanie"}</dd>
            </dl>
          </Card>
          <Card title="Integrácie" icon="plug">
            <ul className="list">
              {s.integrations.map((i) => {
                const st = STATUS[i.status];
                return (
                  <li key={i.id}>
                    <span>
                      <strong>{i.name}</strong>
                      {i.message && <span className="muted small"> – {i.message}</span>}
                    </span>
                    <span className={`pill ${st.cls}`}>
                      <Icon name={st.icon} size={14} /> {st.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
