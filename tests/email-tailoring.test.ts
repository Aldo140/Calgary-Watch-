/**
 * Every reader gets their own email: the CW pick angles and the reader
 * segments the admin planner shows.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDigestSummary, type DigestRecipient } from '../src/lib/digest.ts';
import { digestAngles, weekDays, weekHash } from '../src/lib/digestInsights.ts';
import { segmentReaders, SEGMENTS } from '../src/lib/emailSegments.ts';
import type { Incident } from '../src/types/index.ts';

const NOW = Date.UTC(2026, 7, 17, 15, 0, 0);
const HOUR = 3_600_000;
const HOME = { lat: 51.0447, lng: -114.0719 };
const north = (m: number) => ({ lat: HOME.lat + m / 111_320, lng: HOME.lng });
const PROFILE: DigestRecipient = { uid: 'u', email: 'u@example.com', neighborhood: 'Beltline', weeklyDigestOptIn: true, weeklyDigestOptInAt: NOW - 30 * 24 * HOUR };

function inc(id: string, hoursAgo: number, metres: number, over: Partial<Incident> = {}): Incident {
  return {
    id, title: `Report ${id}`, description: '', category: 'crime', neighborhood: 'Beltline',
    ...north(metres), timestamp: NOW - hoursAgo * HOUR, name: 'A neighbour', verified_status: 'unverified',
    report_count: 1, visibility: 'public', data_source: 'community', ...over,
  } as Incident;
}

describe('CW pick angles', () => {
  it('leads with how close the nearest report was when it was very close', () => {
    const summary = buildDigestSummary({ incidents: [inc('a', 30, 150), inc('b', 60, 900)], profile: PROFILE, home: HOME, now: NOW });
    const [lead] = digestAngles(summary);
    assert.equal(lead.id, 'closest');
    assert.match(lead.headline, /^150 m from home$/);
  });

  it('says a quiet week is quiet, and compares it with last week', () => {
    const summary = buildDigestSummary({ incidents: [inc('old', 24 * 9, 300)], profile: PROFILE, home: HOME, now: NOW });
    const angles = digestAngles(summary);
    assert.equal(angles.length, 1);
    assert.equal(angles[0].id, 'quiet');
    assert.match(angles[0].body, /Last week one report/);
  });

  it('never claims a distance for a reader with only a community name', () => {
    const summary = buildDigestSummary({ incidents: [inc('a', 30, 150), inc('b', 50, 300), inc('c', 70, 500)], profile: PROFILE, home: null, now: NOW });
    assert.ok(digestAngles(summary, 10).every((a) => a.id !== 'closest'));
  });

  it('is deterministic for a week, so a re-send picks the same angle', () => {
    const summary = buildDigestSummary({ incidents: [inc('a', 3, 900), inc('b', 27, 1200), inc('c', 51, 1400), inc('d', 75, 1600)], profile: PROFILE, home: HOME, now: NOW });
    assert.deepEqual(digestAngles(summary).map((a) => a.id), digestAngles(summary).map((a) => a.id));
    assert.notEqual(weekHash('2026-W33:clock'), weekHash('2026-W34:clock'));
  });

  it('buckets the week by Calgary calendar day, so 01:00 Monday is Monday', () => {
    const summary = buildDigestSummary({ incidents: [inc('a', 8, 200)], profile: PROFILE, home: HOME, now: NOW });
    const days = weekDays(summary);
    const hit = days.find((d) => d.count === 1);
    assert.equal(hit?.label, 'Mon');
    assert.equal(days.reduce((n, d) => n + d.count, 0), summary.total);
  });

  it('keeps crime framed as awareness, not a contest', () => {
    const summary = buildDigestSummary({ incidents: Array.from({ length: 8 }, (_, i) => inc(`x${i}`, i * 13 + 2, 300 + i * 100)), profile: PROFILE, home: HOME, now: NOW });
    for (const a of digestAngles(summary, 10)) {
      assert.doesNotMatch(`${a.headline} ${a.body}`, /\b(hot|winner|rival|busiest neighbourhood|worst)\b/i);
    }
  });
});

describe('reader segments', () => {
  const T0 = NOW - 20 * 24 * HOUR;
  const monday = (uid: string, over: Partial<DigestRecipient> = {}): DigestRecipient => ({
    uid, email: `${uid}@example.com`, neighborhood: 'Beltline', weeklyDigestOptIn: true, weeklyDigestOptInAt: T0, digestWelcomeSentAt: T0, ...over,
  });
  const thursday = (uid: string, over: Record<string, unknown> = {}) => ({
    uid, email: `${uid}@example.com`, neighborhood: 'Beltline', eventsDigestOptIn: true, eventsDigestOptInAt: T0, eventInterests: ['music'], ...over,
  });

  it('puts everyone in exactly one segment, with the welcome winning', () => {
    const result = segmentReaders(
      [monday('home'), monday('city', { neighborhood: undefined }), monday('new', { digestWelcomeSentAt: null }), monday('both'), monday('newboth', { digestWelcomeSentAt: null })],
      [thursday('both'), thursday('newboth'), thursday('thu'), thursday('thu-noarea', { neighborhood: undefined })],
    );
    assert.deepEqual(result.counts, {
      welcome: 1, 'welcome-city': 0, 'welcome-both': 1, both: 1, 'monday-home': 1, 'monday-city': 1, thursday: 1, 'thursday-no-area': 1,
    });
    assert.equal(result.total, 7);
    // Everyone on both lists is visible as such: the new one in their welcome, the rest combined.
    assert.deepEqual(result.members['welcome-both'].map((p) => p.uid), ['newboth']);
    assert.deepEqual(result.members.both.map((p) => p.uid), ['both']);
  });

  it('counts unmailable opt-ins separately instead of hiding them', () => {
    const result = segmentReaders([monday('x', { weeklyDigestOptInAt: null })], [thursday('y', { email: 'nope' })]);
    assert.equal(result.total, 0);
    assert.equal(result.blocked, 2);
  });

  it('every segment points at an email the preview build renders', () => {
    for (const seg of SEGMENTS) assert.match(seg.file, /^[a-z-]+\.html$/);
  });
});
