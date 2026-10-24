import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useApp } from "../hooks/AppContext";
import { MODULES } from "../nav";
import { Icon } from "./Icon";

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <time className="clock" dateTime={now.toISOString()}>
      {now.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}

export function ModeBanner() {
  const { mode } = useApp();
  if (mode !== "demo") return null;
  return (
    <div className="demo-banner" role="status">
      <strong>DEMO režim</strong>
      <span>Všetky zobrazené hodnoty sú simulované a neovládajú skutočné zariadenia.</span>
    </div>
  );
}

export function Layout() {
  const { mode, liveConnected, user } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setMoreOpen(false), [loc.pathname]);

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Hlavná navigácia">
        <div className="brand">
          <span className="brand__logo">
            <Icon name="solar" size={20} />
          </span>
          <span>
            <strong>SolarGroup</strong> Home
          </span>
        </div>
        <nav>
          {MODULES.map((m) => (
            <NavLink key={m.path} to={m.path} end={m.path === "/"} className="nav-item">
              <Icon name={m.icon} size={20} />
              <span>{m.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__foot">
          <span className={`conn ${liveConnected ? "is-on" : ""}`}>
            <i /> {liveConnected ? "Živé spojenie" : "Bez živého spojenia"}
          </span>
          {user && <span className="muted">{user.username}</span>}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="brand brand--mobile">
            <span className="brand__logo">
              <Icon name="solar" size={18} />
            </span>
            <strong>SolarGroup Home</strong>
          </div>
          <div className="topbar__right">
            {mode === "demo" ? (
              <span className="badge badge--demo badge--lg" title="Simulované údaje">
                DEMO
              </span>
            ) : (
              <span className="badge badge--live">LIVE</span>
            )}
            <span className={`conn conn--dot ${liveConnected ? "is-on" : ""}`} title={liveConnected ? "Živé spojenie" : "Bez živého spojenia"}>
              <i />
            </span>
            <Clock />
          </div>
        </header>
        <ModeBanner />
        <main className="content" id="obsah">
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Rýchla navigácia">
        {MODULES.filter((m) => m.primary).map((m) => (
          <NavLink key={m.path} to={m.path} end={m.path === "/"} className="bottom-nav__item">
            <Icon name={m.icon} size={22} />
            <span>{m.label === "Môj domov" ? "Domov" : m.label}</span>
          </NavLink>
        ))}
        <button type="button" className={`bottom-nav__item ${moreOpen ? "active" : ""}`} onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}>
          <Icon name="more" size={22} />
          <span>Viac</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="sheet" role="dialog" aria-label="Všetky moduly" onClick={() => setMoreOpen(false)}>
          <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__grid">
              {MODULES.map((m) => (
                <NavLink key={m.path} to={m.path} end={m.path === "/"} className="sheet__item">
                  <Icon name={m.icon} size={24} />
                  <span>{m.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
