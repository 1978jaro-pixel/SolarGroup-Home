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
import { CalendarPage, SettingsPage } from "./pages/Misc";
import { RadioPage } from "./pages/Radio";
import { SolarPage } from "./pages/Solar";
import { SystemPage } from "./pages/System";
import { WeatherPage } from "./pages/Weather";

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
        <Route path="hudba" element={<RadioPage />} />
        <Route path="kalendar" element={<CalendarPage />} />
        <Route path="system" element={<SystemPage />} />
        <Route path="nastavenia" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
