// Vytvorí náhľady návrhu E4 (1024 × 600) vložením do bežiacej aplikácie (DEMO na 127.0.0.1:8080).
//   NODE_PATH=$(npm root -g) node docs/navrh-e4/src/render.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
const { chromium } = createRequire(process.env.NODE_PATH + "/")("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "..");
const BASE = process.env.SGH_URL ?? "http://127.0.0.1:8080";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1024, height: 600 }, bypassCSP: true });
const p = await ctx.newPage();
await p.goto(`${BASE}/login`);
await p.fill('input[autocomplete="username"]', process.env.SGH_USER ?? "jaro");
await p.fill('input[type="password"]', process.env.SGH_PASS ?? "velmi-tajne-heslo");
await p.click('button[type="submit"]');
await p.waitForURL(`${BASE}/`);
for (const [fn, file] of [["mainPage", "1-pocasie-hlavna"], ["dayPage", "2-pocasie-detail-dna"], ["radarPage", "3-pocasie-radar"]]) {
  await p.goto(`${BASE}/pocasie`);
  await p.waitForTimeout(800);
  await p.addStyleTag({ path: path.join(here, "navrh.css") });
  await p.addScriptTag({ path: path.join(here, "navrh.js") });
  await p.evaluate((fn) => {
    const top = document.querySelector(".topbar").getBoundingClientRect().bottom;
    const bot = innerHeight - document.querySelector(".bottom-nav").getBoundingClientRect().top;
    document.documentElement.style.setProperty("--wx-top", `${top}px`);
    document.documentElement.style.setProperty("--wx-bot", `${bot}px`);
    document.querySelector(".content").insertAdjacentHTML("beforeend", window.WX[fn]());
  }, fn);
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(out, `${file}-1024x600.png`) });
  console.log("ok", file);
}
await b.close();
