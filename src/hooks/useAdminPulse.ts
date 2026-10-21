/**
 * Headline numbers for the admin overview.
 *
 * Totals are server-side counts (one read per thousand documents), cached for
 * ten minutes so flipping between sections does not re-bill them. The daily
 * series are 14 small counts for page views and one capped read of recent
 * sign-ups. A failed count stays undefined and the tile shows a dash: the
 * overview never invents a number.
 */

import { useEffect, useState } from 'react';
import { collection, getCountFromServer, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/src/firebase';
import { adminReadCache } from '@/src/lib/readEfficiency';
import { RSVPS } from '@/src/lib/plans';
import { SEARCH_DEMAND } from '@/src/lib/searchDemand';
import { bucketByDay, dayStarts } from '@/src/lib/adminPulse';

export interface AdminPulse {
  monday?: number;
  thursday?: number;
  plans?: number;
  searchesWeek?: number;
  viewsWeek?: number;
  newMembersWeek?: number;
  /** Last 14 days, oldest first. */
  viewsByDay?: number[];
  signupsByDay?: number[];
}

const TTL = 10 * 60_000;
const DAYS = 14;

export function useAdminPulse(enabled: boolean, uid?: string): AdminPulse {
  const [pulse, setPulse] = useState<AdminPulse>({});
  useEffect(() => {
    if (!enabled || !db || !uid) return;
    const database = db;
    let active = true;
    const set = (patch: AdminPulse) => { if (active) setPulse((p) => ({ ...p, ...patch })); };
    const count = (key: string, q: Parameters<typeof getCountFromServer>[0]) =>
      adminReadCache.read(`${uid}:pulse:${key}`, () => getCountFromServer(q).then((s) => s.data().count), TTL)
        .catch((e) => { console.warn(`[admin] ${key} count failed`, e); return undefined; });

    const now = Date.now();
    const weekAgo = now - 7 * 86_400_000;
    const users = collection(database, 'users');
    const views = collection(database, 'page_views');

    void count('monday', query(users, where('weeklyDigestOptIn', '==', true))).then((monday) => set({ monday }));
    void count('thursday', query(users, where('eventsDigestOptIn', '==', true))).then((thursday) => set({ thursday }));
    void count('plans', collection(database, RSVPS)).then((plans) => set({ plans }));
    void count('searches', query(collection(database, SEARCH_DEMAND), where('ts', '>=', weekAgo))).then((searchesWeek) => set({ searchesWeek }));

    const starts = dayStarts(DAYS, now);
    void Promise.all(starts.map((start, i) => {
      const end = starts[i + 1] ?? now + 1;
      // Past days never change, so they cache for the session; today refreshes.
      return i < starts.length - 1
        ? adminReadCache.read(`${uid}:pulse:views:${start}`, () => getCountFromServer(query(views, where('timestamp', '>=', start), where('timestamp', '<', end))).then((s) => s.data().count), 24 * 3_600_000).catch(() => undefined)
        : count('views:today', query(views, where('timestamp', '>=', start)));
    })).then((days) => {
      if (days.some((d) => d === undefined)) return;
      const viewsByDay = days as number[];
      set({ viewsByDay, viewsWeek: viewsByDay.slice(-7).reduce((a, b) => a + b, 0) });
    });

    void adminReadCache.read(`${uid}:pulse:signups`, () => getDocs(query(users, where('createdAt', '>=', starts[0]), limit(1000))), TTL)
      .then((snap) => {
        const joined = snap.docs.map((d) => Number(d.data().createdAt)).filter(Number.isFinite);
        const signupsByDay = bucketByDay(joined, starts);
        set({ signupsByDay, newMembersWeek: joined.filter((t) => t >= weekAgo).length });
      })
      .catch((e) => console.warn('[admin] recent sign-ups failed', e));

    return () => { active = false; };
  }, [enabled, uid]);
  return pulse;
}
