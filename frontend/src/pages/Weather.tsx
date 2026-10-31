import { useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import type { Reading, Weather, WeatherDay, WeatherHour } from "../api/types";
import skyDazd from "../assets/weather/sky-dazd.webp";
import skyHmla from "../assets/weather/sky-hmla.webp";
import skyJasno from "../assets/weather/sky-jasno.webp";
import skyPolojasno from "../assets/weather/sky-polojasno.webp";
import skySneh from "../assets/weather/sky-sneh.webp";
import skyZamracene from "../assets/weather/sky-zamracene.webp";
import { Icon } from "../components/Icon";
import { StatusBadge } from "../components/ui";
import { WxIcon, wmo, type SkyKind } from "../components/WxIcon";
import { useResource } from "../hooks/useResource";
import "../styles/weather.css";

/**
 * Počasie E4 – karta na úvodnej obrazovke, hlavná stránka (7 dní, 24 h, UV, slnko, vietor…),
 * detail dňa po hodinách. Radar je samostatná stránka (WeatherRadar), načíta sa až po otvorení.
 * Grafy sú statické SVG – prekreslia sa iba pri nových údajoch (šetrí Raspberry Pi 4).
 */

export function useWeather() {
  return useResource<Reading<Weather>>("/api/weather", 10 * 60000);
}

const SKY: Record<SkyKind, string> = {
  jasno: skyJasno,
  polojasno: skyPolojasno,
  zamracene: skyZamracene,
  dazd: skyDazd,
  sneh: skySneh,
  hmla: skyHmla,
};

// ---------- čas a formátovanie (Europe/Bratislava) ----------
const KEY = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
/** „2026-10-31T14:00“ pre aktuálnu hodinu v Bratislave (rovnaký tvar ako hodinová predpoveď). */
export function hourKey(d = new Date()): string {
  const s = KEY.format(d); // 2026-10-31 14
  return `${s.slice(0, 10)}T${s.slice(11, 13)}:00`;
}
const WD_SHORT = new Intl.DateTimeFormat("sk-SK", { weekday: "short", timeZone: "UTC" });
const WD_LONG = new Intl.DateTimeFormat("sk-SK", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const DM = new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "numeric", timeZone: "UTC" });
const CLOCK = new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava", hour: "2-digit", minute: "2-digit" });
const cap = (s: string) => s.charAt(0).toLocaleUpperCase("sk-SK") + s.slice(1);
const asDate = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
export function dayName(ymd: string, today: string): string {
  return ymd === today ? "Dnes" : cap(WD_SHORT.format(asDate(ymd)).replace(".", ""));
}
const dayLong = (ymd: string) => cap(WD_LONG.format(asDate(ymd)));
const hhmm = (iso?: string | null) => (iso ? iso.slice(11, 16) : "–");
const updatedAt = (r?: Reading<Weather> | null) =>
  r?.updated_at ? new Date(r.updated_at).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" }) : null;
const n0 = (v?: number | null) => (v == null ? "–" : String(Math.round(v)));
const n1 = (v?: number | null) => (v == null ? "–" : v.toFixed(1).replace(".", ","));
const DIRS = ["S", "SV", "V", "JV", "J", "JZ", "Z", "SZ"];
/** smer, odkiaľ fúka (meteorologický uhol) → skratka svetovej strany */
export const dirName = (deg?: number | null) => (deg == null ? "" : DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]);
export function uvLabel(uv?: number | null): string {
  if (uv == null) return "";
  if (uv < 3) return "nízky";
  if (uv < 6) return "stredný";
  if (uv < 8) return "vysoký";
  if (uv < 11) return "veľmi vysoký";
  return "extrémny";
}
/** rosný bod (Magnusov vzorec) z teploty a vlhkosti – odvodená, nie vymyslená hodnota */
export function dewPoint(t?: number | null, rh?: number | null): number | null {
  if (t == null || rh == null || rh <= 0) return null;
  const g = Math.log(rh / 100) + (17.62 * t) / (243.12 + t);
  return (243.12 * g) / (17.62 - g);
}
const visLabel = (m?: number | null) => (m == null ? "" : m >= 10000 ? "Dobrá" : m >= 4000 ? "Mierne znížená" : m >= 1000 ? "Znížená" : "Hmla");

const smooth = (p: [number, number][]) => {
  if (!p.length) return "";
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i],
      b = p[i],
      c = p[i + 1],
      e = p[i + 2] || c;
    d += ` C${b[0] + (c[0] - a[0]) / 6},${b[1] + (c[1] - a[1]) / 6} ${c[0] - (e[0] - b[0]) / 6},${c[1] - (e[1] - b[1]) / 6} ${c[0]},${c[1]}`;
  }
  return d;
};

function Drop({ s = 11 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 1C6 1 2 5.6 2 8a4 4 0 0 0 8 0C10 5.6 6 1 6 1z" fill="#56b6ff" />
    </svg>
  );
}

function Stale({ r }: { r?: Reading<Weather> | null }) {
  if (!r || r.status === "ok" || !r.data) return null;
  const t = updatedAt(r);
  return (
    <span className="wx-stale" role="status">
      <Icon name="offline" size={14} /> Nesynchronizované{t ? ` · posledná predpoveď ${t}` : ""}
    </span>
  );
}

function NoData({ r, error }: { r?: Reading<Weather> | null; error: unknown }) {
  return (
    <div className="wx-empty" role="status">
      <strong>{error ? "Server je nedostupný" : r ? "OFFLINE" : "Načítavam počasie…"}</strong>
      {r?.message && <span>{r.message}</span>}
    </div>
  );
}

// =====================================================================================
// Karta na úvodnej obrazovke
// =====================================================================================
export function WeatherCard({ className = "" }: { className?: string }) {
  const r = useWeather();
  const w = r.data?.data ?? null;
  const info = w ? wmo(w.code, w.is_day) : null;
  const today = w?.daily[0];
  const todayKey = hourKey().slice(0, 10);
  return (
    <Link to="/pocasie" className={`card bcard bcard--weather wc ${className}`} aria-label="Počasie Žilina – otvoriť detail">
      <img className="wc-sky" src={SKY[info?.sky ?? "zamracene"]} alt="" draggable={false} />
      <span className="wc-shade" aria-hidden="true" />
      {w && info ? (
        <>
          <div className="wc-top">
            <span className="wc-city">{w.location}</span>
            <span className="wc-t">{Math.round(w.temp)}°</span>
            <span className="wc-s">{info.label}</span>
            {today && (
              <span className="wc-mm">
                Max: {Math.round(today.temp_max)}° Min: {Math.round(today.temp_min)}°
              </span>
            )}
          </div>
          <div className="wc-panel">
            <div className="wc-panel__h">
              <Icon name="calendar" size={12} /> Predpoveď na 4 dni
            </div>
            <div className="wc-days">
              {w.daily.slice(0, 4).map((d) => (
                <div className="wc-day" key={d.date}>
                  <span className="wc-day__n">{dayName(d.date, todayKey)}</span>
                  <WxIcon kind={wmo(d.code).kind} size={30} />
                  <span className="wc-day__p">{d.precip_prob ? `${Math.round(d.precip_prob)} %` : ""}</span>
                  <span className="wc-day__t">
                    {Math.round(d.temp_max)}° <span>{Math.round(d.temp_min)}°</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          {r.data?.status !== "ok" && (
            <span className="wc-badge">
              <StatusBadge reading={r.data} compact hideDemo />
            </span>
          )}
        </>
      ) : (
        <div className="wc-top">
          <span className="wc-city">Žilina</span>
          <span className="wc-s">{r.error ? "Server je nedostupný" : (r.data?.message ?? "Načítavam…")}</span>
        </div>
      )}
    </Link>
  );
}

// =====================================================================================
// Hlavná stránka počasia
// =====================================================================================
function Head({ title, back = "/", backLabel, right, r }: { title: string; back?: string; backLabel?: string; right?: React.ReactNode; r?: Reading<Weather> | null }) {
  return (
    <div className="wx-head">
      <Link to={back} className="wx-back" aria-label={backLabel ? `Späť: ${backLabel}` : "Späť na Môj domov"}>
        <Icon name="back" size={22} />
        {backLabel && <span>{backLabel}</span>}
      </Link>
      <div className="wx-title">
        <h1>{title}</h1>
        <span className="wx-city">
          <Icon name="pin" size={14} /> Žilina
        </span>
        <Stale r={r} />
      </div>
      <div className="wx-head__right">{right}</div>
    </div>
  );
}

function HourlyChart({ hours, W = 376, H = 172 }: { hours: WeatherHour[]; W?: number; H?: number }) {
  const n = hours.length;
  if (n < 2) return null;
  const padL = 20,
    padR = 14,
    x = (i: number) => padL + (i * (W - padL - padR)) / (n - 1);
  const ts = hours.map((h) => h.temp);
  const tMin = Math.min(...ts) - 1,
    tMax = Math.max(...ts) + 1;
  const yT = (t: number) => 22 + ((tMax - t) / (tMax - tMin || 1)) * 62;
  const pts = ts.map((t, i) => [x(i), yT(t)] as [number, number]);
  const step = Math.max(1, Math.round(n / 8));
  const by = H - 22,
    bh = 46,
    bw = ((W - padL - padR) / n) * 0.52;
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="wx-chart" role="img" aria-label="Teplota a pravdepodobnosť zrážok na najbližších 24 hodín">
      <defs>
        <linearGradient id="wxArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(255,190,90,.35)" />
          <stop offset="1" stopColor="rgba(255,190,90,0)" />
        </linearGradient>
      </defs>
      <path d={`${smooth(pts)} L${x(n - 1)},92 L${x(0)},92 Z`} fill="url(#wxArea)" />
      <path d={smooth(pts)} fill="none" stroke="#ffbf5e" strokeWidth="2.6" />
      {hours.map((h, i) =>
        i % step ? null : (
          <g key={h.time}>
            <circle cx={x(i)} cy={yT(h.temp)} r="3.2" fill="#ffbf5e" stroke="#13284a" strokeWidth="1.5" />
            <text x={x(i)} y={yT(h.temp) - 8} className="wx-cv">
              {Math.round(h.temp)}°
            </text>
          </g>
        ),
      )}
      {hours.map((h, i) => {
        const p = h.precip_prob ?? 0;
        const hh = Math.max(2, (p / 100) * bh);
        return (
          <g key={`p${h.time}`}>
            <rect x={x(i) - bw / 2} y={by - hh} width={bw} height={hh} rx={bw / 2} fill={p >= 50 ? "#4aa3ff" : "rgba(74,163,255,.55)"} />
            {i % step === 0 && h.precip_prob != null && (
              <text x={x(i)} y={by - hh - 5} className="wx-pv">
                {Math.round(p)}%
              </text>
            )}
          </g>
        );
      })}
      <line x1="0" x2={W} y1={by + 0.5} y2={by + 0.5} stroke="rgba(150,185,235,.18)" />
      {hours.map((h, i) =>
        i % step ? null : (
          <text key={`l${h.time}`} x={x(i)} y={by + 17} className="wx-hl">
            {i === 0 ? "Teraz" : h.time.slice(11, 16)}
          </text>
        ),
      )}
    </svg>
  );
}

function UvGauge({ v }: { v: number | null }) {
  const r = 32,
    cx = 40,
    cy = 38,
    a = Math.PI * (1 - Math.min(v ?? 0, 11) / 11);
  return (
    <svg width="80" height="46" viewBox="0 0 80 46" aria-hidden="true">
      <defs>
        <linearGradient id="wxUv">
          <stop offset="0" stopColor="#3ddc84" />
          <stop offset=".3" stopColor="#f2e14a" />
          <stop offset=".55" stopColor="#ff9a3c" />
          <stop offset=".8" stopColor="#ef4d4d" />
          <stop offset="1" stopColor="#b06bff" />
        </linearGradient>
      </defs>
      <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="url(#wxUv)" strokeWidth="7" strokeLinecap="round" />
      {v != null && <circle cx={cx + r * Math.cos(a)} cy={cy - r * Math.sin(a)} r="6" fill="#fff" stroke="#0d1d35" strokeWidth="2.5" />}
    </svg>
  );
}

function SunArc({ frac }: { frac: number | null }) {
  const r = 40,
    cx = 52,
    cy = 46;
  const f = frac == null ? null : Math.min(1, Math.max(0, frac));
  const a = Math.PI * (1 - (f ?? 0));
  const sx = cx + r * Math.cos(a),
    sy = cy - r * Math.sin(a);
  return (
    <svg width="104" height="54" viewBox="0 0 104 54" aria-hidden="true">
      <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="rgba(150,185,235,.25)" strokeWidth="2" strokeDasharray="3 4" />
      {f != null && f > 0 && <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${sx} ${sy}`} fill="none" stroke="#ffc94a" strokeWidth="2.6" strokeLinecap="round" />}
      <line x1="4" x2="100" y1={cy} y2={cy} stroke="rgba(150,185,235,.3)" />
      {f != null && f > 0 && f < 1 && (
        <>
          <circle cx={sx} cy={sy} r="9" fill="rgba(255,200,70,.25)" />
          <circle cx={sx} cy={sy} r="5.5" fill="#ffd257" />
        </>
      )}
    </svg>
  );
}

function Compass({ deg }: { deg: number | null }) {
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" aria-hidden="true">
      <circle cx="29" cy="29" r="25" fill="rgba(74,163,255,.08)" stroke="rgba(150,185,235,.3)" />
      {["S", "V", "J", "Z"].map((t, i) => (
        <text key={t} x={29 + 19 * Math.sin((i * Math.PI) / 2)} y={29 - 19 * Math.cos((i * Math.PI) / 2) + 3.5} className="wx-cmp">
          {t}
        </text>
      ))}
      {deg != null && (
        // šípka ukazuje, kam vietor fúka
        <g transform={`rotate(${deg + 180} 29 29)`}>
          <path d="M29 10 L34 31 L29 27 L24 31 Z" fill="#7fc0ff" />
          <path d="M29 48 L29 31" stroke="#7fc0ff" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

const minutesOf = (iso?: string | null) => (iso ? Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) : null);

/** Statická mapka okolia Žiliny (OpenStreetMap cez backend) – bez radaru, ten sa načíta až po otvorení. */
function MiniMap() {
  const z = 9,
    lat = 49.2231,
    lon = 18.7394;
  const n = 2 ** z;
  const fx = ((lon + 180) / 360) * n;
  const lr = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n;
  const tiles: { x: number; y: number }[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) tiles.push({ x: Math.floor(fx) + dx, y: Math.floor(fy) + dy });
  // stred mapky = Žilina; dlaždice 256 px posunuté tak, aby bod (fx, fy) bol v strede
  return (
    <div className="wx-mini" aria-hidden="true">
      <div className="wx-mini__tiles" style={{ transform: `translate(${-(fx - Math.floor(fx) + 1) * 256}px, ${-(fy - Math.floor(fy) + 1) * 256}px)` }}>
        {tiles.map((t) => (
          <img
            key={`${t.x}-${t.y}`}
            src={`/api/weather/map/${z}/${t.x}/${t.y}.png`}
            alt=""
            draggable={false}
            loading="lazy"
            onError={(e) => (e.currentTarget.style.visibility = "hidden")}
            style={{ left: (t.x - Math.floor(fx) + 1) * 256, top: (t.y - Math.floor(fy) + 1) * 256 }} />
        ))}
      </div>
      <span className="wx-mini__pin" />
      <span className="wx-mini__lab">Žilina</span>
    </div>
  );
}

export function WeatherPage() {
  const r = useWeather();
  const w = r.data?.data ?? null;
  const now = hourKey();
  const todayKey = now.slice(0, 10);
  const next24 = useMemo(() => (w?.hourly ?? []).filter((h) => h.time >= now).slice(0, 24), [w, now]);
  const t = updatedAt(r.data);
  if (!w) {
    return (
      <div className="wxp">
        <Head title="Počasie" r={r.data} />
        <NoData r={r.data} error={r.error} />
      </div>
    );
  }
  const info = wmo(w.code, w.is_day);
  const today = w.daily.find((d) => d.date === todayKey) ?? w.daily[0];
  const days = w.daily.slice(0, 7);
  const wMin = Math.min(...days.map((d) => d.temp_min)),
    wMax = Math.max(...days.map((d) => d.temp_max));
  const rise = minutesOf(today?.sunrise),
    set = minutesOf(today?.sunset),
    nowMin = Number(now.slice(11, 13)) * 60 + new Date().getMinutes();
  const sunFrac = rise != null && set != null && set > rise ? (nowMin - rise) / (set - rise) : null;
  const uv = w.uv ?? today?.uv_max ?? null;
  const dew = dewPoint(w.temp, w.humidity);
  const rain24 = next24.reduce((s, h) => s + (h.precip_mm ?? 0), 0);
  return (
    <div className="wxp">
      <Head
        title="Počasie"
        r={r.data}
        right={
          <div className="wx-upd">
            <span>{t ? `Aktualizované ${t}` : ""}</span>
            <small>
              Zdroj: {r.data?.source === "demo" ? "DEMO – simulované údaje" : "Open-Meteo (CC BY 4.0)"}
            </small>
          </div>
        }
      />
      <div className="wx-rowA">
        <section className="wx-now" aria-label="Aktuálne počasie">
          <div className="wx-now__top">
            <span>Teraz · {WD_LONG.format(asDate(todayKey))}</span>
            <span>{CLOCK.format(new Date())}</span>
          </div>
          <div className="wx-now__mid">
            <div>
              <div className="wx-now__t">{Math.round(w.temp)}°</div>
              <div className="wx-now__s">{info.label}</div>
            </div>
            <WxIcon kind={info.kind} size={96} className="wx-ic--hero" />
          </div>
          <div className="wx-now__bot">
            <span>
              Pocitovo <b>{n0(w.feels_like)}°</b>
            </span>
            {today && (
              <>
                <span>
                  Max <b>{Math.round(today.temp_max)}°</b>
                </span>
                <span>
                  Min <b>{Math.round(today.temp_min)}°</b>
                </span>
              </>
            )}
          </div>
        </section>
        <section className="wx-days" aria-label="Predpoveď na 7 dní">
          {days.map((d) => (
            <DayTile key={d.date} d={d} today={todayKey} lo={wMin} hi={wMax} />
          ))}
        </section>
      </div>
      <div className="wx-rowB">
        <section className="wx-card wx-hourly" aria-label="Nasledujúcich 24 hodín">
          <div className="wx-card__h">
            <h2>Nasledujúcich 24 hodín</h2>
            <span className="wx-leg">
              <i className="t" />
              Teplota <i className="p" />
              Zrážky
            </span>
          </div>
          <div className="wx-hourly__chart">{next24.length > 1 ? <HourlyChart hours={next24} /> : <p className="wx-muted">Hodinová predpoveď nie je k dispozícii</p>}</div>
        </section>
        <section className="wx-tiles">
          <div className="wx-tile">
            <h3>UV index</h3>
            <UvGauge v={uv} />
            <div className="wx-tile__v">
              {n0(uv)} <small>{uvLabel(uv)}</small>
            </div>
          </div>
          <div className="wx-tile">
            <h3>Slnko</h3>
            <SunArc frac={sunFrac} />
            <div className="wx-sun">
              <span>↑ {hhmm(today?.sunrise)}</span>
              <span>↓ {hhmm(today?.sunset)}</span>
            </div>
          </div>
          <div className="wx-tile">
            <h3>Vietor</h3>
            <div className="wx-wind">
              <Compass deg={w.wind_dir ?? null} />
              <div>
                <div className="wx-tile__v">
                  {n0(w.wind_kmh)}
                  <small> km/h</small>
                </div>
                <small>{dirName(w.wind_dir)}</small>
              </div>
            </div>
            <div className="wx-tile__sub">
              Nárazy <b>{n0(w.gust_kmh)} km/h</b>
            </div>
          </div>
          <div className="wx-tile">
            <h3>Vlhkosť</h3>
            <div className="wx-tile__v wx-big">
              {n0(w.humidity)}
              <small> %</small>
            </div>
            <span className="wx-bar">
              <i style={{ width: `${w.humidity ?? 0}%` }} />
            </span>
            <div className="wx-tile__sub">{dew != null ? `Rosný bod ${Math.round(dew)}°` : ""}</div>
          </div>
          <div className="wx-tile">
            <h3>Viditeľnosť</h3>
            <div className="wx-tile__v wx-big">
              {w.visibility_m != null ? Math.round(w.visibility_m / 1000) : "–"}
              <small> km</small>
            </div>
            <div className="wx-tile__sub">{visLabel(w.visibility_m)}</div>
          </div>
          <div className="wx-tile">
            <h3>Zrážky</h3>
            <div className="wx-tile__v wx-big">
              {n1(today?.precip_mm)}
              <small> mm</small>
            </div>
            <div className="wx-tile__sub">dnes · 24 h: {n1(rain24)} mm</div>
          </div>
        </section>
        <Link to="/pocasie/radar" className="wx-card wx-radar" aria-label="Radar zrážok – otvoriť mapu">
          <div className="wx-card__h">
            <h2>Radar</h2>
            <span className="wx-live">Zrážky</span>
          </div>
          <MiniMap />
          <div className="wx-radar__cta">
            Otvoriť mapu <span>›</span>
          </div>
        </Link>
      </div>
    </div>
  );
}

function DayTile({ d, today, lo, hi }: { d: WeatherDay; today: string; lo: number; hi: number }) {
  const span = hi - lo || 1;
  const l = ((d.temp_min - lo) / span) * 100,
    r = ((d.temp_max - lo) / span) * 100;
  return (
    <Link to={`/pocasie/den/${d.date}`} className={`wx-day ${d.date === today ? "is-today" : ""}`} aria-label={`${dayLong(d.date)} – podrobnosti`}>
      <span className="wx-day__n">{dayName(d.date, today)}</span>
      <span className="wx-day__dt">{DM.format(asDate(d.date)).replace(/\s/g, " ")}</span>
      <WxIcon kind={wmo(d.code).kind} size={44} />
      <span className="wx-day__max">{Math.round(d.temp_max)}°</span>
      <span className="wx-day__min">{Math.round(d.temp_min)}°</span>
      <span className="wx-range">
        <i style={{ left: `${l}%`, right: `${100 - r}%` }} />
      </span>
      <span className="wx-day__p">
        <Drop s={10} /> {d.precip_prob != null ? `${Math.round(d.precip_prob)} %` : "–"}
      </span>
    </Link>
  );
}

// =====================================================================================
// Detail dňa
// =====================================================================================
const CW = 54;

export function WeatherDayPage() {
  const { date = "" } = useParams();
  const r = useWeather();
  const w = r.data?.data ?? null;
  const now = hourKey();
  const todayKey = now.slice(0, 10);
  const scroller = useRef<HTMLDivElement>(null);
  const day = w?.daily.find((d) => d.date === date) ?? null;
  const hours = useMemo(() => (w?.hourly ?? []).filter((h) => h.time.startsWith(date)), [w, date]);
  // dnes začni aktuálnou hodinou, iné dni o 6:00
  useEffect(() => {
    const el = scroller.current;
    if (!el || !hours.length) return;
    const first = date === todayKey ? Math.max(0, hours.findIndex((h) => h.time >= now)) : hours.findIndex((h) => h.time.endsWith("T06:00"));
    el.scrollLeft = Math.max(0, first) * CW;
  }, [hours, date, todayKey, now]);
  const chips = (w?.daily ?? []).slice(0, 7).map((d) => (
    <Link key={d.date} to={`/pocasie/den/${d.date}`} replace className={`wx-chip ${d.date === date ? "is-on" : ""}`} aria-current={d.date === date ? "page" : undefined}>
      {dayName(d.date, todayKey)}
    </Link>
  ));
  const title = date ? dayLong(date) : "Deň";
  if (!w || !day) {
    return (
      <div className="wxp">
        <Head title={title} back="/pocasie" backLabel="Počasie" r={r.data} right={<div className="wx-chips">{chips}</div>} />
        {w ? <div className="wx-empty">Pre tento deň nie je predpoveď</div> : <NoData r={r.data} error={r.error} />}
      </div>
    );
  }
  const info = wmo(day.code);
  const temps = hours.map((h) => h.temp);
  const tMin = Math.min(...temps) - 1,
    tMax = Math.max(...temps) + 1;
  const yT = (t: number) => 30 + ((tMax - t) / (tMax - tMin || 1)) * 58;
  const W = CW * hours.length;
  const pts = hours.map((h, i) => [CW / 2 + i * CW, yT(h.temp)] as [number, number]);
  const feels = hours.map((h) => h.feels_like).filter((v): v is number => v != null);
  const wettest = hours.reduce<WeatherHour | null>((m, h) => ((h.precip_mm ?? 0) > (m?.precip_mm ?? 0) ? h : m), null);
  const gustiest = hours.reduce<WeatherHour | null>((m, h) => ((h.gust_kmh ?? 0) > (m?.gust_kmh ?? 0) ? h : m), null);
  const rows: [string, string][] = [
    ["Pocitová teplota", feels.length ? `${Math.round(Math.min(...feels))}° / ${Math.round(Math.max(...feels))}°` : "–"],
    ["Zrážky", `${n1(day.precip_mm)} mm · ${n0(day.precip_prob)} %`],
    ["Vietor", `${n0(day.wind_max_kmh)} km/h · ${dirName(day.wind_dir)}`],
    ["Nárazy", `${n0(day.gust_max_kmh)} km/h`],
    ["UV index", `${n0(day.uv_max)} · ${uvLabel(day.uv_max)}`],
    ["Východ slnka", hhmm(day.sunrise)],
    ["Západ slnka", hhmm(day.sunset)],
  ];
  return (
    <div className="wxp wxp--day">
      <Head title={title} back="/pocasie" backLabel="Počasie" r={r.data} right={<div className="wx-chips">{chips}</div>} />
      <div className="wx-dayGrid">
        <section className="wx-card wx-sum">
          <div className="wx-sum__top">
            <WxIcon kind={info.kind} size={84} className="wx-ic--hero" />
            <div>
              <div className="wx-sum__t">
                {Math.round(day.temp_max)}°<span> / {Math.round(day.temp_min)}°</span>
              </div>
              <div className="wx-sum__s">{info.label}</div>
            </div>
          </div>
          {rows.map(([k, v]) => (
            <div className="wx-kv" key={k}>
              <span>{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </section>
        <section className="wx-card wx-hours">
          <div className="wx-card__h">
            <h2>Po hodinách</h2>
            <span className="wx-scroll">‹ potiahnutím celý deň ›</span>
          </div>
          <div className="wx-hours__body">
            <div className="wx-gut" aria-hidden="true">
              <span style={{ top: 4 }}>Čas</span>
              <span style={{ top: 96 }}>Teplota</span>
              <span style={{ top: 196 }}>Zrážky</span>
              <span style={{ top: 290 }}>
                Vietor
                <br />
                km/h
              </span>
            </div>
            <div className="wx-hours__scroll" ref={scroller}>
              <div className="wx-hours__grid" style={{ width: W }}>
                <svg className="wx-hours__curve wx-chart" width={W} height="104" viewBox={`0 0 ${W} 104`} aria-hidden="true">
                  <defs>
                    <linearGradient id="wxArea2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="rgba(255,190,90,.32)" />
                      <stop offset="1" stopColor="rgba(255,190,90,0)" />
                    </linearGradient>
                  </defs>
                  <path d={`${smooth(pts)} L${pts[pts.length - 1]?.[0] ?? 0},104 L${pts[0]?.[0] ?? 0},104 Z`} fill="url(#wxArea2)" />
                  <path d={smooth(pts)} fill="none" stroke="#ffbf5e" strokeWidth="2.6" />
                  {pts.map(([px, py], i) => (
                    <g key={hours[i].time}>
                      <circle cx={px} cy={py} r="3.4" fill="#ffbf5e" stroke="#13284a" strokeWidth="1.5" />
                      <text x={px} y={py - 9} className="wx-cv">
                        {Math.round(hours[i].temp)}°
                      </text>
                    </g>
                  ))}
                </svg>
                <div className="wx-cols" style={{ gridTemplateColumns: `repeat(${hours.length}, ${CW}px)` }}>
                  {hours.map((h) => {
                    const p = h.precip_prob ?? 0;
                    return (
                      <div className={`wx-col ${h.time === now ? "is-now" : ""}`} key={h.time}>
                        <span className="wx-col__h">{h.time === now ? "Teraz" : h.time.slice(11, 16)}</span>
                        <WxIcon kind={wmo(h.code, h.is_day).kind} size={32} />
                        <span className="wx-col__p">{h.precip_prob != null ? `${Math.round(p)} %` : "–"}</span>
                        <span className="wx-col__bar">
                          <i style={{ height: Math.max(3, (p / 100) * 46), opacity: p >= 50 ? 1 : 0.6 }} />
                        </span>
                        <span className="wx-col__mm">{n1(h.precip_mm)} mm</span>
                        <svg width="18" height="18" viewBox="0 0 18 18" className="wx-col__wd" aria-label={h.wind_dir != null ? `vietor od ${dirName(h.wind_dir)}` : undefined}>
                          {h.wind_dir != null && (
                            <g transform={`rotate(${h.wind_dir + 180} 9 9)`}>
                              <path d="M9 2 L13 13 L9 10.5 L5 13 Z" fill="#7fc0ff" />
                            </g>
                          )}
                        </svg>
                        <span className="wx-col__w">{n0(h.wind_kmh)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="wx-hours__sum">
            <span>
              <Drop s={12} /> Spolu <b>{n1(day.precip_mm)} mm</b>
            </span>
            {wettest && (wettest.precip_mm ?? 0) > 0 && (
              <span>
                Najviac prší <b>okolo {wettest.time.slice(11, 16)}</b>
              </span>
            )}
            {gustiest && (
              <span>
                Max. nárazy <b>{n0(gustiest.gust_kmh)} km/h</b> o {gustiest.time.slice(11, 16)}
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
