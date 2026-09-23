import { useEffect, useState } from 'react';

export interface DailyForecast { code: number; max: number; min: number; precipChance: number | null }
export interface CalgaryWeather {
  status: 'loading' | 'ready' | 'error';
  current?: { temp: number; code: number; isDay: boolean; windKph: number; cloudCover: number; observedAt: string };
  /** Keyed by Calgary calendar date (YYYY-MM-DD), matching weekAgenda(). */
  daily: Record<string, DailyForecast>;
}

const URL =
  'https://api.open-meteo.com/v1/forecast?latitude=51.0447&longitude=-114.0719' +
  '&current=temperature_2m,weather_code,is_day,wind_speed_10m,cloud_cover' +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
  '&timezone=America%2FEdmonton&forecast_days=7';
const CACHE_KEY = 'cw_home_weather_v2';
const CACHE_MS = 20 * 60 * 1000;

function parse(data: any): Omit<CalgaryWeather, 'status'> | null {
  const c = data?.current;
  const d = data?.daily;
  if (typeof c?.temperature_2m !== 'number' || !Array.isArray(d?.time)) return null;
  const daily: Record<string, DailyForecast> = {};
  d.time.forEach((date: string, i: number) => {
    const max = d.temperature_2m_max?.[i], min = d.temperature_2m_min?.[i];
    if (typeof max !== 'number' || typeof min !== 'number') return;
    const pop = d.precipitation_probability_max?.[i];
    daily[date] = { code: d.weather_code?.[i] ?? -1, max, min, precipChance: typeof pop === 'number' ? pop : null };
  });
  return {
    current: { temp: c.temperature_2m, code: c.weather_code ?? -1, isDay: c.is_day !== 0, windKph: c.wind_speed_10m ?? 0, cloudCover: typeof c.cloud_cover === 'number' ? c.cloud_cover : 0, observedAt: c.time },
    daily,
  };
}

/**
 * One Open-Meteo request (Environment Canada's GEM model among its sources) for
 * "now" plus seven days, shared by the hero line, the week planner and the Live
 * band. Cached per tab so moving around the site doesn't refetch. On failure
 * every consumer simply omits weather — nothing is ever filled in.
 */
export function useCalgaryWeather(): CalgaryWeather {
  const [state, setState] = useState<CalgaryWeather>(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.at < CACHE_MS) return { status: 'ready', ...cached.value };
    } catch { /* storage unavailable — fetch instead */ }
    return { status: 'loading', daily: {} };
  });

  useEffect(() => {
    if (state.status === 'ready') return;
    let cancelled = false;
    fetch(URL)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(data => {
        const value = parse(data);
        if (!value) throw new Error('Malformed forecast');
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), value })); } catch { /* ignore */ }
        if (!cancelled) setState({ status: 'ready', ...value });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error', daily: {} }); });
    return () => { cancelled = true; };
  }, []);

  return state;
}
