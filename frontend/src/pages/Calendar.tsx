import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { CalendarEvent, CalendarEvents, CalendarStatus } from "../api/types";
import { Icon } from "../components/Icon";
import { Card, EmptyState, PageHeader, Segmented, Toggle } from "../components/ui";
import { useResource } from "../hooks/useResource";
import { dateParts, formatDateTime } from "../utils/format";
import { holidayOn, holidaysOf, ymd } from "../utils/holidays";
import { meninyFor } from "../utils/meniny";

/**
 * Kalendár: Google Kalendár (OAuth 2.0, iba čítanie) a/alebo súkromná iCal adresa.
 * Slovenské dni a mesiace, meniny, štátne sviatky; časové pásmo Europe/Bratislava.
 * Pri výpadku internetu sa zobrazia posledné uložené udalosti s označením „nesynchronizované“.
 */

const TIME = new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bratislava" });
const DAY_LONG = new Intl.DateTimeFormat("sk-SK", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Bratislava" });
const MONTH = new Intl.DateTimeFormat("sk-SK", { month: "long", year: "numeric" });
const DOW = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(x, -((x.getDay() + 6) % 7));
}

/** Udalosti, ktoré zasahujú do daného dňa (celodenné: koniec je exkluzívny). */
export function eventsOn(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const d = ymd(day);
  return events.filter((e) => {
    const s = e.start.slice(0, 10);
    const en = e.end.slice(0, 10);
    return e.all_day ? s <= d && d < (en > s ? en : s + "~") : s <= d && d <= en;
  });
}

export function eventTime(e: CalendarEvent): string {
  return e.all_day ? "celý deň" : TIME.format(new Date(e.start));
}

function useEvents(from: Date, to: Date) {
  return useResource<CalendarEvents>(`/api/calendar/events?start=${ymd(from)}&end=${ymd(to)}`, 5 * 60000);
}

function SyncNote({ data }: { data: CalendarEvents | null }) {
  if (!data || data.sources === 0) return null;
  if (data.stale)
    return (
      <p className="cal-sync is-stale" role="status">
        <Icon name="offline" size={16} /> Nesynchronizované{data.synced_at ? ` – posledné údaje ${formatDateTime(data.synced_at)}` : ""}
      </p>
    );
  return <p className="cal-sync">Synchronizované {data.synced_at ? formatDateTime(data.synced_at) : ""}</p>;
}

// --- Karta na hlavnej obrazovke ------------------------------------------------------------

export function CalendarCard() {
  const nav = useNavigate();
  const now = new Date();
  const { weekday, day, month } = dateParts(now);
  const meniny = meninyFor(now);
  const holiday = holidayOn(now);
  const ev = useEvents(now, addDays(now, 14));
  const upcoming = useMemo(() => {
    const t = new Date();
    return (ev.data?.events ?? []).filter((e) => (e.all_day ? e.end.slice(0, 10) > ymd(t) : new Date(e.end) >= t)).slice(0, 3);
  }, [ev.data]);
  const label = (e: CalendarEvent) => {
    const d = e.start.slice(0, 10);
    const when = d === ymd(now) ? "" : d === ymd(addDays(now, 1)) ? "zajtra " : `${new Date(d).getDate()}.${new Date(d).getMonth() + 1}. `;
    return `${when}${eventTime(e)}`;
  };
  return (
    <Card title="Kalendár" icon="calendar" onOpen={() => nav("/kalendar")} className="cal-card">
      <div className="cal-card__date">
        <strong>{day}</strong>
        <span>
          {weekday}
          <br />
          {month}
        </span>
      </div>
      <ul className="cal-card__list">
        {holiday && (
          <li className="is-holiday">
            <Icon name="star" size={14} filled /> {holiday.name}
          </li>
        )}
        {upcoming.map((e) => (
          <li key={e.source_id + e.uid + e.start}>
            <time>{label(e)}</time> {e.title}
          </li>
        ))}
        {!holiday && upcoming.length === 0 && <li className="muted">{ev.data?.sources ? "Žiadne udalosti" : "Kalendár nie je prepojený"}</li>}
      </ul>
      {ev.data?.stale && <span className="cal-card__stale">nesynchronizované</span>}
      <div className="cal-pill">{meniny ? `Meniny: ${meniny}` : "Dnes nemá meniny nikto"}</div>
    </Card>
  );
}

// --- Zobrazenia ---------------------------------------------------------------------------

function EventItem({ e }: { e: CalendarEvent }) {
  return (
    <li className="cal-ev">
      <i style={{ background: e.color || "var(--accent)" }} />
      <time>{eventTime(e)}</time>
      <span>
        <strong>{e.title}</strong>
        {(e.location || e.calendar) && <small>{[e.location, e.calendar].filter(Boolean).join(" · ")}</small>}
      </span>
    </li>
  );
}

function DayBlock({ day, events }: { day: Date; events: CalendarEvent[] }) {
  const h = holidayOn(day);
  const m = meninyFor(day);
  const list = eventsOn(events, day);
  const today = ymd(day) === ymd(new Date());
  return (
    <section className={`cal-day ${today ? "is-today" : ""}`}>
      <header>
        <strong>{cap(DAY_LONG.format(day))}</strong>
        {h && <span className="cal-holiday">{h.name}</span>}
        {m && <span className="muted small">Meniny: {m}</span>}
      </header>
      {list.length ? (
        <ul>
          {list.map((e) => (
            <EventItem key={e.source_id + e.uid + e.start} e={e} />
          ))}
        </ul>
      ) : (
        <p className="muted small">Bez udalostí</p>
      )}
    </section>
  );
}

function MonthGrid({ month, events, selected, onSelect }: { month: Date; events: CalendarEvent[]; selected: Date; onSelect: (d: Date) => void }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const hol = holidaysOf(month.getFullYear());
  return (
    <div className="cal-month" role="grid" aria-label={cap(MONTH.format(month))}>
      {DOW.map((d) => (
        <span key={d} className="cal-month__dow">
          {d}
        </span>
      ))}
      {days.map((d) => {
        const inMonth = d.getMonth() === month.getMonth();
        const n = eventsOn(events, d).length;
        const h = hol.get(ymd(d)) ?? holidayOn(d);
        const cls = [inMonth ? "" : "is-out", ymd(d) === ymd(new Date()) ? "is-today" : "", ymd(d) === ymd(selected) ? "is-sel" : "", h ? "is-holiday" : "", d.getDay() === 0 || d.getDay() === 6 ? "is-weekend" : ""].join(" ");
        return (
          <button key={ymd(d)} type="button" className={`cal-month__day ${cls}`} onClick={() => onSelect(d)} aria-label={`${DAY_LONG.format(d)}${h ? `, ${h.name}` : ""}${n ? `, ${n} udalostí` : ""}`}>
            <span>{d.getDate()}</span>
            {n > 0 && <i className="cal-dots">{"•".repeat(Math.min(n, 3))}</i>}
          </button>
        );
      })}
    </div>
  );
}

// --- Nastavenia zdrojov ---------------------------------------------------------------

function Sources({ onChange }: { onChange: () => void }) {
  const st = useResource<CalendarStatus>("/api/calendar/status", 60000);
  const [params] = useSearchParams();
  const [name, setName] = useState("Môj kalendár");
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(() => {
    const g = params.get("google");
    if (g === "ok") return { ok: true, text: "Google Kalendár je prepojený." };
    if (g === "chyba") return { ok: false, text: `Prepojenie Google zlyhalo: ${params.get("detail") ?? ""}` };
    return null;
  });
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    await st.refresh();
    onChange();
  };
  const addIcal = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.post("/api/calendar/ical", { name, url });
      setUrl("");
      setMsg({ ok: true, text: "iCal kalendár je pridaný a synchronizovaný." });
      await refresh();
    } catch (ex) {
      setMsg({ ok: false, text: ex instanceof ApiError ? ex.message : "Pridanie zlyhalo" });
    } finally {
      setBusy(false);
    }
  };
  const google = async () => {
    setMsg(null);
    try {
      const r = await api.get<{ url: string }>("/api/calendar/google/start");
      window.location.assign(r.url);
    } catch (ex) {
      setMsg({ ok: false, text: ex instanceof ApiError ? ex.message : "Prihlásenie nie je dostupné" });
    }
  };
  const data = st.data;
  return (
    <Card title="Prepojené kalendáre" icon="settings">
      {data?.sources.length ? (
        <ul className="cal-sources">
          {data.sources.map((s) => (
            <li key={s.id}>
              <div className="cal-sources__head">
                <Icon name={s.kind === "google" ? "calendar" : "link"} size={20} />
                <span>
                  <strong>{s.name}</strong>
                  <small className="muted">{s.kind === "google" ? s.account : "súkromná iCal adresa (uložená šifrovane)"}</small>
                  <small className={s.last_error ? "card-error" : "muted"}>{s.last_error ? s.last_error : s.last_ok ? `Synchronizované ${formatDateTime(s.last_ok)}` : "Čaká na synchronizáciu"}</small>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Odpojiť ${s.name}`}
                  onClick={async () => {
                    await api.del(`/api/calendar/sources/${s.id}`);
                    await refresh();
                  }}
                >
                  <Icon name="trash" size={20} />
                </button>
              </div>
              {s.kind === "google" &&
                s.calendars.map((c) => (
                  <div key={c.cal_id} className="row row--between gap-s cal-sources__cal">
                    <span>
                      <i className="cal-color" style={{ background: c.color || "var(--accent)" }} /> {c.name}
                    </span>
                    <Toggle
                      label={`Zobraziť ${c.name}`}
                      checked={c.selected}
                      onChange={async (v) => {
                        await api.patch(`/api/calendar/sources/${s.id}/calendars`, { cal_id: c.cal_id, selected: v });
                        await refresh();
                      }}
                    />
                  </div>
                ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Zatiaľ nie je prepojený žiadny kalendár.</p>
      )}
      <div className="row gap-s wrap">
        <button type="button" className="btn btn--primary" onClick={() => void google()} disabled={!data?.google_configured} title={data?.google_configured ? "" : "Google Kalendár nie je nastavený – pozri návod"}>
          <Icon name="calendar" size={18} /> Pripojiť Google Kalendár
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await api.post("/api/calendar/sync");
            window.setTimeout(() => void refresh(), 3000);
          }}
        >
          <Icon name="refresh" size={18} /> Synchronizovať teraz
        </button>
      </div>
      {data && !data.google_configured && <p className="muted small">Google Kalendár ešte nie je nastavený na tomto zariadení (Client ID v backend/.env) – postup je v návode docs/GOOGLE_KALENDAR.md.</p>}
      {data?.google_configured && <p className="muted small">Prihlásenie Google sa spúšťa priamo na displeji zariadenia ({data.google_login_host}); heslo zadávate iba na stránke Google.</p>}
      <form className="radio-custom" onSubmit={(e) => void addIcal(e)}>
        <label>
          Názov
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </label>
        <label>
          Súkromná adresa vo formáte iCal (Google Kalendár → Nastavenia kalendára → Tajná adresa vo formáte iCal)
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" />
        </label>
        <button type="submit" className="btn" disabled={busy}>
          <Icon name="link" size={18} /> {busy ? "Overuje sa…" : "Pridať iCal kalendár"}
        </button>
      </form>
      {msg && <p className={msg.ok ? "ok-text" : "card-error"}>{msg.text}</p>}
    </Card>
  );
}

type View = "day" | "week" | "month";

export function CalendarPage() {
  const [view, setView] = useState<View>("day");
  const [selected, setSelected] = useState(() => new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const from = view === "month" ? startOfWeek(month) : view === "week" ? startOfWeek(selected) : new Date(new Date().setHours(0, 0, 0, 0));
  const to = view === "month" ? addDays(startOfWeek(month), 42) : addDays(from, view === "week" ? 7 : 8);
  const ev = useEvents(from, to);
  const events = ev.data?.events ?? [];
  useEffect(() => {
    if (view === "month") setSelected((s) => (s.getMonth() === month.getMonth() ? s : month));
  }, [month, view]);
  return (
    <>
      <PageHeader title="Kalendár" subtitle={cap(DAY_LONG.format(new Date()))} />
      <div className="cal-page">
        <Card>
          <div className="row row--between gap-s wrap">
            <Segmented
              label="Zobrazenie"
              value={view}
              options={[
                { value: "day", label: "Dnes a najbližšie" },
                { value: "week", label: "Týždeň" },
                { value: "month", label: "Mesiac" },
              ]}
              onChange={(v) => setView(v as View)}
            />
            <SyncNote data={ev.data} />
          </div>
          {ev.error && !ev.data && <EmptyState icon="offline" title="Server je nedostupný" text="Udalosti sa nepodarilo načítať." tone="danger" />}
          {view === "day" && (
            <div className="cal-days">
              {Array.from({ length: 8 }, (_, i) => addDays(from, i))
                .filter((d, i) => i === 0 || eventsOn(events, d).length || holidayOn(d))
                .map((d) => (
                  <DayBlock key={ymd(d)} day={d} events={events} />
                ))}
            </div>
          )}
          {view === "week" && (
            <>
              <div className="cal-nav">
                <button type="button" className="round-btn" aria-label="Predchádzajúci týždeň" onClick={() => setSelected(addDays(selected, -7))}>
                  <Icon name="back" size={22} />
                </button>
                <strong>
                  {from.getDate()}. – {addDays(from, 6).getDate()}. {cap(MONTH.format(addDays(from, 6)))}
                </strong>
                <button type="button" className="round-btn" aria-label="Nasledujúci týždeň" onClick={() => setSelected(addDays(selected, 7))}>
                  <Icon name="chevron" size={22} />
                </button>
              </div>
              <div className="cal-days">
                {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
                  <DayBlock key={ymd(d)} day={d} events={events} />
                ))}
              </div>
            </>
          )}
          {view === "month" && (
            <>
              <div className="cal-nav">
                <button type="button" className="round-btn" aria-label="Predchádzajúci mesiac" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                  <Icon name="back" size={22} />
                </button>
                <strong>{cap(MONTH.format(month))}</strong>
                <button type="button" className="round-btn" aria-label="Nasledujúci mesiac" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                  <Icon name="chevron" size={22} />
                </button>
              </div>
              <div className="cal-month-wrap">
                <MonthGrid month={month} events={events} selected={selected} onSelect={setSelected} />
                <DayBlock day={selected} events={events} />
              </div>
            </>
          )}
        </Card>
        <Sources onChange={() => void ev.refresh()} />
      </div>
    </>
  );
}
