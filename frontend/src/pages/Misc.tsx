import { Icon } from "../components/Icon";
import { Card, EmptyState, IntegrationNote, PageHeader } from "../components/ui";
import { useApp } from "../hooks/AppContext";

export function MusicPage() {
  return (
    <>
      <PageHeader title="Hudba" />
      <Card>
        <EmptyState icon="music" title="Modul pripravujeme" text="Sem doplníme ovládanie hudby (napr. reproduktory v miestnostiach). Zatiaľ nie je pripojený žiadny prehrávač." />
      </Card>
    </>
  );
}

export function CalendarPage() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: offset + daysInMonth }, (_, i) => (i < offset ? null : i - offset + 1));
  return (
    <>
      <PageHeader title="Kalendár" subtitle={today.toLocaleDateString("sk-SK", { month: "long", year: "numeric" })} />
      <div className="grid grid--detail">
        <Card>
          <div className="calendar">
            {["Po", "Ut", "St", "Št", "Pi", "So", "Ne"].map((d) => (
              <span key={d} className="calendar__dow">
                {d}
              </span>
            ))}
            {cells.map((d, i) => (
              <span key={i} className={`calendar__day ${d === today.getDate() ? "is-today" : ""}`}>
                {d ?? ""}
              </span>
            ))}
          </div>
        </Card>
        <Card title="Udalosti" icon="calendar">
          <EmptyState icon="calendar" title="Žiadny prepojený kalendár" text="Prepojenie s kalendárom doplníme neskôr – vždy ako voliteľnú funkciu, ovládanie domácnosti nebude závisieť od cloudu." />
        </Card>
      </div>
    </>
  );
}

export function SettingsPage() {
  const { user, mode, logout } = useApp();
  return (
    <>
      <PageHeader title="Nastavenia" />
      <div className="grid grid--detail">
        <Card title="Účet" icon="lock">
          <dl className="kv">
            <dt>Prihlásený</dt>
            <dd>{user?.username}</dd>
            <dt>Rola</dt>
            <dd>{user?.role}</dd>
          </dl>
          <button type="button" className="btn mt" onClick={() => void logout()}>
            <Icon name="logout" size={18} /> Odhlásiť sa
          </button>
          <p className="muted small mt">Heslo zmeníte príkazom <code>python -m app.cli set-password {user?.username}</code> priamo na zariadení.</p>
        </Card>
        <Card title="Režim" icon="settings">
          <p>
            Aktuálny režim: {mode === "demo" ? <span className="badge badge--demo">DEMO</span> : <span className="badge badge--live">LIVE</span>}
          </p>
          <p className="muted small">
            Režim sa mení v lokálnom súbore <code>backend/.env</code> (<code>SGH_MODE=demo</code> alebo <code>live</code>) a reštartom servera. Heslá a kľúče k integráciám patria iba do tohto súboru – nikdy nie do zdrojového kódu.
          </p>
        </Card>
        <IntegrationNote
          name="Grafický návrh"
          text="Aktuálny vzhľad je provizórny. Po dodaní schváleného grafického návrhu ho upravíme podľa neho."
        />
      </div>
    </>
  );
}
