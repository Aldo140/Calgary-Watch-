import { useEffect, useState } from 'react';
import { collection, getCountFromServer, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/src/firebase';

export interface AdminWorkload {
  suggestions: number;
  failedActions: number;
  stuckActions: number;
  /** Listing claims to confirm plus organizer changes to apply. */
  claims: number;
}

/**
 * Work waiting outside the incident queue, counted server-side (one read per
 * thousand documents) when admin opens and every ten minutes after:
 * resident event suggestions, moderation the hourly job couldn't apply, and
 * moderation queued long enough that the job itself probably isn't running.
 */
export function useAdminWorkload(enabled: boolean): AdminWorkload {
  const [w, setW] = useState<AdminWorkload>({ suggestions: 0, failedActions: 0, stuckActions: 0, claims: 0 });
  useEffect(() => {
    if (!enabled || !db) return;
    const database = db;
    const count = (q: Parameters<typeof getCountFromServer>[0]) => getCountFromServer(q).then((s) => s.data().count).catch(() => 0);
    // Single-field filters only, so no composite index has to be deployed
    // (the rules-only backend release does not create indexes). The queue is
    // small: a handful of pending or failed rows at most.
    const queue = () => getDocs(query(collection(database, 'discovery_actions'), where('status', 'in', ['pending', 'failed']), limit(100)))
      .then((s) => s.docs.map((d) => d.data() as { status: string; createdAt?: number }))
      .catch(() => [] as Array<{ status: string; createdAt?: number }>);
    const load = () => void Promise.all([
      count(query(collection(database, 'entity_submissions'), where('status', '==', 'pending'))),
      queue(),
      count(query(collection(database, 'listing_claims'), where('status', '==', 'pending'))),
      count(query(collection(database, 'listing_updates'), where('status', '==', 'pending'))),
      count(query(collection(database, 'market_service_requests'), where('status', '==', 'new'))),
    ]).then(([suggestions, rows, claims, updates, service]) => {
      const now = Date.now();
      setW({
        suggestions,
        claims: claims + updates + service,
        failedActions: rows.filter((r) => r.status === 'failed' && (r.createdAt ?? 0) > now - 7 * 86_400_000).length,
        stuckActions: rows.filter((r) => r.status === 'pending' && (r.createdAt ?? now) < now - 2 * 3_600_000).length,
      });
    });
    load();
    const t = window.setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [enabled]);
  return w;
}
