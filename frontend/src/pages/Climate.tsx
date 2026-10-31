import { useEffect, useMemo, useState } from "react";
import type { ClimateCapabilities, ClimateCommand, ClimateMode, ClimateState, FanSpeed, SwingPosition } from "../api/types";
import { Icon, type IconName } from "../components/Icon";
import { Modal, Tabs } from "../components/Modal";
import { TimeField } from "../components/TimeField";
import { ModeTiles, Thermostat, type ModeTile, type ThermostatAccent } from "../components/Thermostat";
import { Card, EmptyState, IntegrationNote, PageHeader, ReadingView, StatusBadge, Toggle } from "../components/ui";
import { useDevices } from "../hooks/devices";
import { formatTemp } from "../utils/format";
import { formatSwitch } from "../utils/schedule";

const TZ = "Europe/Bratislava";

// --- Logika (bez grafiky) ------------------------------------------------------

export function useClimate() {
  return useDevices<ClimateState>("/api/climate");
}
export type ClimateCtl = ReturnType<typeof useClimate>;

const ALL_MODES: ModeTile<ClimateMode>[] = [
  { value: "auto", label: "Auto", icon: "autoA", accent: "cool" },
  { value: "cool", label: "Chladenie", icon: "snowflake", accent: "cool" },
  { value: "heat", label: "Kúrenie", icon: "flame", accent: "heat" },
  { value: "fan", label: "Ventilátor", icon: "fan", accent: "cool" },
  { value: "dry", label: "Dry", icon: "drop", accent: "cool" },
];

const MODE_LABEL: Record<ClimateMode, string> = { auto: "Auto", cool: "Chladenie", heat: "Kúrenie", fan: "Ventilátor", dry: "Odvlhčovanie" };
const MODE_ICON: Record<ClimateMode, IconName> = { auto: "autoA", cool: "snowflake", heat: "flame", fan: "fan", dry: "drop" };

/** Zobrazia sa iba režimy, ktoré jednotka podľa konfigurácie podporuje. */
export const modeTiles = (caps: ClimateCapabilities) => ALL_MODES.filter((m) => caps.modes.includes(m.value));

interface View {
  power: boolean;
  mode: ClimateMode;
  eco: boolean;
  quiet: boolean;
}

export function climateAccent(v: View): ThermostatAccent {
  if (!v.power) return "off";
  if (v.eco) return "eco";
  return v.mode === "heat" ? "heat" : "cool";
}

export function climateLabel(v: View): string {
  if (!v.power) return "Vypnutá";
  return [MODE_LABEL[v.mode], v.eco && "ECO", v.quiet && "Tichý"].filter(Boolean).join(" · ");
}

/** V režime ventilátora sa teplota nereguluje. */
const tempDisabled = (v: View) => !v.power || v.mode === "fan";

const hhmm = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("sk-SK", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ }).format(new Date(iso)) : "";

/** Regulátor klimatizácie s potvrdzovaním príkazov – zdieľa ho karta aj kompaktná obrazovka. */
export function ClimateThermostat({ c, s, size, onCenterTap }: { c: ClimateCtl; s: ClimateState; size: number; onCenterTap?: () => void }) {
  return (
    <Thermostat
      value={s.target_temp}
      current={s.current_temp}
      min={s.capabilities.min_temp}
      max={s.capabilities.max_temp}
      step={s.capabilities.temp_step}
      accent={climateAccent(s)}
      icon={s.power ? MODE_ICON[s.mode] : "power"}
      modeLabel={climateLabel(s)}
      label="Požadovaná teplota klimatizácie"
      size={size}
      disabled={tempDisabled(s)}
      pending={c.busy === s.device_id}
      resetKey={c.failures}
      onCommit={(v) => void c.send(s.device_id, { target_temp: v })}
      onCenterTap={onCenterTap}
    />
  );
}

// --- Kompaktná karta -------------------------------------------------------------

export function ClimateCard({ c, onOpen }: { c: ClimateCtl; onOpen: () => void }) {
  const r = c.data?.[0];
  const s = r?.data;
  return (
    <Card
      title="Klíma"
      icon="thermo"
      onOpen={onOpen}
      className="card--thermo"
      badge={<StatusBadge reading={r ?? null} compact hideDemo />}
      actions={s && <Toggle label="Zapnúť alebo vypnúť klimatizáciu" checked={s.power} disabled={c.busy === s.device_id} onChange={(power) => void c.send(s.device_id, { power })} />}
    >
      <ReadingView reading={r} error={c.error} loading={c.loading}>
        {(s) => (
          <div className="thermo-card">
            <Thermostat
              value={s.target_temp}
              current={s.current_temp}
              min={s.capabilities.min_temp}
              max={s.capabilities.max_temp}
              step={s.capabilities.temp_step}
              accent={climateAccent(s)}
              icon={s.power ? MODE_ICON[s.mode] : "power"}
              modeLabel={climateLabel(s)}
              label="Požadovaná teplota klimatizácie"
              size={250}
              disabled={tempDisabled(s)}
              pending={c.busy === s.device_id}
              resetKey={c.failures}
              onCommit={(v) => void c.send(s.device_id, { target_temp: v })}
            />
            <ModeTiles label="Režim klimatizácie" value={s.mode} options={modeTiles(s.capabilities)} onChange={(mode) => void c.send(s.device_id, { mode })} disabled={!s.power} />
            {c.cmdError && <p className="card-error">{c.cmdError}</p>}
          </div>
        )}
      </ReadingView>
    </Card>
  );
}

// --- Detailné okno (zmeny sa odošlú tlačidlom Uložiť) ------------------------------

interface Draft {
  power: boolean;
  mode: ClimateMode;
  fan: FanSpeed;
  swing: SwingPosition | null;
  quiet: boolean;
  eco: boolean;
  target: number;
  timerOn: string;
  timerOnEnabled: boolean;
  timerOff: string;
  timerOffEnabled: boolean;
}

const draftOf = (s: ClimateState): Draft => ({
  power: s.power,
  mode: s.mode,
  fan: s.fan,
  swing: s.swing,
  quiet: s.quiet,
  eco: s.eco,
  target: s.target_temp,
  timerOn: hhmm(s.timer_on_at) || "07:00",
  timerOnEnabled: !!s.timer_on_at,
  timerOff: hhmm(s.timer_off_at) || "22:00",
  timerOffEnabled: !!s.timer_off_at,
});

/** Rozdiel medzi návrhom a potvrdeným stavom → príkaz iba so zmenenými položkami. */
export function diffCommand(s: ClimateState, d: Draft): ClimateCommand {
  const cmd: ClimateCommand = {};
  if (d.power !== s.power) cmd.power = d.power;
  if (d.mode !== s.mode) cmd.mode = d.mode;
  if (d.fan !== s.fan) cmd.fan = d.fan;
  if (d.swing !== s.swing && d.swing !== null) cmd.swing = d.swing;
  if (d.quiet !== s.quiet) cmd.quiet = d.quiet;
  if (d.eco !== s.eco) cmd.eco = d.eco;
  if (d.target !== s.target_temp) cmd.target_temp = d.target;
  if (d.timerOnEnabled && (!s.timer_on_at || d.timerOn !== hhmm(s.timer_on_at))) cmd.timer_on = d.timerOn;
  if (!d.timerOnEnabled && s.timer_on_at) cmd.timer_on = "";
  if (d.timerOffEnabled && (!s.timer_off_at || d.timerOff !== hhmm(s.timer_off_at))) cmd.timer_off = d.timerOff;
  if (!d.timerOffEnabled && s.timer_off_at) cmd.timer_off = "";
  return cmd;
}

function LevelTiles<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T | null; options: { value: T; node: React.ReactNode; title: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="level-tiles" role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} aria-label={o.title} title={o.title} className={o.value === value ? "is-active" : ""} disabled={disabled} onClick={() => onChange(o.value)}>
          {o.node}
        </button>
      ))}
    </div>
  );
}

/** Ikona polohy lamiel: čiara pod rôznym uhlom. */
function SwingIcon({ pos, of }: { pos: number; of: number }) {
  const angle = -40 + (80 * (pos - 1)) / Math.max(1, of - 1);
  return (
    <svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true">
      <rect x="2" y="2" width="22" height="4" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <g transform={`rotate(${angle} 13 8)`}>
        <path d="M13 8v11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function FanIcon({ level }: { level: number }) {
  return (
    <span className="fan-level">
      <Icon name="fan" size={14 + level * 2} />
    </span>
  );
}

type Tab = "settings" | "timer" | "advanced";

export function ClimateDetail({ c }: { c: ClimateCtl }) {
  const r = c.data?.[0];
  const s = r?.data ?? null;
  const [tab, setTab] = useState<Tab>("settings");
  const [draft, setDraft] = useState<Draft | null>(s ? draftOf(s) : null);
  const [saved, setSaved] = useState(false);
  const cmd = s && draft ? diffCommand(s, draft) : {};
  const dirty = Object.keys(cmd).length > 0;

  // Potvrdený stav zo servera prepíše návrh, iba ak používateľ nič nemení.
  useEffect(() => {
    if (s && (!draft || !dirty)) setDraft(draftOf(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const tabs = useMemo(() => {
    const t: { value: Tab; label: string }[] = [{ value: "settings", label: "Nastavenia" }];
    if (s?.capabilities.timer) t.push({ value: "timer", label: "Časovač" });
    t.push({ value: "advanced", label: "Pokročilé" });
    return t;
  }, [s?.capabilities.timer]);

  if (!s || !draft) return <ReadingView reading={r} error={c.error} loading={c.loading}>{() => null}</ReadingView>;
  const caps = s.capabilities;
  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setSaved(false);
  };
  const save = async () => {
    if (await c.send(s.device_id, cmd)) setSaved(true);
  };
  const pending = c.busy === s.device_id;

  return (
    <div className="tdetail">
      <div className="tdetail__left">
        <div className="tdetail__power">
          <span>{draft.power ? "Zapnutá" : "Vypnutá"}</span>
          <Toggle label="Zapnúť alebo vypnúť klimatizáciu" checked={draft.power} onChange={(power) => set({ power })} />
        </div>
        <Thermostat
          value={draft.target}
          current={s.current_temp}
          min={caps.min_temp}
          max={caps.max_temp}
          step={caps.temp_step}
          accent={climateAccent(draft)}
          icon={draft.power ? MODE_ICON[draft.mode] : "power"}
          modeLabel={climateLabel(draft)}
          label="Požadovaná teplota klimatizácie"
          size={330}
          disabled={tempDisabled(draft)}
          pending={pending}
          resetKey={c.failures}
          onCommit={(target) => set({ target })}
        />
        <ModeTiles label="Režim klimatizácie" value={draft.mode} options={modeTiles(caps)} onChange={(mode) => set({ mode })} disabled={!draft.power} />
        <p className="tdetail__status">
          {s.room ?? s.name} · aktuálne {formatTemp(s.current_temp)}
          {s.timer_on_at && ` · zapne sa ${formatSwitch(s.timer_on_at)}`}
          {s.timer_off_at && ` · vypne sa ${formatSwitch(s.timer_off_at)}`}
        </p>
      </div>

      <div className="tdetail__right">
        <Tabs label="Nastavenia klimatizácie" value={tab} options={tabs} onChange={setTab} />

        {tab === "settings" && (
          <div className="ac-settings">
            <section>
              <h3>Rýchlosť ventilátora</h3>
              {caps.fan_speeds > 0 ? (
                <LevelTiles
                  label="Rýchlosť ventilátora"
                  value={draft.fan}
                  disabled={!draft.power}
                  onChange={(fan) => set({ fan })}
                  options={[
                    ...Array.from({ length: caps.fan_speeds }, (_, i) => ({ value: String(i + 1) as FanSpeed, node: <FanIcon level={i + 1} />, title: `Stupeň ${i + 1}` })),
                    { value: "auto" as FanSpeed, node: <span>Auto</span>, title: "Automaticky" },
                  ]}
                />
              ) : (
                <p className="muted small">Jednotka podporuje iba automatické otáčky.</p>
              )}
            </section>

            {caps.swing_positions > 0 && (
              <section>
                <h3>Smer prúdenia</h3>
                <LevelTiles
                  label="Smer prúdenia"
                  value={draft.swing}
                  disabled={!draft.power}
                  onChange={(swing) => set({ swing })}
                  options={[
                    ...Array.from({ length: caps.swing_positions }, (_, i) => ({ value: String(i + 1) as SwingPosition, node: <SwingIcon pos={i + 1} of={caps.swing_positions} />, title: `Poloha ${i + 1}` })),
                    { value: "auto" as SwingPosition, node: <span>Auto</span>, title: "Kývanie lamiel" },
                  ]}
                />
              </section>
            )}

            <section>
              <div className="row row--between">
                <h3>Cieľová teplota</h3>
                <strong className="ac-target">{formatTemp(draft.target)}</strong>
              </div>
              <input
                type="range"
                className="range"
                min={caps.min_temp}
                max={caps.max_temp}
                step={caps.temp_step}
                value={draft.target}
                disabled={tempDisabled(draft)}
                aria-label="Cieľová teplota"
                style={{ ["--pct" as string]: `${((draft.target - caps.min_temp) / (caps.max_temp - caps.min_temp)) * 100}%` }}
                onChange={(e) => set({ target: Number(e.target.value) })}
              />
              <div className="range__ends">
                <span>{caps.min_temp} °C</span>
                <span>{caps.max_temp} °C</span>
              </div>
            </section>
          </div>
        )}

        {tab === "timer" && (
          <div className="ac-settings">
            {(
              [
                ["timerOn", "timerOnEnabled", "Zapnúť o", s.timer_on_at, "zapne"],
                ["timerOff", "timerOffEnabled", "Vypnúť o", s.timer_off_at, "vypne"],
              ] as const
            ).map(([key, en, label, at, verb]) => (
              <section key={key} className="timer-row">
                <Toggle label={`${label} – zapnúť časovač`} checked={draft[en]} onChange={(v) => set({ [en]: v } as Partial<Draft>)} />
                <div className="field field--inline">
                  <span>{label}</span>
                  <TimeField value={draft[key]} step={5} label={label} disabled={!draft[en]} onChange={(v) => set({ [key]: v } as Partial<Draft>)} />
                </div>
                <span className="muted small">{at ? `Naplánované: ${verb} sa ${formatSwitch(at)}` : "Nenaplánované"}</span>
              </section>
            ))}
            <p className="muted small">Čas platí pre Europe/Bratislava vrátane letného a zimného času. Časovač sa spustí raz, v najbližšom zadanom čase.</p>
          </div>
        )}

        {tab === "advanced" && (
          <div className="ac-settings">
            <dl className="kv">
              <dt>Režimy</dt>
              <dd>{caps.modes.map((m) => MODE_LABEL[m]).join(", ")}</dd>
              <dt>Ventilátor</dt>
              <dd>{caps.fan_speeds ? `${caps.fan_speeds} stupňov + auto` : "iba auto"}</dd>
              <dt>Smer prúdenia</dt>
              <dd>{caps.swing_positions ? `${caps.swing_positions} polôh + kývanie` : "nepodporované"}</dd>
              <dt>Tichý režim</dt>
              <dd>{caps.quiet ? "áno" : "nepodporované"}</dd>
              <dt>ECO režim</dt>
              <dd>{caps.eco ? "áno" : "nepodporované"}</dd>
              <dt>Časovač</dt>
              <dd>{caps.timer ? "áno" : "nepodporované"}</dd>
              <dt>Rozsah teplôt</dt>
              <dd>
                {caps.min_temp}–{caps.max_temp} °C po {caps.temp_step} °C
              </dd>
            </dl>
            <IntegrationNote
              name="Sinclair"
              text="Podporované funkcie sa nastavujú v konfigurácii zariadenia (devices.config.capabilities). Nepodporované funkcie sa nezobrazujú a server ich odmietne. Pripojenie skutočnej jednotky (lokálny protokol, bez cloudu) doplníme samostatným adaptérom."
            />
          </div>
        )}

        <footer className="ac-foot">
          {caps.quiet && (
            <label className="ac-foot__quiet">
              <Toggle label="Tichý režim" checked={draft.quiet} disabled={!draft.power} onChange={(quiet) => set({ quiet })} />
              Tichý režim
            </label>
          )}
          {caps.eco && (
            <button type="button" className={`eco-btn ${draft.eco ? "is-on" : ""}`} aria-pressed={draft.eco} disabled={!draft.power} onClick={() => set({ eco: !draft.eco })}>
              <Icon name="leaf" size={18} filled={draft.eco} /> ECO
            </button>
          )}
          <span className={`ac-foot__state ${c.cmdError ? "is-error" : ""}`} role="status">
            {c.cmdError ?? (pending ? "Odosiela sa…" : dirty ? "Neuložené zmeny" : saved ? "Uložené – potvrdené zariadením" : "")}
          </span>
          {dirty && (
            <button type="button" className="btn" disabled={pending} onClick={() => setDraft(draftOf(s))}>
              Zrušiť
            </button>
          )}
          <button type="button" className="btn btn--primary" disabled={!dirty || pending} onClick={() => void save()}>
            Uložiť
          </button>
        </footer>
      </div>
    </div>
  );
}

export function ClimateModal({ c, onClose }: { c: ClimateCtl; onClose: () => void }) {
  return (
    <Modal title="Klíma" icon="snowflake" iconClass="accent-cool" onClose={onClose}>
      <ClimateDetail c={c} />
    </Modal>
  );
}

export function ClimatePage() {
  const c = useClimate();
  const r = c.data?.[0];
  return (
    <>
      <PageHeader title="Klimatizácia" subtitle="Sinclair · chladenie aj vykurovanie" badge={<StatusBadge reading={r ?? null} />} />
      {c.error && !c.data ? <EmptyState icon="offline" title="OFFLINE" text={c.error.message} tone="danger" /> : <Card className="card--detail"><ClimateDetail c={c} /></Card>}
    </>
  );
}
