import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useApp } from "../hooks/AppContext";
import { dateParts } from "../utils/format";
import { meninyFor } from "../utils/meniny";
import { Icon } from "./Icon";

function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const NAV = [
  { to: "/", label: "Domov", icon: "homeSolid" },
  { to: "/miestnosti", label: "Miestnosti", icon: "more" },
  { to: "/kamery", label: "Kamery", icon: "camera" },
  { to: "/nastavenia", label: "Nastavenia", icon: "settings" },
] as const;

export function Layout() {
  const { mode, liveConnected } = useApp();
  const now = useNow();
  const loc = useLocation();
  const { weekday, day, month } = dateParts(now);
  const meniny = meninyFor(now);
  // Na podstránkach má vlastný nadpis PageHeader – v hlavičke zostáva „Môj domov“ bez h1.
  const Title = loc.pathname === "/" ? "h1" : "div";

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="topbar__home" aria-label="Môj domov">
          <Icon name="homeSolid" size={32} filled />
        </Link>
        <span className="topbar__sep" aria-hidden="true" />
        <Title className="topbar__title">Môj domov</Title>
        <div className="topbar__right">
          {mode === "demo" && (
            <span className="badge badge--demo topbar__demo" title="Všetky hodnoty sú simulované a neovládajú skutočné zariadenia">
              DEMO<span className="topbar__demo-long"> · simulované údaje</span>
            </span>
          )}
          <span className={`conn conn--dot ${liveConnected ? "is-on" : ""}`} title={liveConnected ? "Živé spojenie" : "Bez živého spojenia"}>
            <i />
          </span>
          <time className="topbar__time" dateTime={now.toISOString()}>
            {now.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" })}
          </time>
          <span className="topbar__sep topbar__sep--right" aria-hidden="true" />
          <div className="topbar__date">
            <span>
              {weekday}, {day}. {month}
            </span>
            {meniny && <span>Meniny: {meniny}</span>}
          </div>
        </div>
      </header>

      <main className="content" id="obsah">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Hlavná navigácia">
        <div className="bottom-nav__group">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className="bottom-nav__item">
              <Icon name={n.icon} size={26} filled={n.icon === "homeSolid"} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </div>
        <span className={`mode-pill ${mode === "demo" ? "mode-pill--demo" : ""}`} title={mode === "demo" ? "Simulované údaje" : "Skutočné údaje"}>
          {mode === "demo" ? "DEMO" : "LIVE"}
        </span>
      </nav>
    </div>
  );
}
