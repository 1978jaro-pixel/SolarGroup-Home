import type { Reading, Weather } from "../api/types";
import { Icon } from "../components/Icon";
import { Card, PageHeader, ReadingView, StatusBadge } from "../components/ui";
import { useResource } from "../hooks/useResource";
import { weatherInfo } from "../utils/format";

export function useWeather() {
  return useResource<Reading<Weather>>("/api/weather", 10 * 60000);
}

const DAY = new Intl.DateTimeFormat("sk-SK", { weekday: "short" });

export function WeatherSummary({ w }: { w: Weather }) {
  const info = weatherInfo(w.code);
  return (
    <div className="weather-now">
      <Icon name={info.icon} size={44} className="weather-now__icon" />
      <div>
        <span className="weather-now__temp">{Math.round(w.temp)}°</span>
        <span className="weather-now__label">
          {info.label} · {w.location}
        </span>
      </div>
    </div>
  );
}

export function WeatherDays({ w, days = 5 }: { w: Weather; days?: number }) {
  return (
    <ul className="weather-days">
      {w.daily.slice(0, days).map((d, i) => {
        const info = weatherInfo(d.code);
        return (
          <li key={d.date}>
            <span>{i === 0 ? "Dnes" : DAY.format(new Date(d.date))}</span>
            <Icon name={info.icon} size={22} title={info.label} />
            <span>
              <strong>{Math.round(d.temp_max)}°</strong> <span className="muted">{Math.round(d.temp_min)}°</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function WeatherPage() {
  const r = useWeather();
  return (
    <>
      <PageHeader title="Počasie" subtitle="Žilina" badge={<StatusBadge reading={r.data} />} />
      <ReadingView reading={r.data} error={r.error} loading={r.loading}>
        {(w) => (
          <div className="grid grid--detail">
            <Card accent="blue">
              <WeatherSummary w={w} />
              <dl className="kv mt">
                <dt>Pocitová teplota</dt>
                <dd>{w.feels_like != null ? `${Math.round(w.feels_like)} °C` : "–"}</dd>
                <dt>Vlhkosť</dt>
                <dd>{w.humidity != null ? `${Math.round(w.humidity)} %` : "–"}</dd>
                <dt>Vietor</dt>
                <dd>{w.wind_kmh != null ? `${Math.round(w.wind_kmh)} km/h` : "–"}</dd>
              </dl>
            </Card>
            <Card title="Predpoveď" icon="calendar">
              <WeatherDays w={w} />
            </Card>
          </div>
        )}
      </ReadingView>
      <p className="muted small mt">LIVE údaje: Open-Meteo (vyžaduje internet). Bez internetu sa zobrazí OFFLINE – ovládanie domácnosti funguje ďalej.</p>
    </>
  );
}
