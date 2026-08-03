import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/src/firebase';
import type { Incident } from '@/src/types';
import type { PowerOutage } from '@/src/types/powerOutage';
import {
  OUTAGE_COLLECTION,
  OUTAGE_DOC_ID,
  OUTAGE_REFRESH_MS,
  powerOutagesToIncidents,
} from '@/src/lib/powerOutages';

/**
 * Live ENMAX power outages, surfaced as ordinary Calgary Watch incidents.
 *
 * Reads the snapshot document published by the ingest pipeline
 * (scripts/ingest/power-outages.ts) — the browser never calls ENMAX. Follows
 * the same shape as useEdmontonOpenData / useWeatherAlerts: gated on auth
 * readiness, refreshed on an interval, returning Incident[] for MapPage to
 * merge into the normal feed.
 *
 * Outages become `infrastructure` incidents, so they are filtered, listed and
 * opened through the existing UI rather than a dedicated map layer.
 */
export function usePowerOutages(isAuthReady: boolean): Incident[] {
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    if (!isAuthReady || !db) return;
    const database = db;
    let cancelled = false;

    const load = async () => {
      try {
        const snapshot = await getDoc(doc(database, OUTAGE_COLLECTION, OUTAGE_DOC_ID));
        if (cancelled) return;

        if (!snapshot.exists()) {
          setIncidents([]);
          return;
        }

        const outages = snapshot.data()?.outages;
        if (!Array.isArray(outages)) throw new Error('Malformed outage snapshot');

        setIncidents(powerOutagesToIncidents(outages as PowerOutage[]));
      } catch (error) {
        // Never clear what is already on the map because one refresh failed —
        // the previous outages remain the best information we have.
        console.warn('[CalgaryWatch] Power outage snapshot read failed:', error);
      }
    };

    void load();

    // Matches the ingest cron; polling faster would only re-read the same doc.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, OUTAGE_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAuthReady]);

  return incidents;
}
