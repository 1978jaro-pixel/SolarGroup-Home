// SolarGroup Home E4 – grafický NÁVRH sekcie Počasie (nie je súčasťou aplikácie).
// Vkladá sa do bežiacej aplikácie (iba v prehliadači pri tvorbe náhľadu), aby návrh sedel
// do skutočnej hornej lišty a spodnej navigácie pri 1024 × 600. Všetky hodnoty sú UKÁŽKOVÉ.
(() => {
  let uid = 0;
  const id = (p) => `${p}${++uid}`;

  // ---------- ikony počasia (SVG, plastický vzhľad bez rastrových obrázkov) ----------
  const CLOUD = "M20 48H46C52.6 48 57 43.5 57 38C57 32.6 52.8 28.3 47.5 28C46 21.5 40.3 17 33.5 17C26.6 17 20.9 21.8 19.6 28.2C13.6 28.9 9 33.6 9 39C9 44 13.5 48 20 48Z";
  function sun(cx, cy, r) {
    const g = id("s");
    return `<defs><radialGradient id="${g}" cx="38%" cy="35%" r="70%"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#ffc93c"/><stop offset="1" stop-color="#ff9418"/></radialGradient></defs>
      <circle cx="${cx}" cy="${cy}" r="${r * 1.55}" fill="rgba(255,190,60,.16)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${g})"/>`;
  }
  function cloud(tx = 0, ty = 0, s = 1, dark = false) {
    const g = id("c");
    const [a, b] = dark ? ["#e3e9f3", "#8e9db4"] : ["#ffffff", "#b8c7dc"];
    return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
      <g transform="translate(${tx} ${ty}) scale(${s})"><path d="${CLOUD}" fill="rgba(0,0,0,.18)" transform="translate(0 2.5)"/><path d="${CLOUD}" fill="url(#${g})"/></g>`;
  }
  const drops = (n = 3) =>
    Array.from({ length: n }, (_, i) => `<path d="M${22 + i * 10} 51 l-3 8" stroke="#56b6ff" stroke-width="3.4" stroke-linecap="round"/>`).join("");
  const ICONS = {
    sun: () => sun(32, 32, 14),
    partly: () => sun(24, 24, 11) + cloud(8, 8, 0.85),
    cloud: () => cloud(-2, -1, 1.03, true),
    rain: () => cloud(0, -7, 1, true) + drops(4),
    showers: () => sun(22, 20, 9) + cloud(6, 0, 0.85, true) + drops(3),
    storm: () => cloud(0, -7, 1, true) + `<path d="M33 38l-8 13h7l-4 11 12-15h-7l5-9z" fill="#ffd23c" stroke="#e69a00" stroke-width="1"/>`,
    night: () => `<path d="M30 10a16 16 0 1 0 18 22a13 13 0 0 1-18-22z" fill="#cfd9ff"/>` + cloud(8, 10, 0.8, true),
  };
  const icon = (t, s = 48, cls = "") => `<svg class="wx-ic ${cls}" width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true">${ICONS[t]()}</svg>`;
  const drop = (s = 12) => `<svg width="${s}" height="${s}" viewBox="0 0 12 12"><path d="M6 1C6 1 2 5.6 2 8a4 4 0 0 0 8 0C10 5.6 6 1 6 1z" fill="#56b6ff"/></svg>`;
  const pin = `<svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" fill="#7fb8ff"/></svg>`;
  const back = `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="#e8f0ff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const smooth = (p) => {
    let d = `M${p[0][0]},${p[0][1]}`;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
      d += ` C${b[0] + (c[0] - a[0]) / 6},${b[1] + (c[1] - a[1]) / 6} ${c[0] - (e[0] - b[0]) / 6},${c[1] - (e[1] - b[1]) / 6} ${c[0]},${c[1]}`;
    }
    return d;
  };

  // ---------- ukážkové údaje (Žilina, koniec októbra) ----------
  const DAYS = [
    { d: "Dnes", dt: "31. 10.", ic: "partly", max: 11, min: 4, p: 20 },
    { d: "Ne", dt: "1. 11.", ic: "rain", max: 9, min: 3, p: 80 },
    { d: "Po", dt: "2. 11.", ic: "cloud", max: 10, min: 2, p: 30 },
    { d: "Ut", dt: "3. 11.", ic: "showers", max: 8, min: 1, p: 60 },
    { d: "St", dt: "4. 11.", ic: "partly", max: 7, min: 0, p: 10 },
    { d: "Št", dt: "5. 11.", ic: "sun", max: 9, min: 2, p: 0 },
    { d: "Pi", dt: "6. 11.", ic: "partly", max: 11, min: 4, p: 15 },
  ];
  const H24 = {
    h: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    t: [9, 10, 11, 11, 11, 10, 8, 7, 6, 6, 5, 5, 4, 4, 4, 3, 3, 3, 3, 3, 4, 5, 6, 7],
    p: [10, 5, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 70, 65, 60, 55, 50, 45, 40, 35],
  };
  const DAY2 = {
    h: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    ic: ["rain", "rain", "rain", "showers", "cloud", "cloud", "partly", "showers", "rain", "rain", "rain", "rain"],
    t: [3, 3, 4, 5, 6, 7, 8, 9, 9, 8, 7, 6],
    p: [75, 80, 70, 55, 40, 30, 25, 45, 65, 75, 80, 80],
    mm: [0.8, 1.0, 0.6, 0.3, 0.1, 0, 0, 0.2, 0.7, 1.1, 1.2, 0.9],
    w: [18, 20, 22, 24, 22, 20, 18, 22, 26, 28, 26, 24],
    wd: [300, 305, 310, 300, 295, 290, 300, 310, 315, 320, 315, 310],
  };
  const f1 = (x) => x.toFixed(1).replace(".", ",");

  // ---------- mapa Žiliny a okolia (zjednodušená ilustrácia namiesto mapových dlaždíc) ----------
  const PLACES = [
    ["Žilina", 49.223, 18.74, 1], ["Kysucké Nové Mesto", 49.3, 18.786, 2], ["Bytča", 49.224, 18.558, 2],
    ["Považská Bystrica", 49.121, 18.449, 2], ["Rajec", 49.089, 18.636, 2], ["Martin", 49.066, 18.923, 2],
    ["Terchová", 49.259, 19.03, 3], ["Varín", 49.206, 18.873, 3], ["Rajecké Teplice", 49.13, 18.686, 3],
    ["Vrútky", 49.113, 18.92, 3], ["Turzovka", 49.403, 18.624, 3], ["Púchov", 49.124, 18.326, 2],
    ["Dolný Kubín", 49.209, 19.296, 2], ["Krasňany", 49.215, 18.888, 3],
  ];
  const RIVERS = [
    [[49.124, 18.2], [49.124, 18.33], [49.121, 18.45], [49.17, 18.5], [49.224, 18.56], [49.232, 18.65], [49.228, 18.74], [49.2, 18.81], [49.176, 18.862], [49.13, 18.905], [49.11, 18.93], [49.14, 19.02], [49.155, 19.13], [49.13, 19.22], [49.085, 19.3], [49.07, 19.45]],
    [[49.46, 18.79], [49.38, 18.78], [49.3, 18.79], [49.26, 18.765], [49.232, 18.745]],
    [[49.04, 18.62], [49.089, 18.64], [49.13, 18.69], [49.18, 18.72], [49.226, 18.735]],
  ];
  const ROADS = [
    [[49.124, 18.2], [49.13, 18.33], [49.13, 18.45], [49.2, 18.53], [49.215, 18.6], [49.21, 18.72]],
    [[49.21, 18.74], [49.19, 18.82], [49.15, 18.88], [49.08, 18.92], [48.98, 18.95]],
    [[49.23, 18.75], [49.3, 18.78], [49.44, 18.79]],
    [[49.215, 18.73], [49.15, 18.69], [49.089, 18.636], [48.99, 18.6]],
    [[49.155, 19.13], [49.209, 19.296], [49.3, 19.45]],
  ];
  const HILLS = [[49.2, 19.03, 0.13, 0.07], [49.3, 18.43, 0.16, 0.08], [49.04, 18.5, 0.15, 0.07], [49.42, 19.02, 0.18, 0.06], [49.06, 19.1, 0.1, 0.06]];
  // ilustračné zrážky: [lat, lon, polomer px pri mierke 1, intenzita 0–1]
  const RAIN = [[49.1, 18.42, 95, 0.35], [49.18, 18.56, 85, 0.55], [49.24, 18.63, 60, 0.85], [49.27, 18.68, 34, 1], [49.33, 18.86, 80, 0.5], [49.36, 19.0, 60, 0.35], [49.05, 18.3, 70, 0.3]];

  function mapSvg(W, H, { k = 1178, cLat = 49.223, cLon = 18.74, cx = W / 2, cy = H / 2, labels = 3, rain = true } = {}) {
    const kx = k * Math.cos((49.2 * Math.PI) / 180);
    const P = (lat, lon) => [cx + (lon - cLon) * kx, cy - (lat - cLat) * k];
    const line = (pts) => smooth(pts.map(([a, b]) => P(a, b)));
    const s = k / 1178;
    const blur = id("b"), land = id("l");
    let out = `<svg class="wx-map" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
      <defs>
        <radialGradient id="${land}" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#173052"/><stop offset="1" stop-color="#0d1d35"/></radialGradient>
        <filter id="${blur}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${14 * s}"/></filter>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#${land})"/>`;
    for (const [la, lo, rl, rk] of HILLS) {
      const [x, y] = P(la, lo);
      out += `<ellipse cx="${x}" cy="${y}" rx="${rk * kx * 1.4}" ry="${rl * k * 0.55}" fill="rgba(30,70,80,.32)" filter="url(#${blur})"/>`;
    }
    for (const r of ROADS) out += `<path d="${line(r)}" fill="none" stroke="rgba(170,195,235,.22)" stroke-width="${Math.max(1, 2.2 * s)}"/>`;
    for (const r of RIVERS) out += `<path d="${line(r)}" fill="none" stroke="#2f6fb3" stroke-width="${Math.max(1.4, 3.2 * s)}" stroke-linecap="round" opacity=".9"/>`;
    if (rain) {
      const COL = (v) => (v > 0.9 ? "#ff5a3c" : v > 0.75 ? "#ffb02e" : v > 0.5 ? "#f2e14a" : "#44d07a");
      out += `<g filter="url(#${blur})" opacity=".78">`;
      for (const [la, lo, r, v] of RAIN) {
        const [x, y] = P(la, lo);
        out += `<ellipse cx="${x}" cy="${y}" rx="${r * s * 1.35}" ry="${r * s * 0.8}" fill="${COL(v)}" opacity="${0.35 + v * 0.45}" transform="rotate(-24 ${x} ${y})"/>`;
      }
      out += `</g>`;
    }
    for (const [n, la, lo, rank] of PLACES) {
      if (rank > labels) continue;
      const [x, y] = P(la, lo);
      if (x < 0 || y < 0 || x > W || y > H) continue;
      const main = n === "Žilina";
      out += main
        ? `<circle cx="${x}" cy="${y}" r="${16 * Math.max(s, 0.6)}" fill="rgba(80,160,255,.18)"/><circle cx="${x}" cy="${y}" r="6" fill="#4aa3ff" stroke="#fff" stroke-width="2.4"/>
           <text x="${x + 11}" y="${y - 9}" class="wx-maplab wx-maplab--main">${n}</text>`
        : `<circle cx="${x}" cy="${y}" r="3" fill="#c9d6ea"/><text x="${x + 7}" y="${y + 4}" class="wx-maplab">${n}</text>`;
    }
    return out + `</svg>`;
  }

  // ---------- spoločné časti ----------
  const head = (title, sub, right = "", backLabel = "") => `
    <div class="wx-head">
      <button class="wx-back" aria-label="Späť">${back}${backLabel ? `<span>${backLabel}</span>` : ""}</button>
      <div class="wx-title"><h1>${title}</h1>${sub}</div>
      <div class="wx-head__right">${right}</div>
    </div>`;
  const updated = `<div class="wx-upd"><span>Aktualizované 11:05</span><small>Zdroj: Open-Meteo</small></div>`;

  // ---------- 1. hlavná stránka ----------
  function hourlyChart(W, H) {
    const n = H24.t.length, padL = 20, padR = 14, x = (i) => padL + (i * (W - padL - padR)) / (n - 1);
    const tMin = 2, tMax = 12, yT = (t) => 22 + ((tMax - t) / (tMax - tMin)) * 62;
    const pts = H24.t.map((t, i) => [x(i), yT(t)]);
    const area = id("a");
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="wx-chart">
      <defs><linearGradient id="${area}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,190,90,.35)"/><stop offset="1" stop-color="rgba(255,190,90,0)"/></linearGradient></defs>
      <path d="${smooth(pts)} L${x(n - 1)},92 L${x(0)},92 Z" fill="url(#${area})"/>
      <path d="${smooth(pts)}" fill="none" stroke="#ffbf5e" stroke-width="2.6"/>`;
    H24.t.forEach((t, i) => {
      if (i % 3) return;
      s += `<circle cx="${x(i)}" cy="${yT(t)}" r="3.2" fill="#ffbf5e" stroke="#13284a" stroke-width="1.5"/><text x="${x(i)}" y="${yT(t) - 8}" class="wx-cv">${t}°</text>`;
    });
    const bw = ((W - padL - padR) / n) * 0.52, by = 150, bh = 46;
    H24.p.forEach((p, i) => {
      const h = Math.max(2, (p / 100) * bh);
      s += `<rect x="${x(i) - bw / 2}" y="${by - h}" width="${bw}" height="${h}" rx="${bw / 2}" fill="${p >= 50 ? "#4aa3ff" : "rgba(74,163,255,.55)"}"/>`;
      if (i % 3 === 0) s += `<text x="${x(i)}" y="${by - h - 5}" class="wx-pv">${p}%</text>`;
    });
    s += `<line x1="0" x2="${W}" y1="${by + 0.5}" y2="${by + 0.5}" stroke="rgba(150,185,235,.18)"/>`;
    H24.h.forEach((h, i) => {
      if (i % 3) return;
      s += `<text x="${x(i)}" y="${by + 17}" class="wx-hl">${i === 0 ? "Teraz" : String(h).padStart(2, "0") + ":00"}</text>`;
    });
    return s + `</svg>`;
  }

  function uvGauge(v) {
    const r = 32, cx = 40, cy = 38, a = Math.PI * (1 - Math.min(v, 11) / 11);
    const g = id("uv");
    return `<svg width="80" height="46" viewBox="0 0 80 46"><defs><linearGradient id="${g}"><stop offset="0" stop-color="#3ddc84"/><stop offset=".3" stop-color="#f2e14a"/><stop offset=".55" stop-color="#ff9a3c"/><stop offset=".8" stop-color="#ef4d4d"/><stop offset="1" stop-color="#b06bff"/></linearGradient></defs>
      <path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="url(#${g})" stroke-width="7" stroke-linecap="round"/>
      <circle cx="${cx + r * Math.cos(a)}" cy="${cy - r * Math.sin(a)}" r="6" fill="#fff" stroke="#0d1d35" stroke-width="2.5"/></svg>`;
  }
  function sunArc(frac) {
    const r = 40, cx = 52, cy = 46, a = Math.PI * (1 - frac);
    const sx = cx + r * Math.cos(a), sy = cy - r * Math.sin(a);
    return `<svg width="104" height="54" viewBox="0 0 104 54">
      <path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="rgba(150,185,235,.25)" stroke-width="2" stroke-dasharray="3 4"/>
      <path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${sx} ${sy}" fill="none" stroke="#ffc94a" stroke-width="2.6" stroke-linecap="round"/>
      <line x1="4" x2="100" y1="${cy}" y2="${cy}" stroke="rgba(150,185,235,.3)"/>
      <circle cx="${sx}" cy="${sy}" r="9" fill="rgba(255,200,70,.25)"/><circle cx="${sx}" cy="${sy}" r="5.5" fill="#ffd257"/></svg>`;
  }
  function compass(deg) {
    return `<svg width="58" height="58" viewBox="0 0 58 58"><circle cx="29" cy="29" r="25" fill="rgba(74,163,255,.08)" stroke="rgba(150,185,235,.3)"/>
      ${["S", "V", "J", "Z"].map((t, i) => `<text x="${29 + 19 * Math.sin((i * Math.PI) / 2)}" y="${29 - 19 * Math.cos((i * Math.PI) / 2) + 3.5}" class="wx-cmp">${t}</text>`).join("")}
      <g transform="rotate(${deg} 29 29)"><path d="M29 10 L34 31 L29 27 L24 31 Z" fill="#7fc0ff"/><path d="M29 48 L29 31" stroke="#7fc0ff" stroke-width="2.4" stroke-linecap="round"/></g></svg>`;
  }

  function mainPage() {
    const wMin = 0, wMax = 11;
    const days = DAYS.map((d, i) => {
      const l = ((d.min - wMin) / (wMax - wMin)) * 100, r = ((d.max - wMin) / (wMax - wMin)) * 100;
      return `<button class="wx-day ${i === 1 ? "is-hint" : ""}">
        <span class="wx-day__n">${d.d}</span><span class="wx-day__dt">${d.dt}</span>
        ${icon(d.ic, 44)}
        <span class="wx-day__max">${d.max}°</span><span class="wx-day__min">${d.min}°</span>
        <span class="wx-range"><i style="left:${l}%;right:${100 - r}%"></i></span>
        <span class="wx-day__p">${drop(10)} ${d.p} %</span>
      </button>`;
    }).join("");
    return `<div class="wx wx--main">
      ${head("Počasie", `<span class="wx-city">${pin} Žilina</span>`, updated)}
      <div class="wx-rowA">
        <section class="wx-now">
          <div class="wx-now__top"><span>Teraz · sobota 31. 10.</span><span>11:05</span></div>
          <div class="wx-now__mid">
            <div><div class="wx-now__t">9°</div><div class="wx-now__s">Prevažne oblačno</div></div>
            ${icon("partly", 96, "wx-ic--hero")}
          </div>
          <div class="wx-now__bot"><span>Pocitovo <b>7°</b></span><span>Max <b>11°</b></span><span>Min <b>4°</b></span></div>
        </section>
        <section class="wx-days" aria-label="Predpoveď na 7 dní">${days}</section>
      </div>
      <div class="wx-rowB">
        <section class="wx-card wx-hourly">
          <div class="wx-card__h"><h2>Nasledujúcich 24 hodín</h2><span class="wx-leg"><i class="t"></i>Teplota <i class="p"></i>Zrážky</span></div>
          ${hourlyChart(376, 172)}
        </section>
        <section class="wx-tiles">
          <div class="wx-tile"><h3>UV index</h3>${uvGauge(1)}<div class="wx-tile__v">1 <small>nízky</small></div></div>
          <div class="wx-tile"><h3>Slnko</h3>${sunArc(0.45)}<div class="wx-sun"><span>↑ 06:38</span><span>↓ 16:31</span></div></div>
          <div class="wx-tile wx-tile--wind"><h3>Vietor</h3><div class="wx-wind">${compass(225)}<div><div class="wx-tile__v">14<small> km/h</small></div><small>JZ</small></div></div><div class="wx-tile__sub">Nárazy <b>32 km/h</b></div></div>
          <div class="wx-tile"><h3>Vlhkosť</h3><div class="wx-tile__v wx-big">78<small> %</small></div><span class="wx-bar"><i style="width:78%"></i></span><div class="wx-tile__sub">Rosný bod 5°</div></div>
          <div class="wx-tile"><h3>Viditeľnosť</h3><div class="wx-tile__v wx-big">18<small> km</small></div><div class="wx-tile__sub">Dobrá</div></div>
          <div class="wx-tile"><h3>Zrážky</h3><div class="wx-tile__v wx-big">0,4<small> mm</small></div><div class="wx-tile__sub">dnes · 24 h: 3,1 mm</div></div>
        </section>
        <button class="wx-card wx-radar">
          <div class="wx-card__h"><h2>Radar</h2><span class="wx-live">Zrážky</span></div>
          <div class="wx-radar__map">${mapSvg(176, 150, { k: 420, labels: 1 })}</div>
          <div class="wx-radar__cta">Otvoriť mapu <span>›</span></div>
        </button>
      </div>
      <div class="wx-note wx-note--head">NÁVRH · ukážkové údaje</div>
    </div>`;
  }

  // ---------- 2. detail dňa ----------
  function dayPage() {
    const chips = DAYS.map((d, i) => `<button class="wx-chip ${i === 1 ? "is-on" : ""}">${d.d === "Dnes" ? "Dnes" : d.d}</button>`).join("");
    const n = DAY2.h.length, CW = 54, W = CW * n;
    const x = (i) => CW / 2 + i * CW;
    const yT = (t) => 30 + ((10 - t) / 8) * 58;
    const pts = DAY2.t.map((t, i) => [x(i), yT(t)]);
    const ar = id("a");
    let curve = `<svg width="${W}" height="104" viewBox="0 0 ${W} 104" class="wx-chart">
      <defs><linearGradient id="${ar}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,190,90,.32)"/><stop offset="1" stop-color="rgba(255,190,90,0)"/></linearGradient></defs>
      <path d="${smooth(pts)} L${x(n - 1)},104 L${x(0)},104 Z" fill="url(#${ar})"/><path d="${smooth(pts)}" fill="none" stroke="#ffbf5e" stroke-width="2.6"/>
      ${pts.map(([px, py], i) => `<circle cx="${px}" cy="${py}" r="3.4" fill="#ffbf5e" stroke="#13284a" stroke-width="1.5"/><text x="${px}" y="${py - 9}" class="wx-cv">${DAY2.t[i]}°</text>`).join("")}</svg>`;
    const cols = DAY2.h.map((h, i) => {
      const ph = Math.max(3, (DAY2.p[i] / 100) * 46);
      return `<div class="wx-col">
        <span class="wx-col__h">${String(h).padStart(2, "0")}:00</span>${icon(DAY2.ic[i], 32)}
        <span class="wx-col__p">${DAY2.p[i]} %</span>
        <span class="wx-col__bar"><i style="height:${ph}px;${DAY2.p[i] >= 50 ? "" : "opacity:.6"}"></i></span>
        <span class="wx-col__mm">${DAY2.mm[i] ? f1(DAY2.mm[i]) : "0"} mm</span>
        <svg width="18" height="18" viewBox="0 0 18 18" class="wx-col__wd"><g transform="rotate(${DAY2.wd[i] + 180} 9 9)"><path d="M9 2 L13 13 L9 10.5 L5 13 Z" fill="#7fc0ff"/></g></svg>
        <span class="wx-col__w">${DAY2.w[i]}</span>
      </div>`;
    }).join("");
    const rows = [
      ["Pocitová teplota", "0° / 6°"], ["Zrážky", "6,9 mm · 80 %"], ["Vietor", "22 km/h · SZ"], ["Nárazy", "45 km/h"], ["Vlhkosť", "88 %"],
      ["UV index", "1 · nízky"], ["Východ slnka", "06:40"], ["Západ slnka", "16:29"],
    ].map(([k, v]) => `<div class="wx-kv"><span>${k}</span><b>${v}</b></div>`).join("");
    return `<div class="wx wx--day">
      ${head("Nedeľa 1. novembra", `<span class="wx-city">${pin} Žilina</span>`, `<div class="wx-chips">${chips}</div>`, "Počasie")}
      <div class="wx-dayGrid">
        <section class="wx-card wx-sum">
          <div class="wx-sum__top">${icon("rain", 84, "wx-ic--hero")}<div><div class="wx-sum__t">9°<span> / 3°</span></div><div class="wx-sum__s">Dážď, popoludní silnejší</div></div></div>
          ${rows}
        </section>
        <section class="wx-card wx-hours">
          <div class="wx-card__h"><h2>Po hodinách</h2><span class="wx-scroll">‹ 06:00 – 17:00 · potiahnutím celý deň ›</span></div>
          <div class="wx-hours__body">
            <div class="wx-gut"><span style="top:4px">Čas</span><span style="top:96px">Teplota</span><span style="top:196px">Zrážky</span><span style="top:290px">Vietor<br>km/h</span></div>
            <div class="wx-hours__grid"><div class="wx-hours__curve">${curve}</div><div class="wx-cols">${cols}</div></div>
          </div>
          <div class="wx-hours__sum"><span>${drop(12)} Spolu <b>6,9 mm</b></span><span>Najviac prší <b>15:00 – 17:00</b></span><span>Max. nárazy <b>45 km/h</b> o 15:00</span></div>
        </section>
      </div>
      <div class="wx-note wx-note--head2">NÁVRH · ukážkové údaje</div>
    </div>`;
  }

  // ---------- 3. radar ----------
  function radarPage() {
    const ticks = Array.from({ length: 13 }, (_, i) => i);
    const lab = (i) => { const m = 9 * 60 + 20 + i * 10; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
    return `<div class="wx wx--radar">
      <div class="wx-mapbox">${mapSvg(1024, 495, { k: 1178 })}</div>
      <div class="wx-rhead">
        <button class="wx-back wx-back--glass" aria-label="Späť na počasie">${back}<span>Počasie</span></button>
        <div class="wx-rtitle"><h1>Radar zrážok</h1><span>${pin} Žilina a okolie</span></div>
      </div>
      <div class="wx-rtop"><button class="wx-seg is-on">Zrážky</button><button class="wx-seg">Posledné 2 h</button></div>
      <div class="wx-zoom"><button>+</button><button>−</button><button class="wx-loc" aria-label="Moja poloha"><svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="#7fb8ff"/><circle cx="12" cy="12" r="8" fill="none" stroke="#7fb8ff" stroke-width="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="#7fb8ff" stroke-width="2"/></svg></button></div>
      <div class="wx-time">
        <button class="wx-play" aria-label="Prehrať">
          <svg width="22" height="22" viewBox="0 0 24 24"><path d="M7 5v14l12-7z" fill="#fff"/></svg></button>
        <div class="wx-track">
          <div class="wx-track__now">10:50 <small>pred 30 min</small></div>
          <div class="wx-track__bar"><i style="width:${(9 / 12) * 100}%"></i>${ticks.map((i) => `<b style="left:${(i / 12) * 100}%"></b>`).join("")}<span class="wx-thumb" style="left:${(9 / 12) * 100}%"></span></div>
          <div class="wx-track__lab"><span>${lab(0)}</span><span>${lab(6)}</span><span>teraz ${lab(12)}</span></div>
        </div>
      </div>
      <div class="wx-legend"><h3>Intenzita zrážok</h3><span class="wx-legend__bar"></span><div class="wx-legend__lab"><span>slabé</span><span>stredné</span><span>silné</span></div><small>0,1 · 1 · 5 · 20 · 50 mm/h</small></div>
      <div class="wx-attr">© OpenStreetMap prispievatelia · Radar © RainViewer</div>
      <div class="wx-note wx-note--top">NÁVRH · mapa a zrážky sú ilustrácia, nie skutočné údaje</div>
    </div>`;
  }

  window.WX = { mainPage, dayPage, radarPage };
})();
