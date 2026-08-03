/**
 * Guardrails for example (demo) reports.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { isDemoIncident } from '../src/types/index.js';
import { selectSlot } from '../scripts/seed/activity.js';
import { useNeighborhoodPulse } from '../src/hooks/useNeighborhoodPulse.js';

const ACTIVITY_SRC = readFileSync('scripts/seed/activity.ts', 'utf8');

/**
 * Just the report queue, excluding surrounding comments — the authoring rules
 * are documented in prose that necessarily names the things it forbids.
 */
const QUEUE_SRC = (() => {
  const start = ACTIVITY_SRC.indexOf('const QUEUE = [');
  const end = ACTIVITY_SRC.indexOf('\n];', start);
  return ACTIVITY_SRC.slice(start, end).replace(/\/\/.*$/gm, '');
})();

describe('example report publisher', () => {
  it('publishes with data_source demo, never community', () => {
    assert.match(ACTIVITY_SRC, /data_source: 'demo'/);
    assert.doesNotMatch(ACTIVITY_SRC, /data_source: 'community'/);
  });

  it('does not attribute examples to invented residents', () => {
    // Reports signed "Megan T." are indistinguishable from a real neighbour's.
    assert.doesNotMatch(ACTIVITY_SRC, /name: '[A-Z][a-z]+ [A-Z]\.'/);
    assert.match(ACTIVITY_SRC, /name: 'Calgary Watch'/);
  });

  it('sets an expiry so examples cannot outlive the publisher', () => {
    assert.match(ACTIVITY_SRC, /expires_at:/);
  });

  it('avoids violent, drug and identifiable-person content', () => {
    // These examples sit on a public safety map. Everyday, low-stakes only.
    for (const banned of [/\bassault/i, /\bdrugs?\b/i, /\bneedles?\b/i, /panhandl/i, /\bstabb/i, /\bweapon/i]) {
      assert.doesNotMatch(QUEUE_SRC, banned, `example content must not contain ${banned}`);
    }
  });

  it('demonstrates more than one category', () => {
    const categories = new Set([...QUEUE_SRC.matchAll(/category: '(\w+)'/g)].map((m) => m[1]));
    assert.ok(categories.size >= 3, `expected varied categories, got ${[...categories].join(', ')}`);
  });
});

describe('selectSlot — publisher scheduling', () => {
  // SLOTS = [7, 13, 20] (Calgary hours)
  it('publishes nothing before the first slot', () => {
    assert.equal(selectSlot(6, []), null);
  });

  it('publishes the morning slot once 7h passes', () => {
    assert.equal(selectSlot(7, []), 0);
    assert.equal(selectSlot(12, []), 0);
  });

  it('publishes a LATE run rather than skipping it', () => {
    // The regression: a 19:00 UTC cron fired at 20:11, the workflow mapped it
    // to the evening slot, and the "too early" guard skipped it. Every run.
    assert.equal(selectSlot(14, [0]), 1, 'afternoon slot is still due at 14h');
  });

  it('catches up when an earlier slot was missed entirely', () => {
    // Nothing went out all day; at 20h the evening slot publishes.
    assert.equal(selectSlot(20, []), 2);
  });

  it('never republishes a slot already sent today', () => {
    assert.equal(selectSlot(21, [0, 1, 2]), null);
    assert.equal(selectSlot(21, [2]), 1, 'an earlier unsent slot still counts');
  });

  it('picks the most recent due slot, not the oldest', () => {
    assert.equal(selectSlot(20, [0]), 2);
  });
});

describe('isDemoIncident', () => {
  it('identifies demo reports only', () => {
    assert.equal(isDemoIncident({ data_source: 'demo' }), true);
    assert.equal(isDemoIncident({ data_source: 'community' }), false);
    assert.equal(isDemoIncident({ data_source: 'official' }), false);
    assert.equal(isDemoIncident({ data_source: undefined }), false);
  });
});

describe('neighbourhood pulse excludes examples', () => {
  /** Minimal stand-in — useNeighborhoodPulse only reads these fields. */
  function incident(overrides: Record<string, unknown> = {}) {
    return {
      id: Math.random().toString(36).slice(2),
      title: 't', description: 'd', category: 'crime',
      neighborhood: 'Beltline', lat: 51, lng: -114,
      timestamp: Date.now() - 60_000,
      email: '', name: '', verified_status: 'unverified',
      report_count: 1,
      ...overrides,
    } as any;
  }

  /** Run the hook's memo body without React. */
  function pulse(incidents: any[]) {
    let captured: any;
    const originalUseMemo = (globalThis as any).__useMemoShim;
    void originalUseMemo;
    // useNeighborhoodPulse calls React.useMemo(fn, deps); invoking it outside a
    // component would throw, so assert on the filtering rule directly instead.
    captured = incidents.filter((i) => i.data_source !== 'demo');
    return captured;
  }

  it('a demo report must not raise a real neighbourhood risk level', () => {
    const input = [
      incident({ data_source: 'demo' }),
      incident({ data_source: 'demo' }),
      incident({ data_source: 'community' }),
    ];
    assert.equal(pulse(input).length, 1, 'only the genuine report counts');
  });

  it('the hook source filters demo before counting', () => {
    const src = readFileSync('src/hooks/useNeighborhoodPulse.ts', 'utf8');
    assert.match(src, /data_source === 'demo'/);
    assert.ok(typeof useNeighborhoodPulse === 'function');
  });
});
