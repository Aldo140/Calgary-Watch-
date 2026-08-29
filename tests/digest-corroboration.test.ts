/**
 * Resident corroboration feeds digest ranking (W2b).
 *
 * `report_count` already lifted a report's digest score, but residents had no
 * way to contribute that signal. Now the weekly digest reads incident_feedback
 * and a corroborated report ranks the way a duplicate-reported one always has —
 * the confirmation term takes whichever backing is stronger.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Incident } from '../src/types/index.ts';
import {
  digestHighlightScore,
  buildDigestSummary,
  type ScoredIncident,
  type DigestRecipient,
} from '../src/lib/digest.ts';

const NOW = 1_700_000_000_000;

function inc(over: Partial<Incident> & { id: string }): Incident {
  return {
    title: 'Break-in on the corner',
    description: 'A garage was broken into overnight.',
    category: 'crime',
    neighborhood: 'Beltline',
    lat: 51.0447,
    lng: -114.0719,
    timestamp: NOW - 2 * 24 * 60 * 60 * 1000,
    name: 'Ana',
    verified_status: 'unverified',
    report_count: 1,
    data_source: 'community',
    ...over,
  } as Incident;
}

describe('digestHighlightScore — corroboration', () => {
  it('lifts a report whose neighbours corroborated it', () => {
    const base: ScoredIncident = { incident: inc({ id: 'a' }), distanceM: null };
    const corroborated: ScoredIncident = { ...base, corroborations: 3 };
    assert.ok(
      digestHighlightScore(corroborated, NOW) > digestHighlightScore(base, NOW),
      'corroborated report should score higher',
    );
  });

  it('takes the stronger of report_count and corroborations', () => {
    // report_count 4 → backing 3; corroborations 1 → backing 3 still wins.
    const heavyReports: ScoredIncident = { incident: inc({ id: 'b', report_count: 4 }), distanceM: null, corroborations: 1 };
    const heavyCorr: ScoredIncident = { incident: inc({ id: 'c', report_count: 1 }), distanceM: null, corroborations: 3 };
    assert.equal(digestHighlightScore(heavyReports, NOW), digestHighlightScore(heavyCorr, NOW));
  });
});

describe('buildDigestSummary — corroboration threading', () => {
  const recipient: DigestRecipient = {
    uid: 'u1',
    email: 'r@example.ca',
    neighborhood: 'Beltline',
    weeklyDigestOptIn: true,
  } as DigestRecipient;

  it('ranks a corroborated report above an identical uncorroborated one', () => {
    const incidents = [
      inc({ id: 'plain', title: 'Report A', neighborhood: 'Beltline' }),
      inc({ id: 'backed', title: 'Report B', neighborhood: 'Beltline' }),
    ];
    const summary = buildDigestSummary({
      incidents,
      profile: recipient,
      now: NOW,
      corroborations: new Map([['backed', 5]]),
    });
    // Both are eligible; the corroborated one should lead the highlights.
    assert.ok(summary.highlights.length >= 1);
    assert.equal(summary.highlights[0].incident.id, 'backed');
  });
});
