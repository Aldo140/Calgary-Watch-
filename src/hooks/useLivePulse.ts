import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/src/firebase';
import type { Incident, IncidentCategory } from '@/src/types';
import { type ExampleReport } from '@/src/lib/homeClaims';
import { buildPulseSnapshot, PULSE_DOC, readPulseSnapshot, type PulseSnapshot } from '@/src/lib/livePulseSnapshot';

const SAMPLE = 60;
const CACHE_KEY = 'cw_pulse';
const CACHE_MS = 10 * 60 * 1000;

/** Moving between the homepage and /community shouldn't cost another read. */
function readCache(): PulseSnapshot | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) as { at: number; pulse: PulseSnapshot } : null;
    return parsed && Date.now() - parsed.at < CACHE_MS ? readPulseSnapshot(parsed.pulse, Date.now()) : null;
  } catch { return null; }
}
function writeCache(pulse: PulseSnapshot) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), pulse })); } catch { /* private mode */ }
}

export interface LivePulse {
  reports: { status: 'idle' | 'loading' | 'ready' | 'error'; total: number; capped: boolean; byCategory: Partial<Record<IncidentCategory, number>>; checkedAt?: number; example?: ExampleReport | null; recent?: ExampleReport[] };
  air: { status: 'idle' | 'loading' | 'ready' | 'error'; pm25?: number };
}

/**
 * The homepage's "right now" facts, read once per visit (no live listener).
 * Reads nothing until `enabled`. Uses the map's own public-incidents query shape, which the rules and
 * existing composite index already allow.
 */
export function useLivePulse(enabled: boolean): LivePulse {
  const [reports, setReports] = useState<LivePulse['reports']>({ status: 'idle', total: 0, capped: false, byCategory: {} });
  const [air, setAir] = useState<LivePulse['air']>({ status: 'idle' });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    if (db) {
      setReports(r => ({ ...r, status: 'loading' }));
      const show = (p: PulseSnapshot) => { if (!cancelled) setReports({ status: 'ready', ...p }); };
      const cached = readCache();
      if (cached) show(cached);
      else {
        // One read for the snapshot the ingest job keeps current; the 60-report
        // query only when that snapshot is missing or stale.
        const database = db;
        getDoc(doc(database, PULSE_DOC.collection, PULSE_DOC.id))
          .then(snap => readPulseSnapshot(snap.data(), Date.now()))
          .catch(() => null)
          .then(async snapshot => {
            if (snapshot) return snapshot;
            const snap = await getDocs(query(collection(database, 'incidents'), where('visibility', '==', 'public'), orderBy('timestamp', 'desc'), limit(SAMPLE)));
            return buildPulseSnapshot(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Incident), Date.now(), SAMPLE);
          })
          .then(p => { writeCache(p); show(p); })
          .catch(() => { if (!cancelled) setReports(r => ({ ...r, status: 'error' })); });
      }
    } else {
      setReports(r => ({ ...r, status: 'error' }));
    }

    setAir({ status: 'loading' });
    fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=51.0447&longitude=-114.0719&current=pm2_5&timezone=America%2FEdmonton')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(data => {
        const pm25 = data?.current?.pm2_5;
        if (typeof pm25 !== 'number') throw new Error('No reading');
        if (!cancelled) setAir({ status: 'ready', pm25 });
      })
      .catch(() => { if (!cancelled) setAir({ status: 'error' }); });

    return () => { cancelled = true; };
  }, [enabled]);

  return { reports, air };
}
