import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/src/firebase';
import type { Incident, IncidentCategory } from '@/src/types';
import { pickExampleReport, recentPins, summarizeReports, type ExampleReport } from '@/src/lib/homeClaims';

const SAMPLE = 60;

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
      getDocs(query(collection(db, 'incidents'), where('visibility', '==', 'public'), orderBy('timestamp', 'desc'), limit(SAMPLE)))
        .then(snap => {
          if (cancelled) return;
          const now = Date.now();
          const incidents = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Incident);
          setReports({ status: 'ready', checkedAt: now, example: pickExampleReport(incidents, now), recent: recentPins(incidents, now), ...summarizeReports(incidents, now, SAMPLE) });
        })
        .catch(() => { if (!cancelled) setReports(r => ({ ...r, status: 'error' })); });
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
