import { useState } from "react";
import { Link } from "react-router-dom";
import { getSaverMinutes, setSaverMinutes } from "../components/Screensaver";
import { displayInfo, getReduceMotion, measureFps, setReduceMotion, type DisplayInfo } from "../utils/display";
import { isKiosk, setKiosk } from "../utils/kiosk";
import { Icon } from "../components/Icon";
import { Card, EmptyState, PageHeader, Segmented, Toggle } from "../components/ui";
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
        <KioskSettings />
        <Card title="Systém" icon="server">
          <div className="row gap-s wrap">
            <Link to="/system" className="btn">
              <Icon name="server" size={18} /> Stav systému
            </Link>
            <Link to="/energia" className="btn">
              <Icon name="bars" size={18} /> Energetické grafy
            </Link>
            <Link to="/miestnosti" className="btn">
              <Icon name="more" size={18} /> Všetky moduly
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}

/** Nastavenia tohto displeja – ukladajú sa iba v tomto prehliadači (napr. na Raspberry Pi). */
function KioskSettings() {
  const [kiosk, setKioskState] = useState(isKiosk);
  const [saver, setSaver] = useState(String(getSaverMinutes()));
  const [calm, setCalm] = useState(getReduceMotion);
  return (
    <Card title="Tento displej" icon="settings">
      <div className="row row--between gap-s">
        <span>
          Dotyková klávesnica (režim kiosku)
          <span className="muted small"> – na Raspberry Pi so 7" displejom</span>
        </span>
        <Toggle
          label="Dotyková klávesnica"
          checked={kiosk}
          onChange={(v) => {
            setKiosk(v);
            setKioskState(v);
          }}
        />
      </div>
      <div>
        <p className="mb-s">Šetrič obrazovky (čierna obrazovka, zobudenie dotykom)</p>
        <Segmented
          label="Šetrič obrazovky"
          value={saver}
          options={[
            { value: "0", label: "Vypnutý" },
            { value: "5", label: "5 min" },
            { value: "15", label: "15 min" },
            { value: "30", label: "30 min" },
          ]}
          onChange={(v) => {
            setSaver(v);
            setSaverMinutes(Number(v));
          }}
        />
        <p className="muted small mt">HDMI výstup sa nevypína, preto sa obraz vždy obnoví dotykom. Predvolene je šetrič vypnutý.</p>
      </div>
      <div className="row row--between gap-s">
        <span>
          Bez animácií
          <span className="muted small"> – šetrí výkon (toky energie sa zobrazia bez pohybu)</span>
        </span>
        <Toggle
          label="Bez animácií"
          checked={calm}
          onChange={(v) => {
            setReduceMotion(v);
            setCalm(v);
          }}
        />
      </div>
      <DisplayDiagnostics />
    </Card>
  );
}

/** Rozlíšenie, mierka, GPU a FPS – na overenie ostrosti a plynulosti priamo na displeji. */
function DisplayDiagnostics() {
  const [info, setInfo] = useState<DisplayInfo | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="disp-diag">
      <div className="row gap-s wrap">
        <button type="button" className="btn" onClick={() => setInfo(displayInfo())}>
          <Icon name="info" size={18} /> Zistiť parametre displeja
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void measureFps().then((v) => {
              setFps(v);
              setBusy(false);
            });
          }}
        >
          <Icon name="chart" size={18} /> {busy ? "Meria sa…" : "Zmerať plynulosť (FPS)"}
        </button>
      </div>
      {(info || fps != null) && (
        <dl className="disp-diag__list">
          {info && (
            <>
              <dt>Okno (CSS px)</dt>
              <dd>{info.viewport}</dd>
              <dt>Obrazovka</dt>
              <dd>{info.screen}</dd>
              <dt>Mierka (DPR)</dt>
              <dd>{info.dpr}</dd>
              <dt>Fyzické pixely</dt>
              <dd>{info.physical}</dd>
              <dt>GPU</dt>
              <dd>
                {info.gpu}
                {info.gpuAccelerated === false && " (bez akcelerácie)"}
              </dd>
              <dt>Pamäť stránky</dt>
              <dd>{info.heapMb != null ? `${info.heapMb} MB` : "–"}</dd>
              <dt>Jadrá CPU</dt>
              <dd>{info.cores ?? "–"}</dd>
              <dt>Prehliadač</dt>
              <dd>{info.browser}</dd>
            </>
          )}
          {fps != null && (
            <>
              <dt>Plynulosť</dt>
              <dd>{fps} snímok/s</dd>
            </>
          )}
        </dl>
      )}
      {info?.warnings.map((w) => (
        <p key={w} className="card-error">
          {w}
        </p>
      ))}
    </div>
  );
}
