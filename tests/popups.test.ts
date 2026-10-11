/**
 * Floating cards: never early, one at a time, one per visit.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  sessionStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  },
};

const { readyForPopup, MIN_VISIT_MS } = await import('../src/hooks/useCalmPopup.ts');
const { claimVisitPopup, claimPopup, releasePopup, popupShownThisVisit } = await import('../src/lib/popupSlot.ts');

const calm = { now: 100_000, visitStart: 100_000 - MIN_VISIT_MS, deepest: 2000, viewport: 800, menuOpen: false, typing: false };

describe('readyForPopup', () => {
  it('waits for the visit to run a while', () => {
    assert.equal(readyForPopup({ ...calm, visitStart: calm.now - 5_000 }), false);
    assert.equal(readyForPopup(calm), true);
  });
  it('waits for the reader to scroll the page', () => {
    assert.equal(readyForPopup({ ...calm, deepest: 400 }), false);
  });
  it('never covers the open menu or a search being typed', () => {
    assert.equal(readyForPopup({ ...calm, menuOpen: true }), false);
    assert.equal(readyForPopup({ ...calm, typing: true }), false);
  });
});

describe('popup slot', () => {
  it('lets a badge hold the slot against a card', () => {
    assert.equal(claimPopup('badge'), true);
    assert.equal(claimVisitPopup('promo'), false);
    assert.equal(popupShownThisVisit(), false);
    releasePopup('badge');
  });
  it('shows one uninvited card per visit', () => {
    assert.equal(claimVisitPopup('promo'), true);
    releasePopup('promo');
    assert.equal(popupShownThisVisit(), true);
    assert.equal(claimVisitPopup('rank'), false);
  });
});
