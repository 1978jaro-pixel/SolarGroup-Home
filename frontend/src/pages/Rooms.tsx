import { Link } from "react-router-dom";
import type { BlindState, LightState, Reading } from "../api/types";
import { Icon } from "../components/Icon";
import { Card, EmptyState, PageHeader, StatusBadge, Toggle } from "../components/ui";
import { MODULES } from "../nav";
import { useBlinds } from "./Blinds";
import { useLights } from "./Lights";

/** Prehľad podľa miestností (svetlá + žalúzie) a rozcestník všetkých modulov. */
export function RoomsPage() {
  const l = useLights();
  const b = useBlinds();
  const lights = (l.data ?? []).filter((r) => r.data) as Reading<LightState>[];
  const blinds = (b.data ?? []).filter((r) => r.data) as Reading<BlindState>[];
  const rooms = new Map<string, { lights: LightState[]; blinds: BlindState[] }>();
  for (const r of lights) {
    const key = r.data!.room ?? "Ostatné";
    rooms.set(key, { lights: [...(rooms.get(key)?.lights ?? []), r.data!], blinds: rooms.get(key)?.blinds ?? [] });
  }
  for (const r of blinds) {
    const key = r.data!.room ?? "Ostatné";
    rooms.set(key, { lights: rooms.get(key)?.lights ?? [], blinds: [...(rooms.get(key)?.blinds ?? []), r.data!] });
  }

  return (
    <>
      <PageHeader title="Miestnosti" subtitle="Svetlá a rolety podľa miestností" badge={<StatusBadge reading={l.data?.[0] ?? null} />} />
      {(l.cmdError || b.cmdError) && (
        <div className="alert alert--danger" role="alert">
          {l.cmdError || b.cmdError}
        </div>
      )}
      {rooms.size === 0 && !l.loading && (
        <EmptyState icon="info" title="Žiadne ovládateľné miestnosti" text={l.data?.[0]?.message ?? l.error?.message ?? "Zariadenia zatiaľ nie sú pripojené."} />
      )}
      <div className="grid grid--rooms">
        {[...rooms.entries()].map(([room, { lights, blinds }]) => (
          <Card key={room} title={room} icon="home">
            {lights.map((s) => (
              <div key={s.device_id} className={`device-row ${s.on ? "is-on" : ""}`}>
                <span className="device-row__icon">
                  <Icon name="bulb" size={20} />
                </span>
                <div className="device-row__body">
                  <span className="device-row__name">{s.name}</span>
                  <span className="muted small">{s.on ? (s.dimmable ? `Svieti · ${s.brightness} %` : "Svieti") : "Vypnuté"}</span>
                </div>
                <Toggle label={`${room} – ${s.name}`} checked={s.on} onChange={(on) => void l.send(s.device_id, { on })} />
              </div>
            ))}
            {blinds.map((s) => (
              <div key={s.device_id} className="device-row">
                <span className="device-row__icon">
                  <Icon name="blinds" size={20} />
                </span>
                <div className="device-row__body">
                  <span className="device-row__name">Rolety</span>
                  <span className="muted small">{s.position} % otvorené</span>
                </div>
                <button type="button" className="round-btn round-btn--sm" aria-label={`${room} – otvoriť rolety`} onClick={() => void b.send(s.device_id, { position: 100 })}>
                  <Icon name="chevronUp" size={18} />
                </button>
                <button type="button" className="round-btn round-btn--sm" aria-label={`${room} – zatvoriť rolety`} onClick={() => void b.send(s.device_id, { position: 0 })}>
                  <Icon name="chevronDown" size={18} />
                </button>
              </div>
            ))}
          </Card>
        ))}
      </div>

      <h2 className="section-title">Všetky moduly</h2>
      <div className="module-grid">
        {MODULES.map((m) => (
          <Link key={m.path} to={m.path} className="module-tile">
            <Icon name={m.icon} size={26} />
            <span>{m.label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
