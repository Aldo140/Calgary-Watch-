/**
 * Watch-state persistence.
 *
 * A reader's "last checked" mark, radius and categories live on the Firestore
 * profile when they are signed in — so the mark follows them across devices —
 * and in localStorage when they are not. The profile is the source of truth;
 * local is the fallback. These helpers are pure so both rules are testable
 * without a browser or Firestore.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  readLocalWatch,
  writeLocalWatch,
  mergeWatchState,
} from '../src/lib/watchProfile.ts';

function fakeStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe('watchProfile — local persistence', () => {
  it('round-trips local watch state', () => {
    const s = fakeStorage();
    writeLocalWatch(s, { lastSeenAt: 123, radiusM: 2000, categories: ['crime'] });
    assert.deepEqual(readLocalWatch(s), { lastSeenAt: 123, radiusM: 2000, categories: ['crime'] });
  });

  it('defaults cleanly when storage is empty', () => {
    assert.deepEqual(readLocalWatch(fakeStorage()), {
      lastSeenAt: null,
      radiusM: null,
      categories: [],
    });
  });

  it('ignores corrupt values rather than throwing', () => {
    const s = fakeStorage({ cw_watch_lastSeen: 'not-a-number', cw_watch_categories: '{bad json' });
    assert.deepEqual(readLocalWatch(s), { lastSeenAt: null, radiusM: null, categories: [] });
  });
});

describe('watchProfile — merge', () => {
  it('prefers the profile lastSeenAt when present', () => {
    const merged = mergeWatchState(
      { lastSeenAt: 999, radiusM: null, categories: [] },
      { lastSeenAt: 5, radiusM: 2000, categories: ['crime'] },
    );
    assert.equal(merged.lastSeenAt, 999);
  });

  it('falls back to local when the profile has no lastSeenAt', () => {
    const merged = mergeWatchState(null, {
      lastSeenAt: 5,
      radiusM: 2000,
      categories: ['crime'],
    });
    assert.deepEqual(merged, { lastSeenAt: 5, radiusM: 2000, categories: ['crime'] });
  });

  it('takes each defined profile field over local, field by field', () => {
    const merged = mergeWatchState(
      { lastSeenAt: 999, radiusM: 3000, categories: undefined },
      { lastSeenAt: 5, radiusM: 2000, categories: ['crime'] },
    );
    assert.deepEqual(merged, { lastSeenAt: 999, radiusM: 3000, categories: ['crime'] });
  });
});
