// End-to-end kontrola kiosku SolarGroup Home (Playwright + Chromium).
//
//   SGH_URL=http://127.0.0.1:8080 SGH_USER=meno SGH_PASS=heslo node e2e/kiosk-check.mjs
//   voliteľne SOAK_MIN=10 – dlhší beh hlavnej obrazovky s meraním pamäte JS
//
// Spúšťa sa proti bežiacemu backendu (DEMO). Na Raspberry Pi ho netreba – je to vývojová kontrola;
// test na skutočnom 7" displeji je opísaný v docs/RASPBERRY_PI_KIOSK.md.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Chýba balík 'playwright' (npm i -D playwright alebo globálna inštalácia).");
  process.exit(2);
}

const BASE = process.env.SGH_URL ?? "http://127.0.0.1:8080";
const USER = process.env.SGH_USER ?? "jaro";
const PASS = process.env.SGH_PASS ?? "velmi-tajne-heslo";
const SOAK_MIN = Number(process.env.SOAK_MIN ?? 0);
const MODULES = ["Žilina", "Fotovoltika", "Klíma", "Kúrenie", "Rolety", "Svetlá", "Kamery", "Vrátnik", "Rádio a hudba", "Kalendár", "Spotreba"];

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "OK  " : "CHYBA"} ${name}${detail ? ` – ${detail}` : ""}`);
};

async function login(page) {
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(600);
  if (await page.getByRole("heading", { name: "Prihlásenie" }).count()) {
    await page.getByLabel("Používateľ").fill(USER);
    await page.getByLabel("Heslo", { exact: true }).fill(PASS);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
  }
  await page.getByRole("heading", { name: "Môj domov" }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(1200);
}

async function layout(browser, w, h, expectFit) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  const page = await ctx.newPage();
  await login(page);
  const m = await page.evaluate((mods) => {
    const nav = document.querySelector(".bottom-nav").getBoundingClientRect();
    const titles = [...document.querySelectorAll(".card__title")];
    const cards = mods.map((t) => {
      const el = titles.find((x) => x.textContent.trim().toLowerCase() === t.toLowerCase());
      if (!el) return { t, found: false };
      const r = el.closest(".card").getBoundingClientRect();
      return { t, found: true, inside: r.top >= 0 && r.left >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= nav.top + 0.5 };
    });
    const small = [...document.querySelectorAll(".content button, .content a, .bottom-nav a")]
      .filter((b) => b.offsetParent && b.getAttribute("role") !== "switch")
      .map((b) => ({ b, r: b.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 40 || r.width < 40)
      .map(({ b, r }) => `${(b.getAttribute("aria-label") || b.textContent).trim().slice(0, 24)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    return { sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, ih: innerHeight, iw: innerWidth, cards, small };
  }, MODULES);
  const tag = `${w}×${h}`;
  if (expectFit) {
    check(`${tag}: bez vertikálneho posúvania`, m.sh <= m.ih, `výška obsahu ${m.sh} / ${m.ih}`);
    const missing = m.cards.filter((c) => !c.found || !c.inside).map((c) => c.t);
    check(`${tag}: všetkých 11 modulov viditeľných nad spodnou lištou`, missing.length === 0, missing.join(", "));
  }
  check(`${tag}: bez vodorovného posúvania`, m.sw <= m.iw, `šírka ${m.sw} / ${m.iw}`);
  check(`${tag}: dotykové prvky aspoň 40 px`, m.small.length === 0, m.small.join("; "));
  await page.screenshot({ path: `e2e/out/home-${w}x${h}.png` });

  if (expectFit) {
    // ťuknutie na kartu Kúrenie otvorí detail, ktorý sa zmestí do okna
    await page.locator(".card", { has: page.locator(".card__title", { hasText: /^Kúrenie$/ }) }).locator(".card__head").tap();
    const dlg = page.getByRole("dialog", { name: "Kúrenie" });
    await dlg.waitFor({ timeout: 3000 });
    const r = await page.locator(".modal__panel").boundingBox();
    check(`${tag}: ťuknutie na kartu otvorí detail`, true);
    check(`${tag}: detailné okno v rámci obrazovky`, r.y >= 0 && r.y + r.height <= h + 0.5, JSON.stringify(r));
    await page.screenshot({ path: `e2e/out/kurenie-${w}x${h}.png` });
    await page.keyboard.press("Escape");
  }
  await ctx.close();
}

async function keyboardLogin(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 600 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?kiosk=1`);
  await page.getByRole("heading", { name: "Prihlásenie" }).waitFor({ timeout: 8000 });
  const tapKeys = async (text) => {
    for (const ch of text) {
      if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) await page.getByRole("button", { name: "Veľké písmená" }).tap();
      await page.locator(".vk").getByRole("button", { name: ch.toLowerCase() === ch ? ch : ch, exact: true }).first().tap();
    }
  };
  await page.getByLabel("Používateľ").tap();
  const vk = page.locator(".vk");
  await vk.waitFor({ timeout: 2000 });
  check("Klávesnica sa zobrazí po ťuknutí do poľa Používateľ", await vk.isVisible());
  const im = await page.getByLabel("Používateľ").getAttribute("inputmode");
  check("Systémová klávesnica potlačená (inputmode=none)", im === "none", `inputmode=${im}`);
  await tapKeys(USER);
  check("Meno zadané klávesnicou", (await page.getByLabel("Používateľ").inputValue()) === USER);

  const pass = page.getByLabel("Heslo", { exact: true });
  await pass.tap();
  // znaky mimo vrstvy písmen prepneme cez ?123
  for (const ch of PASS) {
    if (/[a-z@\-,.]/.test(ch)) await vk.getByRole("button", { name: ch, exact: true }).first().tap();
    else {
      await vk.getByRole("button", { name: "Čísla a symboly" }).tap();
      await vk.getByRole("button", { name: ch, exact: true }).first().tap();
      await vk.getByRole("button", { name: "Písmená" }).tap();
    }
  }
  const pv = await pass.inputValue();
  check("Heslo zadané klávesnicou", pv === PASS);
  check("Heslo zostáva skryté (type=password)", (await pass.getAttribute("type")) === "password");
  const pb = await pass.boundingBox();
  const kb = await vk.boundingBox();
  check("Klávesnica neprekrýva aktívne pole", pb.y + pb.height <= kb.y, `pole končí ${Math.round(pb.y + pb.height)} px, klávesnica začína ${Math.round(kb.y)} px`);
  await page.screenshot({ path: "e2e/out/klavesnica-login-1024x600.png" });
  await vk.getByRole("button", { name: "Zmazať" }).tap();
  check("Mazanie znaku", (await pass.inputValue()) === PASS.slice(0, -1));
  await vk.getByRole("button", { name: PASS.slice(-1), exact: true }).first().tap().catch(async () => {
    await vk.getByRole("button", { name: "Čísla a symboly" }).tap();
    await vk.getByRole("button", { name: PASS.slice(-1), exact: true }).first().tap();
  });
  await vk.getByRole("button", { name: "Potvrdiť" }).tap();
  await page.getByRole("heading", { name: "Môj domov" }).waitFor({ timeout: 8000 });
  check("Prihlásenie cez dotykovú klávesnicu", true);
  check("Klávesnica sa po prihlásení skryje", (await page.locator(".vk").count()) === 0);

  await ctx.close();

  // Externá (USB) klávesnica

  const ctx2 = await browser.newContext({ viewport: { width: 1024, height: 600 }, hasTouch: true });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/?kiosk=1`);
  await p2.getByLabel("Používateľ").tap();
  await p2.locator(".vk").waitFor();
  await p2.keyboard.type("usb");
  check("USB klávesnica píše do poľa", (await p2.getByLabel("Používateľ").inputValue()) === "usb");
  check("Pri USB klávesnici sa dotyková skryje", (await p2.locator(".vk").count()) === 0);
  await ctx2.close();
}

async function mobileNoSecondKeyboard(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?kiosk=0`);
  await page.getByLabel("Používateľ").tap();
  await page.waitForTimeout(300);
  check("Mobil: vlastná klávesnica sa nezobrazí (ostáva systémová)", (await page.locator(".vk").count()) === 0);
  const im = await page.getByLabel("Používateľ").getAttribute("inputmode");
  check("Mobil: systémová klávesnica nie je potlačená", im !== "none");
  await ctx.close();
}

async function soak(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 600 }, hasTouch: true });
  const page = await ctx.newPage();
  await login(page);
  const heap = async () => (await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)) / 1048576;
  const start = await heap();
  const samples = [];
  for (let i = 0; i < SOAK_MIN; i++) {
    await page.waitForTimeout(60_000);
    samples.push((await heap()).toFixed(1));
  }
  const end = await heap();
  check(`Dlhší beh ${SOAK_MIN} min (simulácia, nie Raspberry Pi)`, end - start < 30, `JS heap ${start.toFixed(1)} → ${end.toFixed(1)} MB [${samples.join(", ")}]`);
  await ctx.close();
}

const { mkdirSync } = await import("node:fs");
mkdirSync("e2e/out", { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  await layout(browser, 1024, 600, true);
  await layout(browser, 1280, 800, true);
  await layout(browser, 1366, 768, true);
  await layout(browser, 1920, 1080, true);
  await layout(browser, 2560, 1440, true);
  await layout(browser, 390, 844, false);
  await keyboardLogin(browser);
  await mobileNoSecondKeyboard(browser);
  if (SOAK_MIN > 0) await soak(browser);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kontrol prešlo`);
process.exit(failed.length ? 1 : 0);
