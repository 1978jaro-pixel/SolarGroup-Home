import type { IconName } from "./components/Icon";

export interface Module {
  path: string;
  label: string;
  icon: IconName;
  /** Zobraziť v spodnej lište na mobile */
  primary?: boolean;
}

export const MODULES: Module[] = [
  { path: "/", label: "Môj domov", icon: "home", primary: true },
  { path: "/miestnosti", label: "Miestnosti", icon: "more" },
  { path: "/fotovoltika", label: "Fotovoltika", icon: "solar", primary: true },
  { path: "/kurenie", label: "Kúrenie", icon: "heat", primary: true },
  { path: "/klimatizacia", label: "Klimatizácia", icon: "thermo" },
  { path: "/svetla", label: "Svetlá", icon: "bulb", primary: true },
  { path: "/zaluzie", label: "Žalúzie", icon: "blinds" },
  { path: "/kamery", label: "Kamery", icon: "camera" },
  { path: "/videovratnik", label: "Videovrátnik", icon: "doorbell" },
  { path: "/energia", label: "Energetické grafy", icon: "bars" },
  { path: "/pocasie", label: "Počasie", icon: "partly" },
  { path: "/hudba", label: "Hudba", icon: "music" },
  { path: "/kalendar", label: "Kalendár", icon: "calendar" },
  { path: "/system", label: "Stav systému", icon: "server" },
  { path: "/nastavenia", label: "Nastavenia", icon: "settings" },
];
