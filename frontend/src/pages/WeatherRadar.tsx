import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { RadarFrames } from "../api/types";
import { Icon } from "../components/Icon";
import "../styles/weather.css";

/**
 * Radar zrážok – samostatná stránka, načíta sa (aj s knižnicou Leaflet) až po otvorení.
 * Mapa: OpenStreetMap, zrážky: RainViewer – obe cez backend (vyrovnávacia pamäť, prísne CSP).
 * Animácia beží iba po ťuknutí na Prehrať a sama sa zastaví; pri odchode zo stránky sa zastaví
 * prehrávanie aj obnovovanie snímok a mapa sa uvoľní z pamäte.
 */

const ZILINA: L.LatLngTuple = [49.2231, 18.7394];
const BOUNDS = L.latLngBounds([47.4, 16.5], [50.0, 23.0]);
const FRAME_MS = 700;
const MAX_LOOPS = 3;
const REFRESH_MS = 5 * 60_000;

const hhmm = (t: number) => new Date(t * 1000).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
function ago(t: number): string {
  const m = Math.round((Date.now() / 1000 - t) / 60);
  if (m < -1) return `predpoveď o ${-m} min`;
  if (m <= 1) return "teraz";
  return `pred ${m} min`;
}

export function WeatherRadarPage() {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef(new Map<number, L.TileLayer>());
  const [frames, setFrames] = useState<RadarFrames | null>(null);
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // mapa – vznikne pri otvorení stránky, zanikne pri odchode
  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, {
      center: ZILINA,
      zoom: 9,
      minZoom: 7,
      maxZoom: 13,
      maxBounds: BOUNDS,
      maxBoundsViscosity: 0.8,
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: false,
      zoomSnap: 1,
    });
    L.tileLayer("/api/weather/map/{z}/{x}/{y}.png", { maxZoom: 13, minZoom: 7, className: "wxr-base", keepBuffer: 1 }).addTo(m);
    L.circleMarker(ZILINA, { radius: 7, color: "#fff", weight: 2.5, fillColor: "#4aa3ff", fillOpacity: 1, interactive: false }).addTo(m);
    L.tooltip({ permanent: true, direction: "right", offset: [10, -8], className: "wxr-label", interactive: false }).setLatLng(ZILINA).setContent("Žilina").addTo(m);
    map.current = m;
    const store = layers.current;
    return () => {
      store.clear();
      m.remove();
      map.current = null;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const f = await api.get<RadarFrames>("/api/weather/radar/frames");
      setError(null);
      setFrames((prev) => {
        const same = prev && prev.frames.length === f.frames.length && prev.frames.every((x, i) => x.time === f.frames[i].time);
        if (!same) setIdx(f.frames.filter((x) => x.kind === "past").length - 1); // posledná skutočná snímka
        return same ? prev : f;
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Radar je nedostupný");
    }
  }, []);

  // snímky: hneď po otvorení a potom každých 5 minút, iba kým je stránka otvorená a viditeľná
  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // zobrazenie vybranej snímky (vrstvy sa vytvárajú postupne, staré sa odstránia)
  useEffect(() => {
    const m = map.current;
    if (!m || !frames || idx < 0) return;
    const keep = new Set(frames.frames.map((f) => f.time));
    for (const [t, layer] of layers.current) {
      if (!keep.has(t)) {
        layer.remove();
        layers.current.delete(t);
      }
    }
    const show = (t: number) => {
      let layer = layers.current.get(t);
      if (!layer) {
        layer = L.tileLayer(`/api/weather/radar/${t}/{z}/{x}/{y}.png`, {
          maxNativeZoom: frames.max_zoom,
          maxZoom: 13,
          opacity: 0,
          className: "wxr-radar",
          keepBuffer: 0,
        });
        layer.addTo(m);
        layers.current.set(t, layer);
      }
      return layer;
    };
    const cur = frames.frames[idx];
    if (!cur) return;
    for (const [t, layer] of layers.current) layer.setOpacity(t === cur.time ? 0.75 : 0);
    show(cur.time).setOpacity(0.75);
    // pri prehrávaní pripravíme nasledujúcu snímku vopred
    if (playing) {
      const next = frames.frames[(idx + 1) % frames.frames.length];
      if (next) show(next.time);
    }
  }, [frames, idx, playing]);

  // prehrávanie: najviac 3 kolá, potom zastaví na poslednej skutočnej snímke
  useEffect(() => {
    if (!playing || !frames) return;
    let step = 0;
    const total = frames.frames.length * MAX_LOOPS;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      step += 1;
      if (step >= total) {
        setPlaying(false);
        setIdx(frames.frames.filter((x) => x.kind === "past").length - 1);
        return;
      }
      setIdx((i) => (i + 1) % frames.frames.length);
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [playing, frames]);

  const cur = frames && idx >= 0 ? frames.frames[idx] : null;
  const list = frames?.frames ?? [];
  return (
    <div className="wxp wxp--radar">
      <div className="wxr-map" ref={box} role="application" aria-label="Mapa radaru zrážok – posun prstom, priblíženie dvoma prstami" />
      <div className="wx-rhead">
        <Link to="/pocasie" className="wx-back wx-back--glass" aria-label="Späť: Počasie">
          <Icon name="back" size={22} />
          <span>Počasie</span>
        </Link>
        <div className="wx-rtitle">
          <h1>Radar zrážok</h1>
          <span>
            <Icon name="pin" size={13} /> Žilina a okolie
          </span>
        </div>
      </div>
      <div className="wx-zoom">
        <button type="button" aria-label="Priblížiť" onClick={() => map.current?.zoomIn()}>
          +
        </button>
        <button type="button" aria-label="Oddialiť" onClick={() => map.current?.zoomOut()}>
          −
        </button>
        <button type="button" aria-label="Späť na Žilinu" onClick={() => map.current?.setView(ZILINA, 9)}>
          <Icon name="pin" size={20} />
        </button>
      </div>
      {error && (
        <div className="wx-rerr" role="status">
          <Icon name="offline" size={16} /> {error}
        </div>
      )}
      <div className="wx-time">
        <button
          type="button"
          className="wx-play"
          aria-label={playing ? "Zastaviť animáciu" : "Prehrať animáciu"}
          disabled={list.length < 2}
          onClick={() => setPlaying((p) => !p)}
        >
          <Icon name={playing ? "pause" : "play"} size={22} filled />
        </button>
        <div className="wx-track">
          <div className="wx-track__now">
            {cur ? hhmm(cur.time) : "–"} <small>{cur ? ago(cur.time) : error ? "bez údajov" : "načítavam…"}</small>
          </div>
          <input
            type="range"
            className="wx-range-in"
            min={0}
            max={Math.max(0, list.length - 1)}
            value={Math.max(0, idx)}
            disabled={!list.length}
            aria-label="Čas snímky radaru"
            onChange={(e) => {
              setPlaying(false);
              setIdx(Number(e.target.value));
            }}
          />
          <div className="wx-track__lab">
            <span>{list[0] ? hhmm(list[0].time) : ""}</span>
            <span>{list.length ? hhmm(list[list.length - 1].time) : ""}</span>
          </div>
        </div>
      </div>
      <div className="wx-legend">
        <h3>Intenzita zrážok</h3>
        <span className="wx-legend__bar" />
        <div className="wx-legend__lab">
          <span>slabé</span>
          <span>stredné</span>
          <span>silné</span>
          <span>extrémne</span>
        </div>
      </div>
      <div className="wx-attr">© OpenStreetMap prispievatelia · {frames?.attribution ?? "Radar: RainViewer"}</div>
    </div>
  );
}
