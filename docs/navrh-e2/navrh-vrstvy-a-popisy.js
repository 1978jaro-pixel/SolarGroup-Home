// Návrh komponentu PvScene: statický dom (img) + vrstva panelov a tokov (SVG) + popisy (HTML).
// Súradnice v priestore referenčnej fotografie 1046 × 1010.
window.pvScene = function (data, variant) {
  const full = variant === "full";
  // výrez scény: plný (stránka Fotovoltika) alebo široký pás domu (karta na hlavnej obrazovke)
  const vb = full ? [0, 0, 1046, 1010] : [60, 150, 920, 655];
  const fmt = (kw) => (kw == null ? "–" : Math.abs(kw) < 1 ? `${Math.round(Math.abs(kw) * 1000)}<small> W</small>` : `${Math.abs(kw).toFixed(1).replace(".", ",")}<small> kW</small>`);
  const pct = (x, y) => [((x - vb[0]) / vb[2]) * 100, ((y - vb[1]) / vb[3]) * 100];
  const flows = [
    ["pv", "M490 393 L490 497", data.pv],
    ["house", "M457 537 L303 548", data.house],
    ["battery", "M529 531 L641 524", data.battery],
    ["grid", "M535 668 L535 600 L528 600", null],
    ["grid2", "M490 662 L490 571", data.grid],
    ["ev", "M880 540 C882 566 893 586 890 604", data.ev],
  ].filter((f) => f[0] !== "grid");
  const dur = (kw) => Math.max(0.7, Math.min(2.6, 2.6 - Math.log2(1 + Math.abs(kw)) * 0.5)).toFixed(2);
  const flowSvg = flows
    .map(([id, d, kw]) => {
      const on = kw != null && Math.abs(kw) >= 0.05;
      if (!on) return "";
      return `<g class="flow ${kw < 0 ? "rev" : ""}" style="--dur:${dur(kw)}s"><path d="${d}" class="glow"/><path d="${d}" class="core"/><path d="${d}" class="pulse"/></g>`;
    })
    .join("");
  // svietiace panely – rovnaká mriežka ako v statickom obrázku; jas podľa výkonu FV
  const glow = data.pv > 0.05 ? Math.min(0.75, 0.2 + data.pv / 20) : 0;
  let panels = "";
  for (const y of [0.07, 0.51]) for (let i = 0; i < 8; i++) panels += `<rect x="${(0.105 + i * 0.11).toFixed(3)}" y="${y}" width="0.104" height="0.42"/>`;
  // odkazové čiary k popisom (iba plná verzia; karta má popisy bez čiar)
  const leaders = full
    ? [
        [387, 190, 387, 268],
        [668, 190, 668, 476],
        [228, 802, 228, 660],
        [535, 802, 535, 668],
        [835, 802, 835, 632],
      ]
        .map(([x1, y1, x2, y2]) => `<path d="M${x1} ${y1} L${x2} ${y2}" class="leader"/><circle cx="${x2}" cy="${y2}" r="3.5" class="leader-dot"/>`)
        .join("")
    : "";
  const label = (cls, name, value, extra, x, y, align) => {
    const [l, t] = pct(x, y);
    return `<div class="pv-lab pvl-${cls} a-${align}" style="left:${l}%;top:${t}%"><span class="n">${name}</span><span class="v">${value}${extra ?? ""}</span></div>`;
  };
  const batDir = data.battery > 0.05 ? " · nabíja" : data.battery < -0.05 ? " · vybíja" : "";
  const gridDir = data.grid > 0.05 ? " · odber" : data.grid < -0.05 ? " · dodávka" : "";
  const labels = full
    ? label("solar", "Výroba", fmt(data.pv), "", 360, 72, "end") +
      label("battery", `Batéria${batDir}`, fmt(data.battery), ` <b class="soc">${data.soc} %</b>`, 700, 72, "start") +
      label("home", "Dom", fmt(data.house), "", 228, 812, "center") +
      label("grid", `Sieť${gridDir}`, fmt(data.grid), "", 535, 812, "center") +
      label("ev", "Nabíjačka", fmt(data.ev), "", 835, 812, "center")
    : label("solar", "Výroba", fmt(data.pv), "", 80, 160, "start") +
      label("battery", `Batéria${batDir}`, fmt(data.battery), ` <b class="soc">${data.soc} %</b>`, 962, 160, "end") +
      label("home", "Dom", fmt(data.house), "", 150, 694, "center") +
      label("grid", `Sieť${gridDir}`, fmt(data.grid), "", 515, 694, "center") +
      label("ev", "Nabíjačka", fmt(data.ev), "", 860, 694, "center");
  const vbs = vb.join(" ");
  return `<div class="pv-scene2 is-${variant}" style="aspect-ratio:${vb[2]}/${vb[3]}">
    <svg class="layer" viewBox="${vbs}" preserveAspectRatio="xMidYMid meet"><image href="${window.HOUSE_URL || "house-static.svg"}" x="0" y="0" width="1046" height="1010"/></svg>
    <svg class="layer" viewBox="${vbs}" preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id="pvGlow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6fb6ff"/><stop offset="0.6" stop-color="#2f86ff"/><stop offset="1" stop-color="#1f5fd6"/></linearGradient></defs>
      <g transform="matrix(415 8 99 122 205 262)" class="panels" style="opacity:${glow}">${panels}</g>
      ${leaders}${flowSvg}
    </svg>
    ${labels}
  </div>`;
};
