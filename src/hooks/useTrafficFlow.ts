import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/src/firebase';
import {
  CALGARY_TRAFFIC_VOLUME_URL,
  makeTrafficFlowSnapshot,
  normalizeAnnualTrafficVolumes,
  parseTrafficFlowSnapshot,
  TRAFFIC_FLOW_COLLECTION,
  TRAFFIC_FLOW_DOC_ID,
  TRAFFIC_FLOW_REFRESH_MS,
  TRAFFIC_FLOW_STALE_MS,
} from '@/src/lib/trafficFlow';
import type { TrafficFlowSnapshot, TrafficFlowState } from '@/src/types/trafficFlow';

let baselineCache: Promise<TrafficFlowSnapshot | null> | null = null;

function loadBaseline(): Promise<TrafficFlowSnapshot | null> {
  if (!baselineCache) {
    baselineCache = fetch(CALGARY_TRAFFIC_VOLUME_URL)
      .then((response) => response.ok ? response.json() : [])
      .then((rows: unknown) => {
        const segments = normalizeAnnualTrafficVolumes(Array.isArray(rows) ? rows : []);
        return segments.length
          ? makeTrafficFlowSnapshot(segments, 'City of Calgary annual traffic volume', Date.now(), CALGARY_TRAFFIC_VOLUME_URL)
          : null;
      })
      .catch(() => null);
  }
  return baselineCache;
}

/**
 * Reads the privacy-safe server snapshot. Until a live provider is configured,
 * the layer remains useful as an explicitly labelled typical-demand view.
 */
export function useTrafficFlow(enabled: boolean): TrafficFlowState {
  const [state, setState] = useState<TrafficFlowState>({
    snapshot: null,
    loading: false,
    error: null,
    stale: false,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const load = async () => {
      setState((current) => ({ ...current, loading: current.snapshot === null, error: null }));
      try {
        let snapshot: TrafficFlowSnapshot | null = null;
        if (db) {
          const result = await getDoc(doc(db, TRAFFIC_FLOW_COLLECTION, TRAFFIC_FLOW_DOC_ID));
          if (result.exists()) snapshot = parseTrafficFlowSnapshot(result.data());
        }
        if (!snapshot) snapshot = await loadBaseline();
        if (cancelled) return;
        setState({
          snapshot,
          loading: false,
          error: snapshot ? null : 'Traffic flow data is unavailable.',
          stale: snapshot?.mode !== 'baseline' && Date.now() - (snapshot?.updatedAt ?? 0) > TRAFFIC_FLOW_STALE_MS,
        });
      } catch {
        const fallback = await loadBaseline();
        if (cancelled) return;
        setState((current) => current.snapshot ? {
          ...current,
          loading: false,
          error: 'Traffic flow update delayed.',
          stale: current.snapshot.mode !== 'baseline',
        } : {
          snapshot: fallback,
          loading: false,
          error: fallback ? null : 'Traffic flow data is unavailable.',
          stale: false,
        });
      }
    };

    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, TRAFFIC_FLOW_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled]);

  return state;
}
