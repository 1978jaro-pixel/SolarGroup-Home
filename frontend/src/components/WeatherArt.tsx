import { useId } from "react";
import partlyCloudyImg from "../assets/design/weather.webp";
import { weatherInfo } from "../utils/format";

/** Farebná ikona počasia (slnko, oblak, dážď…) v štýle schváleného návrhu. */
export function WeatherArt({ code, size = 40, title }: { code: number; size?: number; title?: string }) {
  const id = useId().replace(/:/g, "");
  const kind = weatherInfo(code).icon;
  const sun = kind === "sun" || kind === "partly";
  const cloud = kind !== "sun";
  const dark = kind === "rain" || kind === "storm" || kind === "snow" || kind === "fog";
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 60 48" role="img" aria-label={title ?? weatherInfo(code).label} className="weather-art">
      <defs>
        <radialGradient id={`s${id}`} cx="40%" cy="40%" r="60%">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="0.55" stopColor="#ffc93c" />
          <stop offset="1" stopColor="#f59e0b" />
        </radialGradient>
        <linearGradient id={`c${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={dark ? "#e3e8f0" : "#ffffff"} />
          <stop offset="1" stopColor={dark ? "#9aa6b8" : "#c7d1df"} />
        </linearGradient>
      </defs>
      {sun && (
        <g transform={kind === "partly" ? "translate(8 -2)" : "translate(0 0)"}>
          <circle cx={kind === "partly" ? 30 : 30} cy="20" r={kind === "partly" ? 10 : 13} fill={`url(#s${id})`} />
          <circle cx="30" cy="20" r={kind === "partly" ? 14 : 18} fill="#ffc93c" opacity="0.18" />
        </g>
      )}
      {cloud && (
        <path
          d="M14 40h30a9 9 0 0 0 1-17.9A12 12 0 0 0 22.6 19 8.5 8.5 0 0 0 14 40Z"
          fill={`url(#c${id})`}
          transform={kind === "partly" ? "translate(-4 2)" : "translate(0 -2)"}
        />
      )}
      {kind === "rain" &&
        [18, 27, 36].map((x) => <path key={x} d={`M${x} 42l-2.5 5`} stroke="#4aa3ff" strokeWidth="2.4" strokeLinecap="round" />)}
      {kind === "snow" && [18, 27, 36].map((x) => <circle key={x} cx={x} cy="44" r="1.8" fill="#e8f1ff" />)}
      {kind === "storm" && <path d="M29 36l-4 7h5l-3 5" stroke="#ffc93c" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {kind === "fog" && [42, 46].map((y) => <path key={y} d={`M14 ${y}h32`} stroke="#aab5c5" strokeWidth="2" strokeLinecap="round" />)}
    </svg>
  );
}

/** Veľká ilustrácia počasia – pri polojasne fotorealistický motív zo schváleného návrhu. */
export function WeatherHero({ code }: { code: number }) {
  if (code >= 1 && code <= 2) return <img src={partlyCloudyImg} alt="" className="weather-hero weather-hero--img" />;
  return (
    <div className="weather-hero weather-hero--svg">
      <WeatherArt code={code} size={220} />
    </div>
  );
}
