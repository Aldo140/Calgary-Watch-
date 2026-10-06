/**
 * Shared, read-once data for the admin console.
 *
 * Admin used to open a live listener on the whole `incidents` collection on
 * /admin and again on /admin/incidents, and a second one on the whole
 * `incident_feedback` collection. Every visit, and every hop between those
 * pages, re-read every document: on Firestore's free plan that alone could
 * spend a large part of the daily read quota.
 *
 * Now the full archive is read once per browser tab (kept in memory across
 * admin pages), and a small live window of the newest 150 reports keeps the
 * desk current. "Refresh" re-reads on demand. All-time history still includes
 * legacy rows without a timestamp, because the archive read is unfiltered.
 */

import { collection, getDocs, limit, onSnapshot, orderBy, query, type Firestore } from 'firebase/firestore';
import { adminIncidentTimestamp } from './adminIncidentPolicy';
import type { Incident } from '../types';

type Listener<T> = (state: { rows: T[]; loading: boolean; error: string; loadedAt: number | null }) => void;

const LIVE_WINDOW = 150;

function createStore<T extends { id: string }>(load: (db: Firestore) => Promise<T[]>, live?: (db: Firestore, merge: (rows: T[]) => void) => () => void) {
  let rows: T[] = [];
  let loading = false;
  let error = '';
  let loadedAt: number | null = null;
  let unlive: (() => void) | null = null;
  const listeners = new Set<Listener<T>>();
  const emit = () => listeners.forEach((l) => l({ rows, loading, error, loadedAt }));

  async function refresh(db: Firestore) {
    loading = true; emit();
    try {
      rows = await load(db);
      error = ''; loadedAt = Date.now();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not load';
    } finally {
      loading = false; emit();
    }
  }

  return {
    subscribe(db: Firestore, listener: Listener<T>) {
      listeners.add(listener);
      listener({ rows, loading, error, loadedAt });
      if (loadedAt === null && !loading) void refresh(db);
      if (live && !unlive) {
        unlive = live(db, (fresh) => {
          const byId = new Map(rows.map((r) => [r.id, r]));
          for (const r of fresh) byId.set(r.id, r);
          rows = [...byId.values()];
          emit();
        });
      }
      return () => {
        listeners.delete(listener);
        // Keep the archive in memory for the next admin page; stop the live window only when nobody is looking.
        if (!listeners.size && unlive) { unlive(); unlive = null; }
      };
    },
    refresh,
    /** Apply a local edit without a re-read (moderation actions). */
    patch(id: string, change: Partial<T> | null) {
      rows = change === null ? rows.filter((r) => r.id !== id) : rows.map((r) => (r.id === id ? { ...r, ...change } : r));
      emit();
    },
  };
}

const toIncident = (row: { id: string; data: () => Record<string, unknown> }) => {
  const data = row.data();
  return { id: row.id, ...data, timestamp: adminIncidentTimestamp(data) } as Incident;
};

export const adminIncidents = createStore<Incident>(
  async (db) => (await getDocs(collection(db, 'incidents'))).docs.map(toIncident),
  (db, merge) => onSnapshot(
    query(collection(db, 'incidents'), orderBy('timestamp', 'desc'), limit(LIVE_WINDOW)),
    (snap) => merge(snap.docChanges().filter((c) => c.type !== 'removed').map((c) => toIncident(c.doc))),
    () => {},
  ),
);

export type FeedbackRow = { id: string; incidentId?: string; uid?: string; kind?: string; createdAt?: number; updatedAt?: number };
export const adminFeedback = createStore<FeedbackRow>(
  async (db) => (await getDocs(collection(db, 'incident_feedback'))).docs.map((d) => ({ id: d.id, ...d.data() })),
);

/** Every account, for the People directory's search. Read once per tab. */
export const adminUsers = createStore<{ id: string; uid: string } & Record<string, unknown>>(
  async (db) => (await getDocs(collection(db, 'users'))).docs.map((d) => ({ ...d.data(), id: d.id, uid: d.id })),
);
