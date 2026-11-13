import { trackSubscription } from './readEfficiency';
import { collection, documentId, getDocs, limit, onSnapshot, orderBy, query, startAfter, type Firestore } from 'firebase/firestore';
import { adminIncidentTimestamp } from './adminIncidentPolicy';
import type { Incident } from '../types';

type Listener<T> = (state: { rows: T[]; loading: boolean; error: string; loadedAt: number | null; hasMore: boolean }) => void;

const LIVE_WINDOW = 150;
const ARCHIVE_PAGE_SIZE = 150;

function createStore<T extends { id: string }>(load: (db: Firestore, after: string | undefined) => Promise<{ rows: T[]; hasMore: boolean }>, live?: (db: Firestore, merge: (rows: T[]) => void) => () => void) {
  let rows: T[] = [];
  let cursor: string | undefined;
  let hasMore = false;
  let liveRows: T[] = [];
  let loading = false;
  let error = '';
  let loadedAt: number | null = null;
  let pending: Promise<void> | undefined;
  let unlive: (() => void) | null = null;
  const listeners = new Set<Listener<T>>();
  const current = () => {
    const merged = new Map(rows.map(row => [row.id, row]));
    liveRows.forEach(row => merged.set(row.id, row));
    return { rows: [...merged.values()], loading, error, loadedAt, hasMore };
  };
  const emit = () => {
    const state = current();
    listeners.forEach(listener => listener(state));
  };

  function refresh(db: Firestore, append = false): Promise<void> {
    if (pending) return pending;
    pending = loadOnce(db, append).finally(() => { pending = undefined; });
    return pending;
  }
  async function loadOnce(db: Firestore, append: boolean) {
    loading = true; emit();
    try {
      const page = await load(db, append ? cursor : undefined);
      rows = append ? [...rows, ...page.rows] : page.rows;
      cursor = page.rows.at(-1)?.id;
      hasMore = page.hasMore;
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
      listener(current());
      if (loadedAt === null && !loading) void refresh(db);
      if (live && !unlive) {
        unlive = trackSubscription('admin:archive_live', () => live(db, (fresh) => {
          liveRows = fresh;
          emit();
        }));
      }
      return () => {
        listeners.delete(listener);
        // Keep the archive in memory for the next admin page; stop the live window only when nobody is looking.
        if (!listeners.size && unlive) { unlive(); unlive = null; }
      };
    },
    refresh,
    loadMore(db: Firestore) { return hasMore ? refresh(db, true) : Promise.resolve(); },
    /** Apply a local edit without a re-read (moderation actions). */
    patch(id: string, change: Partial<T> | null) {
      const patchRows = (items: T[]) => change === null ? items.filter(r => r.id !== id) : items.map(r => r.id === id ? { ...r, ...change } : r);
      rows = patchRows(rows);
      liveRows = patchRows(liveRows);
      emit();
    },
  };
}

const toIncident = (row: { id: string; data: () => Record<string, unknown> }) => {
  const data = row.data();
  return { ...data, id: row.id, timestamp: adminIncidentTimestamp(data) } as Incident;
};

// Document ID ordering includes older rows with no timestamp or account metadata.
async function archivePage<T>(db: Firestore, name: string, after: string | undefined, mapRow: (doc: import("firebase/firestore").QueryDocumentSnapshot) => T) {
  const source = collection(db, name);
  const page = await getDocs(after
    ? query(source, orderBy(documentId()), startAfter(after), limit(ARCHIVE_PAGE_SIZE + 1))
    : query(source, orderBy(documentId()), limit(ARCHIVE_PAGE_SIZE + 1)));
  return { rows: page.docs.slice(0, ARCHIVE_PAGE_SIZE).map(mapRow), hasMore: page.size > ARCHIVE_PAGE_SIZE };
}

export const adminIncidents = createStore<Incident>(
  (db, after) => archivePage(db, 'incidents', after, toIncident),
  (db, merge) => onSnapshot(
    query(collection(db, 'incidents'), orderBy('timestamp', 'desc'), limit(LIVE_WINDOW)),
    (snap) => merge(snap.docs.map(toIncident)),
    () => {},
  ),
);

export type FeedbackRow = { id: string; incidentId?: string; uid?: string; kind?: string; createdAt?: number; updatedAt?: number };
export const adminFeedback = createStore<FeedbackRow>(
  (db, after) => archivePage(db, 'incident_feedback', after, d => ({ ...d.data(), id: d.id })),
);

/** Account history, paged by document ID to include legacy profiles. */
export const adminUsers = createStore<{ id: string; uid: string } & Record<string, unknown>>(
  (db, after) => archivePage(db, 'users', after, d => ({ ...d.data(), id: d.id, uid: d.id })),
);
