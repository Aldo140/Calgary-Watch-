import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '@/src/firebase';

/**
 * Durable suppression for records a moderator cannot simply delete.
 *
 * Two classes of incident survive deletion today:
 *
 *  - **Ingested records.** `scripts/ingest/index.ts` upserts by `dedup_key`,
 *    which doubles as the document ID, and unconditionally writes
 *    `deleted: false`. Deleting one just means the next 30-minute run
 *    recreates it, wiping any moderation decision with it.
 *  - **Browser-derived records.** Edmonton open data, the Calgary/weather
 *    fetchers, and the ENMAX adapter build `Incident` objects in the client
 *    that are never persisted. There is no document to delete at all.
 *
 * Both consult this list, so it has to be world-readable — which is exactly
 * why it contains nothing but IDs and timestamps. Who suppressed a record and
 * why belongs in `admin_audit_logs`, which only admins can read.
 */

/** Firestore document IDs may not contain '/'. */
export function suppressionDocId(incidentId: string): string {
  return incidentId.replace(/\//g, '_').slice(0, 1500);
}

let cache: { ids: Set<string>; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function fetchSuppressedIds(force = false): Promise<Set<string>> {
  if (!db) return new Set();
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.ids;
  try {
    const snap = await getDocs(collection(db, 'suppressed_incidents'));
    const now = Date.now();
    const ids = new Set<string>();
    for (const d of snap.docs) {
      const expiresAt = d.data()?.expiresAt;
      // An expired entry stops suppressing so the list cannot grow forever.
      if (typeof expiresAt === 'number' && expiresAt < now) continue;
      ids.add(d.id);
    }
    cache = { ids, at: Date.now() };
    return ids;
  } catch {
    // Never fail open into a blank map — an unreachable suppression list
    // should degrade to "nothing suppressed", not "nothing shown".
    return cache?.ids ?? new Set();
  }
}

/** Suppressed IDs, refreshed on mount. Empty until the first fetch resolves. */
export function useSuppressedIds(enabled: boolean): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => cache?.ids ?? new Set());
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchSuppressedIds().then((next) => {
      if (!cancelled) setIds(next);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return ids;
}

/** Drops any incident whose ID has been suppressed by a moderator. */
export function applySuppression<T extends { id: string }>(items: T[], suppressed: Set<string>): T[] {
  if (suppressed.size === 0) return items;
  return items.filter((item) => !suppressed.has(suppressionDocId(item.id)));
}
