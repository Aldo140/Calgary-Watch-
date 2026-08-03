import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/src/firebase';
import type { PowerOutage } from '@/src/types/powerOutage';
import {
  OUTAGE_COLLECTION,
  OUTAGE_DOC_ID,
  OUTAGE_REFRESH_MS,
  OUTAGE_STALE_AFTER_MS,
} from '@/src/lib/powerOutages';

const USER_FACING_ERROR = 'ENMAX outage information is temporarily unavailable.';

export interface PowerOutagesState {
  outages: PowerOutage[];
  /** ISO timestamp of the ENMAX fetch behind the current records. */
  updatedAt: string | null;
  /** True when the published snapshot has aged past OUTAGE_STALE_AFTER_MS. */
  stale: boolean;
  /** In-flight indicator for the subtle layer-level spinner. */
  isLoading: boolean;
  /** False until the first read (success or failure) has landed. */
  hasLoaded: boolean;
  /** User-safe message — never a stack trace. */
  error: string | null;
  /** Manual retry for the error state. */
  refresh: () => void;
}

/** Shape of the live_data/power_outages document. Treated as untrusted. */
interface OutageSnapshot {
  outages?: unknown;
  updatedAt?: unknown;
}

/**
 * Live ENMAX outages, read from the snapshot document that the ingest pipeline
 * publishes (scripts/ingest/power-outages.ts). The browser never calls ENMAX.
 *
 * Behaviour:
 *  - reads only once the layer is switched on, so visitors who never enable it
 *    cost zero Firestore reads
 *  - re-reads every five minutes while enabled and the tab is visible
 *  - a one-document `getDoc` per interval rather than a realtime listener, so
 *    read volume stays flat regardless of how long the tab is left open
 *  - keeps the last successful result through transient failures, so a single
 *    bad refresh never blanks the map
 *
 * @param enabled whether the outage layer is currently switched on
 */
export function usePowerOutages(enabled: boolean): PowerOutagesState {
  const [outages, setOutages] = useState<PowerOutage[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs keep the polling effect stable: it depends only on `enabled`, so
  // re-renders can never stack up a second interval.
  const lastFetchAt = useRef(0);
  const isMounted = useRef(true);
  const isFetching = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const load = useCallback(async (force: boolean) => {
    // Never out-poll the ingest cron unless the user explicitly retried.
    if (!force && Date.now() - lastFetchAt.current < OUTAGE_REFRESH_MS) return;
    if (isFetching.current) return;

    if (!db) {
      if (isMounted.current) {
        setError(USER_FACING_ERROR);
        setHasLoaded(true);
      }
      return;
    }

    isFetching.current = true;
    lastFetchAt.current = Date.now();
    if (isMounted.current) setIsLoading(true);

    try {
      const snapshot = await getDoc(doc(db, OUTAGE_COLLECTION, OUTAGE_DOC_ID));
      if (!isMounted.current) return;

      if (!snapshot.exists()) {
        // The pipeline has not published yet. Not an error — just nothing to show.
        setOutages([]);
        setUpdatedAt(null);
        setStale(false);
        setError(null);
        return;
      }

      const data = snapshot.data() as OutageSnapshot;
      if (!Array.isArray(data.outages)) throw new Error('Malformed outage snapshot');

      const publishedAt = typeof data.updatedAt === 'number' ? data.updatedAt : null;

      setOutages(data.outages as PowerOutage[]);
      setUpdatedAt(publishedAt ? new Date(publishedAt).toISOString() : null);
      setStale(publishedAt !== null && Date.now() - publishedAt > OUTAGE_STALE_AFTER_MS);
      setError(null);
    } catch (err) {
      if (!isMounted.current) return;
      // Detail stays in the console for developers; users get one plain sentence.
      console.warn('[CalgaryWatch] Power outage snapshot read failed:', err);
      // Deliberately leave `outages` untouched — a failed refresh must not
      // clear markers that are still the best information we have.
      setError(USER_FACING_ERROR);
      // Allow an immediate retry rather than waiting out the throttle window.
      lastFetchAt.current = 0;
    } finally {
      isFetching.current = false;
      if (isMounted.current) {
        setIsLoading(false);
        setHasLoaded(true);
      }
    }
  }, []);

  // Read only while the layer is on and the tab is in the foreground.
  useEffect(() => {
    if (!enabled) return;

    let intervalId: number | undefined;

    const start = () => {
      if (intervalId !== undefined) return;
      void load(false);
      intervalId = window.setInterval(() => void load(false), OUTAGE_REFRESH_MS);
    };

    const stop = () => {
      if (intervalId === undefined) return;
      window.clearInterval(intervalId);
      intervalId = undefined;
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    handleVisibility();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stop();
    };
  }, [enabled, load]);

  const refresh = useCallback(() => {
    void load(true);
  }, [load]);

  return { outages, updatedAt, stale, isLoading, hasLoaded, error, refresh };
}
