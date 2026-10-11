import { useEffect, useState } from 'react';
import { isPubliclyVisible, type Incident } from '../types';

/**
 * The newest public reports, read once and shared for a couple of minutes.
 *
 * Search uses this to answer "seton", "yesterday police" and the like. It is
 * the map's own query shape (visibility == 'public', newest first), so the
 * rules and the existing composite index already allow it; 200 is the most a
 * public list query may ask for. Nothing is read until `enabled`.
 */

export const LATEST_LIMIT = 200;
const FRESH_MS = 2 * 60_000;

export type LatestReports = { status: 'idle' | 'loading' | 'ready' | 'error'; incidents: Incident[]; oldest: number | null };

let cache: { at: number; incidents: Incident[] } | null = null;
let inflight: Promise<Incident[]> | null = null;

function load(): Promise<Incident[]> {
  if (cache && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache.incidents);
  inflight ??= Promise.all([import('firebase/firestore'), import('../firebase')])
    .then(async ([{ collection, getDocs, limit, orderBy, query, where }, { db }]) => {
      if (!db) return [];
      const snap = await getDocs(query(collection(db, 'incidents'), where('visibility', '==', 'public'), orderBy('timestamp', 'desc'), limit(LATEST_LIMIT)));
      const now = Date.now();
      return snap.docs
        .map(d => { const x = d.data(); return { id: d.id, ...x, lat: Number(x.lat), lng: Number(x.lng) } as Incident; })
        .filter(i => isPubliclyVisible(i) && (!i.expires_at || i.expires_at > now));
    })
    .then(incidents => { cache = { at: Date.now(), incidents }; return incidents; })
    .finally(() => { inflight = null; });
  return inflight;
}

export function useLatestReports(enabled: boolean): LatestReports {
  const [state, setState] = useState<LatestReports>(() => (cache ? { status: 'ready', incidents: cache.incidents, oldest: oldestOf(cache.incidents) } : { status: 'idle', incidents: [], oldest: null }));
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setState(s => (s.status === 'ready' ? s : { ...s, status: 'loading' }));
    load()
      .then(incidents => { if (live) setState({ status: 'ready', incidents, oldest: oldestOf(incidents) }); })
      .catch(() => { if (live) setState({ status: 'error', incidents: [], oldest: null }); });
    return () => { live = false; };
  }, [enabled]);
  return state;
}

function oldestOf(list: Incident[]): number | null {
  return list.length ? Math.min(...list.map(i => i.timestamp)) : null;
}
