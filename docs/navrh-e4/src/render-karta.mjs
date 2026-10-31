// Náhľad úvodnej obrazovky s NÁVRHOM novej karty Počasie (1024 × 600), vložený do bežiacej aplikácie (DEMO).
//   NODE_PATH=$(npm root -g) node docs/navrh-e4/src/render-karta.mjs [stav]
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
const { chromium } = createRequire(process.env.NODE_PATH + "/")("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "..");
const BASE = process.env.SGH_URL ?? "http://127.0.0.1:8080";
const sky = (s) => `data:image/webp;base64,${readFileSync(path.join(out, "karta", `sky-${s}.webp`)).toString("base64")}`;
// ukážkové údaje (Žilina) – nie sú živé
const STATES = {
  zamracene: { t: 9, s: "Prevažne zamračené", max: 9, min: 4, days: [["Dnes", "rain", 9, 4, 65], ["Ne", "partly", 10, 3, 0], ["Po", "cloud", 9, 4, 0], ["Ut", "showers", 8, 2, 40]] },
  jasno: { t: 14, s: "Jasno", max: 16, min: 5, days: [["Dnes", "sun", 16, 5, 0], ["Ne", "partly", 15, 6, 0], ["Po", "partly", 13, 4, 10], ["Ut", "cloud", 11, 4, 20]] },
  dazd: { t: 7, s: "Dážď", max: 8, min: 4, days: [["Dnes", "rain", 8, 4, 90], ["Ne", "rain", 7, 3, 70], ["Po", "cloud", 9, 3, 20], ["Ut", "partly", 10, 2, 0]] },
};
const which = process.argv[2] ?? "zamracene";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1024, height: 600 }, bypassCSP: true });
const p = await ctx.newPage();
await p.goto(`${BASE}/login`);
await p.fill('input[autocomplete="username"]', process.env.SGH_USER ?? "jaro");
await p.fill('input[type="password"]', process.env.SGH_PASS ?? "velmi-tajne-heslo");
await p.click('button[type="submit"]');
await p.waitForURL(`${BASE}/`);
await p.waitForTimeout(1500);
await p.addStyleTag({ path: path.join(here, "karta.css") });
await p.addScriptTag({ path: path.join(here, "navrh.js") });
await p.evaluate(({ st, src }) => {
  const card = document.querySelector(".bcard--weather");
  card.classList.add("wc-on");
  const days = st.days.map(([n, ic, mx, mn, pr]) => `<div class="wc-day"><span class="wc-day__n">${n}</span>${window.WX.icon(ic, 30)}<span class="wc-day__p">${pr ? pr + " %" : ""}</span><span class="wc-day__t">${mx}° <span>${mn}°</span></span></div>`).join("");
  card.innerHTML = `<div class="wc"><img class="wc-sky" src="${src}" alt=""><div class="wc-shade"></div>
    <div class="wc-top"><span class="wc-city">Žilina</span><span class="wc-t">${st.t}°</span><span class="wc-s">${st.s}</span><span class="wc-mm">Max: ${st.max}°  Min: ${st.min}°</span></div>
    <div class="wc-panel"><div class="wc-panel__h"><svg width="12" height="12" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2"/></svg>Predpoveď na 4 dni</div><div class="wc-days">${days}</div></div></div>`;
  document.body.insertAdjacentHTML("beforeend", `<div class="wc-note">NÁVRH · ukážkové údaje</div>`);
}, { st: STATES[which], src: sky(which) });
await p.waitForTimeout(400);
await p.screenshot({ path: path.join(out, which === "zamracene" ? "4-domov-nova-karta-pocasie-1024x600.png" : `karta-${which}.png`) });
await b.close();
console.log("ok", which);
