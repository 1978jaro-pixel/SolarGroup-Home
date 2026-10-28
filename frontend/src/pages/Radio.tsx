import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { CatalogStation, RadioStation, StationStatus } from "../api/types";
import { Icon } from "../components/Icon";
import { Card, EmptyState, PageHeader, Segmented } from "../components/ui";
import { useRadio, type Playable, type PlayerStatus } from "../radio/RadioProvider";

/** Krajiny a žánre pre katalóg Radio Browser (kód krajiny ISO 3166, žáner = tag katalógu). */
export const COUNTRIES = [
  ["SK", "Slovensko"],
  ["CZ", "Česko"],
  ["AT", "Rakúsko"],
  ["DE", "Nemecko"],
  ["IT", "Taliansko"],
  ["FR", "Francúzsko"],
  ["GB", "Veľká Británia"],
  ["US", "USA"],
  ["HU", "Maďarsko"],
  ["PL", "Poľsko"],
  ["HR", "Chorvátsko"],
  ["ES", "Španielsko"],
] as const;
export const GENRES = [
  ["pop", "Pop"],
  ["rock", "Rock"],
  ["dance", "Dance"],
  ["80s", "80s"],
  ["90s", "90s"],
  ["oldies", "Oldies"],
  ["jazz", "Jazz"],
  ["chillout", "Chillout"],
  ["classical", "Classical"],
  ["news", "News"],
] as const;

const STATUS_TEXT: Record<PlayerStatus, string> = {
  idle: "Pripravené – ťuknite na Prehrať",
  loading: "Pripája sa…",
  playing: "Hrá",
  paused: "Pozastavené",
  error: "Chyba prehrávania",
};

const STATION_STATUS: Record<StationStatus, { text: string; tone: string } | null> = {
  unknown: { text: "Neoverená", tone: "muted" },
  ok: null,
  unavailable: { text: "Nedostupná", tone: "danger" },
  unsupported: { text: "Nepodporovaný formát", tone: "warn" },
};

function Logo({ src, size = 44 }: { src: string | null | undefined; size?: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return (
    <span className="radio-logo" style={{ width: size, height: size }}>
      {src && !broken ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : <Icon name="music" size={Math.round(size * 0.5)} />}
    </span>
  );
}

function meta(s: Pick<Playable, "countrycode" | "codec" | "bitrate" | "tags">): string {
  return [s.countrycode, s.codec && `${s.codec}${s.bitrate ? ` ${s.bitrate} kb/s` : ""}`, s.tags?.slice(0, 2).join(", ")].filter(Boolean).join(" · ");
}

// --- Karta na hlavnej obrazovke ----------------------------------------------------------

export function RadioCard() {
  const r = useRadio();
  const nav = useNavigate();
  const st = r.current;
  const busy = r.status === "playing" || r.status === "loading";
  return (
    <Card title="Rádio a hudba" icon="music" onOpen={() => nav("/hudba")} className="radio-card">
      <div className="radio-card__now">
        <Logo src={st?.logo} size={48} />
        <span className="radio-card__info">
          <strong>{st?.name ?? "Vyberte stanicu"}</strong>
          <span className={r.status === "error" ? "is-error" : ""}>{st ? (r.status === "error" ? (r.error ?? STATUS_TEXT.error) : STATUS_TEXT[r.status]) : "Ťuknite na kartu"}</span>
        </span>
      </div>
      <div className="radio-card__ctrl">
        <button type="button" className="radio-play" aria-label={busy ? "Pozastaviť" : "Prehrať"} disabled={!st} onClick={() => r.toggle()}>
          <Icon name={busy ? "pause" : "play"} size={24} filled />
        </button>
        <label className="radio-vol">
          <Icon name={r.volume === 0 ? "mute" : "volume"} size={20} />
          <input type="range" min={0} max={100} value={Math.round(r.volume * 100)} aria-label="Hlasitosť" onChange={(e) => r.setVolume(Number(e.target.value) / 100)} />
        </label>
      </div>
    </Card>
  );
}

// --- Detailný prehrávač --------------------------------------------------------------

function Player() {
  const r = useRadio();
  const st = r.current;
  const busy = r.status === "playing" || r.status === "loading";
  const saved = st ? r.stations.find((s) => s.id === st.id) : undefined;
  return (
    <Card className="radio-player">
      <div className="radio-player__now">
        <Logo src={st?.logo} size={84} />
        <div className="radio-player__info">
          <strong>{st?.name ?? "Vyberte stanicu zo zoznamu"}</strong>
          {st && <span className="muted">{meta(st)}</span>}
          <span className={`radio-player__status is-${r.status}`} role="status">
            {r.status === "error" ? (r.error ?? STATUS_TEXT.error) : st ? STATUS_TEXT[r.status] : ""}
          </span>
        </div>
        {st && (
          <button
            type="button"
            className={`radio-star ${saved?.favorite ? "is-on" : ""}`}
            aria-label={saved?.favorite ? "Odobrať z obľúbených" : "Pridať medzi obľúbené"}
            aria-pressed={!!saved?.favorite}
            onClick={() => void r.setFavorite((saved ?? st) as RadioStation, !saved?.favorite)}
          >
            <Icon name="star" size={26} filled={!!saved?.favorite} />
          </button>
        )}
      </div>
      <div className="radio-player__ctrl">
        <button type="button" className="round-btn" aria-label="Predchádzajúca stanica" onClick={() => r.next(-1)}>
          <Icon name="prev" size={24} filled />
        </button>
        <button type="button" className="radio-play radio-play--lg" aria-label={busy ? "Pozastaviť" : "Prehrať"} disabled={!st} onClick={() => r.toggle()}>
          <Icon name={busy ? "pause" : "play"} size={30} filled />
        </button>
        <button type="button" className="round-btn" aria-label="Zastaviť" disabled={r.status === "idle"} onClick={() => r.stop()}>
          <Icon name="stop" size={22} filled />
        </button>
        <button type="button" className="round-btn" aria-label="Ďalšia stanica" onClick={() => r.next(1)}>
          <Icon name="next" size={24} filled />
        </button>
        <label className="radio-vol radio-vol--lg">
          <Icon name={r.volume === 0 ? "mute" : "volume"} size={22} />
          <input type="range" min={0} max={100} value={Math.round(r.volume * 100)} aria-label="Hlasitosť" onChange={(e) => r.setVolume(Number(e.target.value) / 100)} />
          <output>{Math.round(r.volume * 100)} %</output>
        </label>
      </div>
    </Card>
  );
}

function StationRow({ s, saved }: { s: RadioStation | CatalogStation; saved?: RadioStation }) {
  const r = useRadio();
  const status = saved?.status ?? ("catalog_ok" in s && !s.catalog_ok ? "unavailable" : "ok");
  const badge = saved ? STATION_STATUS[saved.status] : status === "unavailable" ? STATION_STATUS.unavailable : null;
  const blocked = status === "unavailable" || status === "unsupported" || s.codec === "HLS";
  const isCurrent = r.current?.id === s.id;
  const fav = !!saved?.favorite;
  const playable: Playable = { ...s, logo: s.logo };
  return (
    <li className={`radio-row ${isCurrent ? "is-current" : ""} ${blocked ? "is-blocked" : ""}`}>
      <button type="button" className="radio-row__main" disabled={blocked} onClick={() => void r.play(playable)} aria-label={`Prehrať ${s.name}`}>
        <Logo src={s.logo} />
        <span className="radio-row__text">
          <strong>{s.name}</strong>
          <span>{meta(s) || " "}</span>
        </span>
        {badge && <span className={`radio-badge is-${badge.tone}`}>{badge.text}</span>}
        {isCurrent && (r.status === "playing" || r.status === "loading") && <Icon name="volume" size={20} className="radio-row__on" />}
      </button>
      {saved && saved.status !== "ok" && (
        <button type="button" className="icon-btn" aria-label={`Overiť ${s.name}`} title="Overiť stream" onClick={() => void r.checkStation(saved.id)}>
          <Icon name="refresh" size={20} />
        </button>
      )}
      {saved?.source === "custom" && (
        <button type="button" className="icon-btn" aria-label={`Odstrániť ${s.name}`} onClick={() => void r.remove(saved.id)}>
          <Icon name="trash" size={20} />
        </button>
      )}
      <button type="button" className={`icon-btn radio-star ${fav ? "is-on" : ""}`} aria-pressed={fav} aria-label={fav ? `Odobrať ${s.name} z obľúbených` : `Pridať ${s.name} medzi obľúbené`} onClick={() => void r.setFavorite(s, !fav)}>
        <Icon name="star" size={22} filled={fav} />
      </button>
    </li>
  );
}

function StationList({ items }: { items: (RadioStation | CatalogStation)[] }) {
  const r = useRadio();
  const byId = useMemo(() => new Map(r.stations.map((s) => [s.id, s])), [r.stations]);
  const byUrl = useMemo(() => new Map(r.stations.map((s) => [s.url, s])), [r.stations]);
  return (
    <ul className="radio-list">
      {items.map((s) => (
        <StationRow key={s.id} s={s} saved={byId.get(s.id) ?? byUrl.get(s.url)} />
      ))}
    </ul>
  );
}

function Catalog() {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("SK");
  const [tag, setTag] = useState("");
  const [rows, setRows] = useState<CatalogStation[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const search = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const p = new URLSearchParams({ q, country, tag, limit: "40" });
      setRows(await api.get<CatalogStation[]>(`/api/radio/search?${p}`));
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : "Vyhľadávanie zlyhalo");
      setRows(null);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void search();
    // vyhľadá znova pri zmene krajiny alebo žánru
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, tag]);
  return (
    <div className="radio-catalog">
      <form className="radio-search" onSubmit={(e) => void search(e)}>
        <Icon name="search" size={20} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Názov stanice" aria-label="Názov stanice" />
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Hľadá sa…" : "Hľadať"}
        </button>
      </form>
      <div className="chips" role="group" aria-label="Krajina">
        <button type="button" className={`chip ${country === "" ? "is-on" : ""}`} onClick={() => setCountry("")}>
          <Icon name="globe" size={16} /> Všetky
        </button>
        {COUNTRIES.map(([code, name]) => (
          <button key={code} type="button" className={`chip ${country === code ? "is-on" : ""}`} aria-pressed={country === code} onClick={() => setCountry(code)}>
            {name}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Žáner">
        <button type="button" className={`chip ${tag === "" ? "is-on" : ""}`} onClick={() => setTag("")}>
          Všetky žánre
        </button>
        {GENRES.map(([t, name]) => (
          <button key={t} type="button" className={`chip ${tag === t ? "is-on" : ""}`} aria-pressed={tag === t} onClick={() => setTag(t)}>
            {name}
          </button>
        ))}
      </div>
      {err && <EmptyState icon="offline" title="Katalóg nie je dostupný" text={`${err}. Uložené a obľúbené stanice fungujú ďalej.`} tone="danger" />}
      {rows && rows.length === 0 && <EmptyState icon="search" title="Nič sa nenašlo" text="Skúste iný názov, krajinu alebo žáner." />}
      {rows && rows.length > 0 && <StationList items={rows} />}
    </div>
  );
}

function CustomUrl() {
  const r = useRadio();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { check } = await r.addCustom(name.trim(), url.trim());
      setMsg(
        check.status === "ok"
          ? { ok: true, text: `Uložené – ${check.status_detail}.` }
          : { ok: false, text: `Uložené, ale stanica je označená ako ${check.status === "unsupported" ? "nepodporovaná" : "nedostupná"}: ${check.status_detail}` },
      );
      setName("");
      setUrl("");
    } catch (ex) {
      setMsg({ ok: false, text: ex instanceof ApiError ? ex.message : "Uloženie zlyhalo" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="radio-custom" onSubmit={(e) => void submit(e)}>
      <label>
        Názov
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="Napr. Moje rádio" />
      </label>
      <label>
        Adresa streamu (http/https, MP3, AAC, OGG, playlist .m3u/.pls)
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://…" />
      </label>
      <button type="submit" className="btn btn--primary" disabled={busy}>
        <Icon name="link" size={18} /> {busy ? "Overuje sa…" : "Overiť a uložiť"}
      </button>
      {msg && <p className={msg.ok ? "ok-text" : "card-error"}>{msg.text}</p>}
    </form>
  );
}

function OutputSelect() {
  const r = useRadio();
  const [outs, setOuts] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    if (!r.sinkSupported || !navigator.mediaDevices?.enumerateDevices) return;
    void navigator.mediaDevices.enumerateDevices().then((d) => setOuts(d.filter((x) => x.kind === "audiooutput")));
  }, [r.sinkSupported]);
  if (!r.sinkSupported || outs.length < 2) {
    return <p className="muted small">Zvuk ide na predvolený výstup systému (HDMI alebo 3,5 mm jack). Externý reproduktor alebo zosilňovač pripojte k tomuto výstupu, prípadne cez USB zvukovú kartu – potom sa tu zobrazí výber.</p>;
  }
  return (
    <label className="radio-out">
      Zvukový výstup
      <select value={r.sinkId} onChange={(e) => void r.setSink(e.target.value)}>
        {outs.map((o, i) => (
          <option key={o.deviceId || i} value={o.deviceId}>
            {o.label || (o.deviceId === "default" ? "Predvolený" : `Výstup ${i + 1}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

type Tab = "fav" | "sk" | "catalog" | "custom";

export function RadioPage() {
  const r = useRadio();
  const [tab, setTab] = useState<Tab>(() => (r.stations.some((s) => s.favorite) ? "fav" : "sk"));
  const favs = r.stations.filter((s) => s.favorite);
  const presets = r.stations.filter((s) => s.source === "preset");
  return (
    <>
      <PageHeader title="Rádio a hudba" subtitle="Internetové rádiá – slovenské, české aj zahraničné" />
      <div className="radio-page">
        <Player />
        <Card>
          <Segmented
            label="Zoznam staníc"
            value={tab}
            options={[
              { value: "fav", label: `Obľúbené (${favs.length})` },
              { value: "sk", label: "Slovenské" },
              { value: "catalog", label: "Katalóg" },
              { value: "custom", label: "Vlastná URL" },
            ]}
            onChange={(v) => setTab(v as Tab)}
          />
          {tab === "fav" && (favs.length ? <StationList items={favs} /> : <EmptyState icon="star" title="Zatiaľ žiadne obľúbené" text="Hviezdičkou pridáte stanicu medzi obľúbené." />)}
          {tab === "sk" && <StationList items={presets} />}
          {tab === "catalog" && <Catalog />}
          {tab === "custom" && <CustomUrl />}
        </Card>
        <Card title="Zvuk" icon="volume">
          <OutputSelect />
          <p className="muted small">Po reštarte zariadenia sa rádio nespustí samo – zapamätá sa posledná stanica a hlasitosť, prehrávanie začne ťuknutím na Prehrať.</p>
        </Card>
      </div>
    </>
  );
}
