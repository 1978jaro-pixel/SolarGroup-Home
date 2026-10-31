import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useApp } from "./hooks/AppContext";
import { BlindsPage } from "./pages/Blinds";
import { CamerasPage, IntercomPage } from "./pages/Cameras";
import { ClimatePage } from "./pages/Climate";
import { EnergyPage } from "./pages/Energy";
import { HeatingPage } from "./pages/Heating";
import { HomePage } from "./pages/Home";
import { LightsPage } from "./pages/Lights";
import { LoginPage, ServerDown } from "./pages/Login";
import { RoomsPage } from "./pages/Rooms";
import { CalendarPage } from "./pages/Calendar";
import { SettingsPage } from "./pages/Misc";
import { RadioPage } from "./pages/Radio";
import { SolarPage } from "./pages/Solar";
import { SystemPage } from "./pages/System";
import { WeatherDayPage, WeatherPage } from "./pages/Weather";

// radar (s knižnicou Leaflet) sa načíta až po otvorení
const WeatherRadarPage = lazy(() => import("./pages/WeatherRadar").then((m) => ({ default: m.WeatherRadarPage })));

export function App() {
  const { ready, serverReachable, user } = useApp();
  if (!ready) return <div className="boot" aria-busy="true" />;
  if (!serverReachable && !user) return <ServerDown />;
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="miestnosti" element={<RoomsPage />} />
        <Route path="fotovoltika" element={<SolarPage />} />
        <Route path="kurenie" element={<HeatingPage />} />
        <Route path="klimatizacia" element={<ClimatePage />} />
        <Route path="svetla" element={<LightsPage />} />
        <Route path="zaluzie" element={<BlindsPage />} />
        <Route path="kamery" element={<CamerasPage />} />
        <Route path="videovratnik" element={<IntercomPage />} />
        <Route path="energia" element={<EnergyPage />} />
        <Route path="pocasie" element={<WeatherPage />} />
        <Route path="pocasie/den/:date" element={<WeatherDayPage />} />
        <Route
          path="pocasie/radar"
          element={
            <Suspense fallback={<div className="wxp" />}>
              <WeatherRadarPage />
            </Suspense>
          }
        />
        <Route path="hudba" element={<RadioPage />} />
        <Route path="kalendar" element={<CalendarPage />} />
        <Route path="system" element={<SystemPage />} />
        <Route path="nastavenia" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
