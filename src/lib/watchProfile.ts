/**
 * Watch-state persistence.
 *
 * "My Watch" needs to remember three things between visits: when the reader
 * last checked (so the feed can say what changed *since*), how far from home
 * they care about, and which categories they want. For a signed-in reader
 * those live on the Firestore `users` profile and follow them across devices;
 * for a signed-out reader they live in localStorage. The profile wins field by
 * field, falling back to local only where the profile says nothing — so a mark
 * set on a phone is not clobbered by a stale mark cached in a laptop's browser.
 *
 * These helpers are pure and storage is injected, so both rules are unit-tested
 * without a browser or Firestore.
 */

import type { IncidentCategory } from '@/src/types';

export interface WatchState {
  /** Epoch ms the reader last opened the panel, or null on a first visit. */
  lastSeenAt: number | null;
  /** Metres from home the reader cares about, or null for no radius filter. */
  radiusM: number | null;
  /** Categories the reader wants; empty means all. */
  categories: IncidentCategory[];
}

export const WATCH_LOCAL_KEYS = {
  lastSeen: 'cw_watch_lastSeen',
  radius: 'cw_watch_radius',
  categories: 'cw_watch_categories',
} as const;

/** A number from storage, or null when absent or unparseable. */
function readNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** A category array from stored JSON, or [] when absent or corrupt. */
function readCategories(raw: string | null): IncidentCategory[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as IncidentCategory[]) : [];
  } catch {
    return [];
  }
}

export function readLocalWatch(storage: Pick<Storage, 'getItem'>): WatchState {
  return {
    lastSeenAt: readNumber(storage.getItem(WATCH_LOCAL_KEYS.lastSeen)),
    radiusM: readNumber(storage.getItem(WATCH_LOCAL_KEYS.radius)),
    categories: readCategories(storage.getItem(WATCH_LOCAL_KEYS.categories)),
  };
}

export function writeLocalWatch(storage: Pick<Storage, 'setItem'>, state: WatchState): void {
  storage.setItem(WATCH_LOCAL_KEYS.lastSeen, state.lastSeenAt === null ? '' : String(state.lastSeenAt));
  storage.setItem(WATCH_LOCAL_KEYS.radius, state.radiusM === null ? '' : String(state.radiusM));
  storage.setItem(WATCH_LOCAL_KEYS.categories, JSON.stringify(state.categories));
}

/**
 * Merge the signed-in profile over the local fallback, field by field. A field
 * the profile leaves undefined defers to local; a field the profile sets —
 * including an explicit null — wins.
 */
export function mergeWatchState(
  profile: Partial<WatchState> | null,
  local: WatchState,
): WatchState {
  if (!profile) return local;
  return {
    lastSeenAt: profile.lastSeenAt !== undefined ? profile.lastSeenAt : local.lastSeenAt,
    radiusM: profile.radiusM !== undefined ? profile.radiusM : local.radiusM,
    categories: profile.categories !== undefined ? profile.categories : local.categories,
  };
}
