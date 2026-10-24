import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import {
  DAYS,
  MAX_SWITCH_POINTS,
  type DayKey,
  type HeatingCommand,
  type HeatingMode,
  type HeatingSchedule,
  type HeatingState,
  type Reading,
  type SwitchPoint,
  type WeeklyProgram,
} from "../api/types";
import { Icon, type IconName } from "../components/Icon";
import { Modal, Tabs } from "../components/Modal";
import { TimeField } from "../components/TimeField";
import { ModeTiles, Thermostat, type ModeTile, type ThermostatAccent } from "../components/Thermostat";
import { Card, EmptyState, IntegrationNote, PageHeader, ReadingView, StatusBadge, Toggle } from "../components/ui";
import { useDevices } from "../hooks/devices";
import { useResource } from "../hooks/useResource";
import { formatTemp } from "../utils/format";
import {
  DAY_LABELS,
  DAY_NAMES,
  WEEKEND,
  WORKDAYS,
  cloneProgram,
  copyDay,
  dayError,
  dayKeyOf,
  daySegments,
  formatSwitch,
  fromMinutes,
  minutesOf,
  sortPoints,
  toMinutes,
} from "../utils/schedule";

const TZ = "Europe/Bratislava";

// --- Logika (bez grafiky) ------------------------------------------------------

export function useHeating() {
  return useDevices<HeatingState>("/api/heating");
}
export type HeatingCtl = ReturnType<typeof useHeating>;

export const HEATING_MODE_TILES: ModeTile<HeatingMode>[] = [
  { value: "auto", label: "Auto", icon: "autoA", accent: "heat" },
  { value: "manual", label: "Manuál", icon: "hand", accent: "heat" },
  { value: "temporary", label: "Dočasná", icon: "clock", accent: "heat" },
  { value: "eco", label: "ECO", icon: "leaf", accent: "eco" },
  { value: "holiday", label: "Dovolenka", icon: "suitcase", accent: "setback" },
];

const LEVEL_NAME = { comfort: "Komfort", eco: "Útlm" } as const;

export function heatingAccent(s: HeatingState): ThermostatAccent {
  if (s.mode === "eco") return "eco";
  if (s.mode === "holiday" && s.holiday_active) return "setback";
  if ((s.mode === "auto" || s.mode === "holiday") && s.active_level === "eco") return "setback";
  return "heat";
}

export function heatingModeLabel(s: HeatingState): string {
  switch (s.mode) {
    case "auto":
      return `Auto · ${LEVEL_NAME[s.active_level ?? "comfort"]}`;
    case "manual":
      return "Manuál";
    case "temporary":
      return "Dočasná zmena";
    case "eco":
      return "ECO / útlm";
    case "holiday":
      return s.holiday_active ? "Dovolenka" : `Auto · ${LEVEL_NAME[s.active_level ?? "comfort"]}`;
  }
}

/** Bezpečný rozsah podľa režimu: dovolenka najviac 20 °C, útlm nie vyšší ako komfort. */
export const heatingMax = (s: HeatingState) => (s.mode === "holiday" ? 20 : s.mode === "eco" ? s.comfort_temp : s.max_temp);

const accentIcon = (a: ThermostatAccent): IconName => (a === "eco" ? "leaf" : a === "setback" ? "moon" : "flame");

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" });

/** Čo je aktívne a kedy nastane ďalšia zmena – jedna veta pre používateľa. */
export function heatingStatus(s: HeatingState): string {
  const next = s.next_switch ? ` · ďalšia zmena ${formatSwitch(s.next_switch.at)} → ${LEVEL_NAME[s.next_switch.level]} ${formatTemp(s.next_switch.temp)}` : "";
  switch (s.mode) {
    case "auto":
      return `Program ${s.active_program} · teraz ${LEVEL_NAME[s.active_level ?? "comfort"]} ${formatTemp(s.target_temp)}${next}`;
    case "temporary":
      return `Dočasne ${formatTemp(s.target_temp)}${s.temporary_until ? ` do ${formatSwitch(s.temporary_until)}` : ""}, potom podľa programu ${s.active_program}`;
    case "manual":
      return `Manuál · trvalo ${formatTemp(s.target_temp)}`;
    case "eco":
      return `ECO / útlm · trvalo ${formatTemp(s.target_temp)}`;
    case "holiday":
      return s.holiday_active && s.holiday
        ? `Dovolenka do ${fmtDate(s.holiday.end)} · ${formatTemp(s.target_temp)}`
        : `Dovolenka od ${s.holiday ? fmtDate(s.holiday.start) : "–"} · zatiaľ podľa programu${next}`;
  }
}

function sendMode(h: HeatingCtl, s: HeatingState, mode: HeatingMode, openHoliday: () => void) {
  if (mode === "holiday" && !s.holiday) return openHoliday();
  const body: HeatingCommand = { mode };
  if (mode === "temporary" || mode === "manual") body.target_temp = s.target_temp;
  void h.send(s.device_id, body);
}

// --- Spoločný regulátor kúrenia --------------------------------------------------

function HeatingThermostat({ h, s, size }: { h: HeatingCtl; s: HeatingState; size: number }) {
  const accent = heatingAccent(s);
  return (
    <Thermostat
      value={s.target_temp}
      current={s.current_temp}
      min={s.min_temp}
      max={heatingMax(s)}
      accent={accent}
      icon={accentIcon(accent)}
      modeLabel={heatingModeLabel(s)}
      label="Požadovaná teplota kúrenia"
      size={size}
      pending={h.busy === s.device_id}
      resetKey={h.failures}
      onCommit={(v) => void h.send(s.device_id, { target_temp: v })}
    />
  );
}

// --- Kompaktná karta na hlavnej obrazovke ------------------------------------------

export function HeatingCard({ h, onOpen }: { h: HeatingCtl; onOpen: () => void }) {
  const r = h.data?.[0];
  return (
    <Card title="Kúrenie" icon="heat" onOpen={onOpen} className="card--thermo" badge={<StatusBadge reading={r ?? null} compact hideDemo />}>
      <ReadingView reading={r} error={h.error} loading={h.loading}>
        {(s) => {
          const level = s.target_temp === s.comfort_temp ? "comfort" : s.target_temp === s.eco_temp ? "eco" : null;
          return (
            <div className="thermo-card">
              <HeatingThermostat h={h} s={s} size={250} />
              <ModeTiles label="Režim kúrenia" value={s.mode} options={HEATING_MODE_TILES} onChange={(m) => sendMode(h, s, m, onOpen)} />
              <div className="daynight" role="radiogroup" aria-label="Dočasne komfort alebo útlm">
                {(
                  [
                    ["comfort", "Deň", "sun", s.comfort_temp],
                    ["eco", "Noc", "moon", s.eco_temp],
                  ] as const
                ).map(([lvl, label, icon, temp]) => (
                  <button
                    key={lvl}
                    type="button"
                    role="radio"
                    aria-checked={level === lvl}
                    className={level === lvl ? "is-active" : ""}
                    title={`${LEVEL_NAME[lvl]} ${formatTemp(temp)}`}
                    onClick={() => void h.send(s.device_id, s.mode === "manual" ? { target_temp: temp } : { mode: "temporary", target_temp: temp })}
                  >
                    <Icon name={icon} size={20} filled={icon === "moon"} /> {label}
                  </button>
                ))}
              </div>
              {h.cmdError && <p className="card-error">{h.cmdError}</p>}
            </div>
          );
        }}
      </ReadingView>
    </Card>
  );
}

// --- Detailné okno -------------------------------------------------------------------

type Tab = "week" | "manual" | "settings";

function TempStep({ label, icon, value, min, max, onChange, disabled }: { label: string; icon?: IconName; value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="stepper">
      <span className="stepper__label">
        {icon && <Icon name={icon} size={18} />} {label}
      </span>
      <div className="stepper__ctrl">
        <button type="button" className="round-btn round-btn--sm" aria-label={`${label} – znížiť`} disabled={disabled || value <= min} onClick={() => onChange(Math.round((value - 0.5) * 2) / 2)}>
          <Icon name="minus" size={18} />
        </button>
        <output>{formatTemp(value)}</output>
        <button type="button" className="round-btn round-btn--sm" aria-label={`${label} – zvýšiť`} disabled={disabled || value >= max} onClick={() => onChange(Math.round((value + 0.5) * 2) / 2)}>
          <Icon name="plus" size={18} />
        </button>
      </div>
    </div>
  );
}

function Timeline({ program, day, isToday, comfort, eco }: { program: WeeklyProgram; day: DayKey; isToday: boolean; comfort: number; eco: number }) {
  const segs = daySegments(program, day);
  const now = minutesOf(new Date(), TZ);
  return (
    <div className="timeline">
      <div className="timeline__axis" aria-hidden="true">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {h}:00
          </span>
        ))}
      </div>
      <div className="timeline__bar" role="img" aria-label={`Program na ${DAY_NAMES[day]}: ${segs.map((s) => `${fromMinutes(s.from)}–${fromMinutes(s.to)} ${LEVEL_NAME[s.level]}`).join(", ")}`}>
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} className="timeline__hour" style={{ left: `${(i / 24) * 100}%` }} />
        ))}
        {segs.map((s) => (
          <span
            key={s.from}
            className={`timeline__seg timeline__seg--${s.level}`}
            style={{ left: `${(s.from / 1440) * 100}%`, width: `${((s.to - s.from) / 1440) * 100}%` }}
            title={`${fromMinutes(s.from)} – ${fromMinutes(s.to)} · ${LEVEL_NAME[s.level]}`}
          />
        ))}
        {isToday && <b className="timeline__now" style={{ left: `${(now / 1440) * 100}%` }} title="Teraz" />}
      </div>
      <div className="timeline__legend">
        <span>
          <i className="timeline__key timeline__key--comfort" /> Komfortná teplota ({formatTemp(comfort)})
        </span>
        <span>
          <i className="timeline__key timeline__key--eco" /> Útlmová teplota ({formatTemp(eco)})
        </span>
      </div>
    </div>
  );
}

function WeekEditor({
  h,
  s,
  schedule,
  program,
  onSaved,
}: {
  h: HeatingCtl;
  s: HeatingState;
  schedule: HeatingSchedule;
  program: 1 | 2;
  onSaved: (sch: HeatingSchedule) => void;
}) {
  const saved = schedule.programs[String(program) as "1" | "2"];
  const [draft, setDraft] = useState<WeeklyProgram>(() => cloneProgram(saved));
  const [day, setDay] = useState<DayKey>(() => dayKeyOf(new Date(), TZ));
  const [clip, setClip] = useState<DayKey | null>(null);
  const [state, setState] = useState<{ saving: boolean; error: string | null; ok: boolean }>({ saving: false, error: null, ok: false });

  useEffect(() => setDraft(cloneProgram(saved)), [saved]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const errors = DAYS.map((d) => [d, dayError(draft[d], MAX_SWITCH_POINTS)] as const).filter(([, e]) => e);
  const points = draft[day];
  const today = dayKeyOf(new Date(), TZ);

  const update = (pts: SwitchPoint[], d: DayKey = day) => {
    setDraft((p) => ({ ...p, [d]: pts }));
    setState((x) => ({ ...x, ok: false }));
  };
  const setPoint = (i: number, patch: Partial<SwitchPoint>) => update(sortPoints(points.map((p, j) => (j === i ? { ...p, ...patch } : p))));

  const addPoint = () => {
    const last = points[points.length - 1];
    let t = last ? Math.min(toMinutes(last.time) + 60, 23 * 60 + 50) : 12 * 60;
    while (points.some((p) => p.time === fromMinutes(t)) && t > 0) t -= 10;
    update(sortPoints([...points, { time: fromMinutes(t), level: last?.level === "comfort" ? "eco" : "comfort", enabled: true }]));
  };

  const copyTo = (targets: readonly DayKey[]) => {
    setDraft((p) => copyDay(p, day, targets.filter((d) => d !== day)));
    setState((x) => ({ ...x, ok: false }));
  };

  const save = async () => {
    setState({ saving: true, error: null, ok: false });
    try {
      const out = await api.put<HeatingSchedule>(`/api/heating/${s.device_id}/schedule/${program}`, draft);
      onSaved(out);
      void h.refresh();
      setState({ saving: false, error: null, ok: true });
    } catch (e) {
      setState({ saving: false, error: e instanceof ApiError ? e.message : "Uloženie zlyhalo", ok: false });
    }
  };

  const enabledPts = points.filter((p) => p.enabled);
  const endOf = (i: number) => {
    const nextEnabled = points.slice(i + 1).find((p) => p.enabled);
    return nextEnabled ? nextEnabled.time : "24:00";
  };

  return (
    <div className="week">
      <div className="daytabs" role="tablist" aria-label="Deň v týždni">
        {DAYS.map((d) => (
          <button key={d} type="button" role="tab" aria-selected={d === day} className={`${d === day ? "is-active" : ""} ${d === today ? "is-today" : ""}`} onClick={() => setDay(d)}>
            {DAY_LABELS[d]}
          </button>
        ))}
      </div>

      <Timeline program={draft} day={day} isToday={day === today && program === s.active_program} comfort={s.comfort_temp} eco={s.eco_temp} />

      <div className="week__body">
        <ul className="slots" aria-label={`Prepínacie časy – ${DAY_NAMES[day]}`}>
          {points.length === 0 && <li className="slots__empty">Žiadne prepínacie časy – celý deň platí {LEVEL_NAME[daySegments(draft, day)[0].level].toLowerCase()}.</li>}
          {points.map((p, i) => (
            <li key={`${p.time}-${i}`} className={`slot ${p.enabled ? "" : "is-off"}`}>
              <span className="slot__time">
                <TimeField value={p.time} label={`Začiatok úseku ${i + 1}`} onChange={(time) => setPoint(i, { time })} />
                <span>– {p.enabled ? endOf(i) : "vypnutý"}</span>
              </span>
              <span className="slot__temp">{formatTemp(p.level === "comfort" ? s.comfort_temp : s.eco_temp)}</span>
              <Icon name={p.level === "comfort" ? "sun" : "moon"} size={20} className={`slot__icon slot__icon--${p.level}`} filled={p.level === "eco"} />
              <Toggle label={`Úsek ${p.time}: komfortná teplota`} checked={p.level === "comfort"} onChange={(on) => setPoint(i, { level: on ? "comfort" : "eco" })} />
              <button type="button" className="icon-btn icon-btn--sm" aria-label={`Odstrániť úsek ${p.time}`} onClick={() => update(points.filter((_, j) => j !== i))}>
                <Icon name="trash" size={18} />
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="btn btn--ghost slots__add" onClick={addPoint} disabled={points.length >= MAX_SWITCH_POINTS}>
              <Icon name="plus" size={18} /> Pridať časový úsek
              <span className="muted small">
                {points.length}/{MAX_SWITCH_POINTS}
              </span>
            </button>
          </li>
        </ul>

        <div className="copy-btns">
          {clip && clip !== day ? (
            <button type="button" className="btn btn--ghost" onClick={() => (copyTo([day]), setClip(null))}>
              <Icon name="copy" size={18} /> Vložiť {DAY_LABELS[clip]} → {DAY_LABELS[day]}
            </button>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={() => setClip(clip ? null : day)} aria-pressed={clip === day}>
              <Icon name="copy" size={18} /> {clip === day ? "Vyberte cieľový deň" : "Kopírovať deň"}
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={() => copyTo(WORKDAYS)}>
            <Icon name="copy" size={18} /> Kopírovať Po–Pi
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => copyTo(WEEKEND)}>
            <Icon name="copy" size={18} /> Kopírovať So–Ne
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => copyTo(DAYS)}>
            <Icon name="copy" size={18} /> Celý týždeň
          </button>
        </div>
      </div>

      <footer className="week__foot">
        <span className={`week__state ${state.error || errors.length ? "is-error" : ""}`} role="status">
          {state.error ??
            (errors.length
              ? `${DAY_LABELS[errors[0][0]]}: ${errors[0][1]}`
              : state.saving
                ? "Ukladá sa…"
                : dirty
                  ? "Neuložené zmeny"
                  : state.ok
                    ? "Harmonogram uložený"
                    : `${enabledPts.length} prepínacích časov · ${DAY_NAMES[day]}`)}
        </span>
        <button type="button" className="btn" disabled={!dirty || state.saving} onClick={() => setDraft(cloneProgram(saved))}>
          Zrušiť
        </button>
        <button type="button" className="btn btn--primary" disabled={!dirty || state.saving || errors.length > 0} onClick={() => void save()}>
          Uložiť
        </button>
      </footer>
    </div>
  );
}

function ManualPanel({ h, s }: { h: HeatingCtl; s: HeatingState }) {
  const [manual, setManual] = useState(s.manual_temp);
  const [temp, setTemp] = useState(s.target_temp);
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const [hol, setHol] = useState(() => s.holiday ?? { start: todayIso, end: todayIso, temp: 12 });
  const send = (body: HeatingCommand) => void h.send(s.device_id, body);
  const holValid = hol.start && hol.end && hol.end >= hol.start && hol.end >= todayIso;

  return (
    <div className="manual">
      <section className={`manual__row ${s.mode === "manual" ? "is-active" : ""}`}>
        <div>
          <h3>
            <Icon name="hand" size={18} /> Manuál
          </h3>
          <p className="muted small">Trvalá ručná teplota, program sa nepoužíva.</p>
        </div>
        <TempStep label="Teplota" value={manual} min={s.min_temp} max={s.max_temp} onChange={setManual} />
        <button type="button" className="btn" onClick={() => send({ mode: "manual", target_temp: manual })}>
          {s.mode === "manual" ? "Zmeniť" : "Zapnúť manuál"}
        </button>
      </section>

      <section className={`manual__row ${s.mode === "temporary" ? "is-active" : ""}`}>
        <div>
          <h3>
            <Icon name="clock" size={18} /> Dočasná zmena
          </h3>
          <p className="muted small">
            Platí do nasledujúceho prepínacieho času
            {s.mode === "temporary" && s.temporary_until ? ` (${formatSwitch(s.temporary_until)})` : ""}, potom sa vráti program.
          </p>
        </div>
        <TempStep label="Teplota" value={temp} min={s.min_temp} max={s.max_temp} onChange={setTemp} />
        <button type="button" className="btn" onClick={() => send({ mode: "temporary", target_temp: temp })}>
          Nastaviť dočasne
        </button>
      </section>

      <section className={`manual__row ${s.mode === "eco" ? "is-active" : ""}`}>
        <div>
          <h3>
            <Icon name="leaf" size={18} /> ECO / útlm
          </h3>
          <p className="muted small">Trvalo útlmová teplota {formatTemp(s.eco_temp)}.</p>
        </div>
        <span />
        <button type="button" className="btn" onClick={() => send({ mode: "eco" })} disabled={s.mode === "eco"}>
          Zapnúť ECO
        </button>
      </section>

      <section className={`manual__row manual__row--holiday ${s.mode === "holiday" ? "is-active" : ""}`}>
        <div>
          <h3>
            <Icon name="suitcase" size={18} /> Dovolenka
          </h3>
          <p className="muted small">Od–do s vlastnou teplotou (5–20 °C), potom automaticky späť na program.</p>
        </div>
        <div className="holiday">
          <label className="field">
            <span>Od</span>
            <input type="date" value={hol.start} min={todayIso} onChange={(e) => setHol({ ...hol, start: e.target.value })} />
          </label>
          <label className="field">
            <span>Do</span>
            <input type="date" value={hol.end} min={hol.start || todayIso} onChange={(e) => setHol({ ...hol, end: e.target.value })} />
          </label>
          <TempStep label="Teplota" value={hol.temp} min={5} max={20} onChange={(t) => setHol({ ...hol, temp: t })} />
        </div>
        <div className="row gap-s wrap">
          <button type="button" className="btn" disabled={!holValid} onClick={() => send({ mode: "holiday", holiday: hol })}>
            {s.mode === "holiday" ? "Zmeniť dovolenku" : "Nastaviť dovolenku"}
          </button>
          {s.mode === "holiday" && (
            <button type="button" className="btn btn--ghost" onClick={() => send({ mode: "auto" })}>
              Zrušiť
            </button>
          )}
        </div>
      </section>

      {s.mode !== "auto" && (
        <button type="button" className="btn btn--primary" onClick={() => send({ mode: "auto" })}>
          <Icon name="autoA" size={18} /> Späť na AUTO (program {s.active_program})
        </button>
      )}
    </div>
  );
}

function SettingsPanel({ h, s, reload }: { h: HeatingCtl; s: HeatingState; reload: () => void }) {
  return (
    <div className="manual">
      <TempStep label="Komfortná (denná) teplota" icon="sun" value={s.comfort_temp} min={Math.max(s.eco_temp, 10)} max={s.max_temp} onChange={(v) => void h.send(s.device_id, { comfort_temp: v })} />
      <TempStep label="Útlmová (nočná) teplota" icon="moon" value={s.eco_temp} min={s.min_temp} max={s.comfort_temp} onChange={(v) => void h.send(s.device_id, { eco_temp: v })} />
      <dl className="kv mt">
        <dt>Vykurovací okruh</dt>
        <dd>
          {s.circuit} · {s.name}
        </dd>
        <dt>Aktívny program</dt>
        <dd>Program {s.active_program}</dd>
        <dt>Teplota vody</dt>
        <dd>{formatTemp(s.water_temp)}</dd>
        <dt>Kotol</dt>
        <dd>{s.heating_active ? "kúri" : "nekúri"}</dd>
        <dt>Časové pásmo</dt>
        <dd>Europe/Bratislava (letný/zimný čas)</dd>
      </dl>
      <button type="button" className="btn btn--ghost" onClick={reload}>
        Načítať uložené harmonogramy
      </button>
      <IntegrationNote name="Buderus Logamatic RC300" text="Regulátor RC300 je pripojený ku kotlu Logamax plus GB172-24 T50 cez zbernicu EMS/EMS+. Zostáva hlavným regulátorom a programy sú uložené v ňom. Brána BBQKees EMS Gateway E32 V2 sa ešte overuje; do pripojenia sa v režime LIVE zobrazí stav Nedostupné." />
    </div>
  );
}

export function HeatingDetail({ h }: { h: HeatingCtl }) {
  const r = h.data?.[0];
  const s = r?.data ?? null;
  const [tab, setTab] = useState<Tab>("week");
  const [program, setProgram] = useState<1 | 2>(s?.active_program ?? 1);
  const sched = useResource<Reading<HeatingSchedule>>(s ? `/api/heating/${s.device_id}/schedule` : null, 0);
  const schedule = sched.data?.data ?? null;
  const setSchedule = (sch: HeatingSchedule) => sched.setData((prev) => (prev ? { ...prev, data: sch, status: "ok" } : prev));
  const tabs = useMemo(
    () => [
      { value: "week" as const, label: "Týždenný program" },
      { value: "manual" as const, label: "Ručné nastavenie" },
      { value: "settings" as const, label: "Nastavenia" },
    ],
    [],
  );

  if (!s) return <ReadingView reading={r} error={h.error} loading={h.loading}>{() => null}</ReadingView>;

  return (
    <div className="tdetail">
      <div className="tdetail__left">
        <HeatingThermostat h={h} s={s} size={330} />
        <ModeTiles label="Prevádzkový režim" value={s.mode} options={HEATING_MODE_TILES} onChange={(m) => sendMode(h, s, m, () => setTab("manual"))} />
        <p className="tdetail__status" role="status">
          {heatingStatus(s)}
        </p>
        {h.cmdError && <p className="card-error">{h.cmdError}</p>}
        <div className="program-tabs">
          {([1, 2] as const).map((n) => (
            <button key={n} type="button" className={program === n ? "is-active" : ""} aria-pressed={program === n} onClick={() => setProgram(n)}>
              Program {n}
              {s.active_program === n && <small>aktívny</small>}
            </button>
          ))}
        </div>
        {program !== s.active_program && (
          <button type="button" className="btn btn--ghost" onClick={() => void h.send(s.device_id, { active_program: program })}>
            Aktivovať program {program}
          </button>
        )}
      </div>

      <div className="tdetail__right">
        <Tabs label="Nastavenia kúrenia" value={tab} options={tabs} onChange={setTab} />
        {tab === "week" &&
          (schedule ? (
            <WeekEditor key={program} h={h} s={s} schedule={schedule} program={program} onSaved={setSchedule} />
          ) : (
            <ReadingView reading={sched.data} error={sched.error} loading={sched.loading}>
              {() => null}
            </ReadingView>
          ))}
        {tab === "manual" && <ManualPanel h={h} s={s} />}
        {tab === "settings" && <SettingsPanel h={h} s={s} reload={() => void sched.refresh()} />}
      </div>
    </div>
  );
}

export function HeatingModal({ h, onClose }: { h: HeatingCtl; onClose: () => void }) {
  return (
    <Modal title="Kúrenie" icon="flame" iconClass="accent-heat" onClose={onClose}>
      <HeatingDetail h={h} />
    </Modal>
  );
}

export function HeatingPage() {
  const h = useHeating();
  const r = h.data?.[0];
  return (
    <>
      <PageHeader title="Kúrenie" subtitle="Programovateľný termostat · Buderus RC300 (EMS/EMS+)" badge={<StatusBadge reading={r ?? null} />} />
      {h.error && !h.data ? <EmptyState icon="offline" title="OFFLINE" text={h.error.message} tone="danger" /> : <Card className="card--detail"><HeatingDetail h={h} /></Card>}
    </>
  );
}
