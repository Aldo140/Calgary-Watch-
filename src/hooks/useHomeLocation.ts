import { useEffect, useState } from 'react';

/**
 * Resolves a saved street address to coordinates, in the browser, without
 * storing the result.
 *
 * The personal briefing needs to say "180 m from your address", which needs a
 * point rather than a string. The obvious implementation is to geocode once at
 * save time and keep `homeLat`/`homeLng` on the user document — but that puts a
 * precise residential coordinate in the database permanently, for a number we
 * only need while the briefing is on screen. The address is already stored and
 * is enough to derive this on demand, so nothing new is persisted and there is
 * one less field to disclose, secure and delete.
 *
 * Source is the city's own parcel register (s8b3-j88p, 419,555 addresses),
 * which is the same register the address autocomplete searches. That means the
 * string we saved came from this dataset and usually matches it exactly.
 */

export interface HomeLocation {
  lat: number;
  lng: number;
}

/**
 * Turns what we stored back into what the register uses as a key.
 *
 * Saved values look like "158 Saddlemead Gr Ne, Calgary" — title cased by the
 * autocomplete and suffixed with the city. The register holds
 * "158 SADDLEMEAD GR NE".
 */
export function toRegistryAddress(saved: string): string {
  return saved
    .split(',')[0]
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Splits "201 23 AV NE" into the register's four indexed columns. */
export function splitAddressParts(address: string): {
  house_number: string; street_name: string; street_type: string; street_quad: string;
} | null {
  const m = address.match(/^(\S+)\s+(.+)\s+(\S+)\s+(NW|NE|SW|SE)$/);
  if (!m) return null;
  return { house_number: m[1], street_name: m[2], street_type: m[3], street_quad: m[4] };
}

const BASE = 'https://data.calgary.ca/resource/s8b3-j88p.json';

function readPoint(rows: Array<{ latitude?: string; longitude?: string }>): HomeLocation | null {
  const row = rows[0];
  if (!row) return null;
  const lat = parseFloat(row.latitude ?? '');
  const lng = parseFloat(row.longitude ?? '');
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export async function resolveHomeLocation(
  savedAddress: string,
  signal?: AbortSignal,
): Promise<HomeLocation | null> {
  const address = toRegistryAddress(savedAddress);
  if (address.length < 5) return null;

  const select = '&$select=latitude,longitude&$limit=1';

  // Exact key first — the common case, because the string came from here.
  try {
    const res = await fetch(`${BASE}?address=${encodeURIComponent(address)}${select}`, { signal });
    if (res.ok) {
      const hit = readPoint(await res.json());
      if (hit) return hit;
    }
  } catch { if (signal?.aborted) return null; }

  // Typed by hand rather than picked: spacing or the quadrant may differ, so
  // fall back to the indexed columns.
  const parts = splitAddressParts(address);
  if (!parts) return null;
  const where = (Object.keys(parts) as Array<keyof typeof parts>)
    .map((k) => `${k}='${parts[k].replace(/'/g, "''")}'`)
    .join(' AND ');
  try {
    const res = await fetch(`${BASE}?$where=${encodeURIComponent(where)}${select}`, { signal });
    if (res.ok) return readPoint(await res.json());
  } catch { /* offline — the briefing drops its distance sections */ }

  return null;
}

/** Per-session memo, keyed by address. Not written to storage. */
const _memo = new Map<string, Promise<HomeLocation | null>>();

export function useHomeLocation(savedAddress: string | undefined, enabled: boolean): {
  home: HomeLocation | null;
  isResolving: boolean;
} {
  const [home, setHome] = useState<HomeLocation | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    const address = (savedAddress ?? '').trim();
    if (!enabled || !address) { setHome(null); return; }

    let cancelled = false;
    const key = toRegistryAddress(address);
    if (!_memo.has(key)) _memo.set(key, resolveHomeLocation(address));

    setIsResolving(true);
    void _memo.get(key)!.then((point) => {
      if (cancelled) return;
      setHome(point);
      setIsResolving(false);
    });

    return () => { cancelled = true; };
  }, [savedAddress, enabled]);

  return { home, isResolving };
}
