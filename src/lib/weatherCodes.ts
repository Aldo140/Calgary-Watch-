/**
 * WMO weather interpretation codes (as returned by Open-Meteo) reduced to the
 * handful of states a person plans around. `wet` drives the homepage's
 * "rain likely — indoor plans marked" hint, so it is true only for codes that
 * actually mean precipitation, not for overcast or fog.
 */
export type SkyIcon = 'sun' | 'moon' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export interface Sky { label: string; icon: SkyIcon; wet: boolean }

export function describeSky(code: number, isDay = true): Sky {
  if (code === 0) return { label: isDay ? 'Clear' : 'Clear night', icon: isDay ? 'sun' : 'moon', wet: false };
  if (code === 1 || code === 2) return { label: code === 1 ? 'Mostly clear' : 'Partly cloudy', icon: isDay ? 'partly' : 'moon', wet: false };
  if (code === 3) return { label: 'Overcast', icon: 'cloud', wet: false };
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'fog', wet: false };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'drizzle', wet: true };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: code >= 80 ? 'Showers' : 'Rain', icon: 'rain', wet: true };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', icon: 'snow', wet: true };
  if (code >= 95) return { label: 'Thunderstorms', icon: 'storm', wet: true };
  return { label: 'Mixed', icon: 'cloud', wet: false };
}
