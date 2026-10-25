import "@fontsource-variable/inter";
import "./styles/tokens.css";
import "./styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { Screensaver } from "./components/Screensaver";
import { VirtualKeyboard } from "./components/VirtualKeyboard";
import { AppProvider } from "./hooks/AppContext";
import { initKioskFromUrl, isKiosk } from "./utils/kiosk";

// Kiosk (Raspberry Pi): ?kiosk=1 zapne dotykovú klávesnicu a potlačí kontextové menu dlhého dotyku.
initKioskFromUrl();
document.addEventListener("contextmenu", (e) => {
  if (isKiosk() && !(e.target as HTMLElement).closest("input, textarea")) e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
        <VirtualKeyboard />
        <Screensaver />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);

// PWA: service worker iba v produkčnom zostavení (cache aplikácie, nie údajov z API).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
