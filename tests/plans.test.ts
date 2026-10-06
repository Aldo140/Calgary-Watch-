/**
 * Plans: event interests, picks, badges, the Thursday email and its rules.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import type { Event, Market, MarketOccurrence } from '../src/types/discovery.ts';
import { buildEventPicks, interestsFor, neighbourhoodPoint, normalizeInterests, pickWhen } from '../src/lib/eventPicks.ts';
import { computeBadges, FOUNDING_CUTOFF, orderBadges } from '../src/lib/badges.ts';
import { eventsConsentRefusal, eventsSubject, eventsUnsubscribeUrl } from '../src/lib/eventsDigest.ts';
import { readPlansProfile } from '../src/lib/plansProfile.ts';
import { renderEventsHtml, renderEventsText } from '../scripts/digest/render.ts';

const NOW = new Date('2026-10-08T15:00:00Z'); // Thursday 9:00 MDT

function event(over: Partial<Event> & Pick<Event, 'id' | 'title' | 'start'>): Event {
  return {
    kind: 'event', slug: over.id, summary: '', description: '', categories: [], tags: [],
    sources: [{ name: 'Organizer', url: 'https://example.org', kind: 'official' }],
    status: 'published', verification: 'source-feed', updatedAt: '2026-10-01',
    end: new Date(Date.parse(over.start) + 2 * 3600_000).toISOString(),
    timezone: 'America/Edmonton', pricing: 'paid', organizer: 'Org', address: 'Calgary',
    ...over,
  } as Event;
}

const symphony = event({ id: 'sym', title: 'Calgary Phil plays Mahler', start: '2026-10-10T02:00:00Z', neighbourhood: 'Downtown' });
const kids = event({ id: 'kids', title: 'Storytime at the library', start: '2026-10-11T17:00:00Z', categories: ['family'], pricing: 'free', neighbourhood: 'Bowness' });
const flames = event({ id: 'flames', title: 'Flames vs. Oilers', start: '2026-10-12T01:00:00Z', categories: ['sports'], neighbourhood: 'Beltline' });
const later = event({ id: 'later', title: 'Jazz night', start: '2026-11-20T03:00:00Z' });
const past = event({ id: 'past', title: 'Old concert', start: '2026-10-01T03:00:00Z' });
const cancelled = event({ id: 'cxl', title: 'Cancelled concert', start: '2026-10-10T03:00:00Z', cancelled: true });
const market = {
  kind: 'market', id: 'mkt', slug: 'mkt', title: 'Bridgeland Farmers’ Market', summary: '', description: '', categories: ['market', 'food'], tags: [],
  sources: [{ name: 'Market', url: 'https://example.org', kind: 'official' }], status: 'published', verification: 'source-feed', updatedAt: '2026-10-01',
  address: 'Calgary', neighbourhood: 'Bridgeland', amenities: [], organizer: 'Org', vendorIds: [], images: [],
} as unknown as Market;
const occurrences: MarketOccurrence[] = [
  { id: 'mkt-1', marketId: 'mkt', start: '2026-10-09T22:00:00Z', end: '2026-10-10T02:00:00Z', timezone: 'America/Edmonton', cancelled: false, source: market.sources[0] },
  { id: 'mkt-2', marketId: 'mkt', start: '2026-10-16T22:00:00Z', end: '2026-10-17T02:00:00Z', timezone: 'America/Edmonton', cancelled: false, source: market.sources[0] },
];
const entities = [symphony, kids, flames, later, past, cancelled, market];

describe('interestsFor', () => {
  it('reads categories, tags and plain words', () => {
    assert.deepEqual(interestsFor(symphony), ['music']);
    assert.deepEqual(interestsFor(kids), ['family', 'free']);
    assert.deepEqual(interestsFor(flames), ['sports']);
    assert.deepEqual(interestsFor(market), ['food', 'markets']);
  });
  it('normalizes stored interests to known ids in canonical order', () => {
    assert.deepEqual(normalizeInterests(['free', 'nope', 'music', 'music', 3]), ['music', 'free']);
    assert.deepEqual(normalizeInterests('music'), []);
  });
});

describe('buildEventPicks', () => {
  it('keeps only upcoming, uncancelled items inside the window', () => {
    const picks = buildEventPicks({ entities, occurrences, interests: [], now: NOW, days: 7 });
    const keys = picks.picks.map((p) => p.key);
    assert.ok(!keys.includes('past') && !keys.includes('cxl') && !keys.includes('later'));
    assert.ok(keys.includes('mkt-1'), 'a market appears once, at its next date');
    assert.ok(!keys.includes('mkt-2'));
    assert.equal(picks.considered, 4);
  });
  it('with interests, only matching items are picked', () => {
    const picks = buildEventPicks({ entities, occurrences, interests: ['music'], now: NOW });
    assert.deepEqual(picks.picks.map((p) => p.entityId), ['sym']);
  });
  it('separates what the reader is going to', () => {
    const picks = buildEventPicks({ entities, occurrences, interests: ['music', 'sports'], goingIds: new Set(['flames']), now: NOW });
    assert.deepEqual(picks.going.map((p) => p.entityId), ['flames']);
    assert.ok(!picks.picks.some((p) => p.entityId === 'flames'));
  });
  it('gives nearby items a head start and lists by date', () => {
    const picks = buildEventPicks({ entities, occurrences, interests: ['family', 'food'], homeArea: 'Bridgeland', now: NOW, limit: 1 });
    assert.equal(picks.picks[0].entityId, 'mkt', 'same-area market beats a Bowness storytime');
    const all = buildEventPicks({ entities, occurrences, interests: [], now: NOW });
    const starts = all.picks.map((p) => Date.parse(p.start));
    assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  });
  it('measures distance from a known neighbourhood', () => {
    assert.ok(neighbourhoodPoint('Beltline, Calgary'));
    assert.equal(neighbourhoodPoint('Nowhere'), null);
    const picks = buildEventPicks({ entities, occurrences, interests: ['sports'], homeArea: 'Beltline', now: NOW });
    assert.ok(picks.picks[0].distanceM !== null && picks.picks[0].distanceM < 1000);
  });
  it('shows a nightly run of one title once, at its soonest date', () => {
    const nights = [0, 1, 2].map((d) => event({ id: `ghost-${d}`, title: 'Fall Ghost Tours', start: new Date(Date.parse('2026-10-09T01:00:00Z') + d * 86400000).toISOString() }));
    const picks = buildEventPicks({ entities: nights, occurrences: [], interests: [], now: NOW });
    assert.deepEqual(picks.picks.map((p) => p.entityId), ['ghost-0']);
  });
  it('formats times in Calgary', () => {
    assert.equal(pickWhen('2026-10-10T02:00:00Z'), 'Fri, Oct 9 · 8:00 p.m.');
  });
});

describe('badges', () => {
  const base = { hasHomeArea: false, interestCount: 0, eventsDigestOptIn: false, weeklyDigestOptIn: false, goingCount: 0, goingInterestCount: 0 };
  it('starts with nothing earned', () => {
    assert.equal(computeBadges(base).filter((b) => b.unlocked).length, 0);
  });
  it('earns and orders badges', () => {
    const badges = computeBadges({ ...base, createdAt: FOUNDING_CUTOFF - 1, hasHomeArea: true, interestCount: 4, goingCount: 5, goingInterestCount: 2, reportCount: 1 });
    const on = new Set(badges.filter((b) => b.unlocked).map((b) => b.id));
    for (const id of ['founding', 'neighbour', 'tuned-in', 'first-plans', 'regular', 'eyes-on-the-street']) assert.ok(on.has(id as never), id);
    assert.ok(!on.has('all-rounder'));
    assert.equal(badges.find((b) => b.id === 'all-rounder')!.progress, 2);
    const ordered = orderBadges(badges);
    assert.ok(ordered.findIndex((b) => !b.unlocked) > ordered.map((b) => b.unlocked).lastIndexOf(true));
  });
  it('is not founding after the first year', () => {
    assert.equal(computeBadges({ ...base, createdAt: FOUNDING_CUTOFF + 1 }).find((b) => b.id === 'founding')!.unlocked, false);
  });
});

describe('Thursday email consent', () => {
  const ok = { uid: 'u1', email: 'a@b.ca', eventsDigestOptIn: true, eventsDigestOptInAt: 1, eventInterests: [] };
  it('requires an explicit opt-in, a date and an address', () => {
    assert.equal(eventsConsentRefusal(ok), null);
    assert.equal(eventsConsentRefusal({ ...ok, eventsDigestOptIn: false }), 'not-opted-in');
    assert.equal(eventsConsentRefusal({ ...ok, eventsDigestOptInAt: null }), 'no-consent-timestamp');
    assert.equal(eventsConsentRefusal({ ...ok, email: 'nope' }), 'invalid-email');
  });
  it('is not the Monday list', () => {
    assert.equal(readPlansProfile({ weeklyDigestOptIn: true }).eventsDigestOptIn, false);
  });
  it('unsubscribe links name the events list', () => {
    assert.match(eventsUnsubscribeUrl('https://calgarywatch.ca', 'u1', 'a'.repeat(32)), /list=events/);
  });
});

describe('Thursday email render', () => {
  const branding = { mailingAddress: '123 Main St, Calgary AB', senderName: 'CalgaryWatch', supportEmail: 'hi@calgarywatch.ca', origin: 'https://calgarywatch.ca' };
  const picks = buildEventPicks({ entities, occurrences, interests: ['music', 'sports'], goingIds: new Set(['flames']), homeArea: 'Beltline', now: NOW });
  const opts = { picks, interests: ['music', 'sports'] as const, area: 'Beltline', displayName: 'Sam Lee', unsubscribeUrl: 'https://calgarywatch.ca/unsubscribe?list=events', branding, at: NOW.getTime() };
  it('renders both parts with the CASL footer and real links', () => {
    const html = renderEventsHtml({ ...opts, interests: [...opts.interests] });
    const text = renderEventsText({ ...opts, interests: [...opts.interests] });
    for (const body of [html, text]) {
      assert.match(body, /123 Main St/);
      assert.match(body, /list=events/);
      assert.match(body, /Flames vs\. Oilers/);
      assert.match(body, /\/plans/);
    }
    assert.match(html, /You’re going/);
    assert.match(html, /separate list/);
    assert.match(eventsSubject(picks, ['music']), /^You’re going to Flames/);
  });
  it('escapes listing titles', () => {
    const evil = event({ id: 'x', title: '<script>alert(1)</script> concert', start: '2026-10-10T02:00:00Z' });
    const p2 = buildEventPicks({ entities: [evil], occurrences: [], interests: [], now: NOW });
    assert.doesNotMatch(renderEventsHtml({ ...opts, picks: p2, interests: [] }), /<script>/);
  });
});

describe('rules contract', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../src/lib/plans.ts', import.meta.url), 'utf8');
  it('RSVPs and counts move together and only by one', () => {
    const rsvp = rules.slice(rules.indexOf('match /event_rsvps/'), rules.indexOf('match /event_rsvp_counts/'));
    assert.match(rsvp, /hasOnlyAllowedFields\(\['uid', 'eventId', 'start', 'createdAt'\]\)/);
    assert.match(rsvp, /getAfter\(rsvpCountPath/);
    assert.match(rsvp, /allow update: if false/);
    const counts = rules.slice(rules.indexOf('match /event_rsvp_counts/'));
    assert.match(counts, /allow read: if true/);
    assert.match(counts, /resource\.data\.count \+ 1/);
    assert.match(counts, /resource\.data\.count - 1/);
    assert.match(counts, /allow delete: if false/);
    // Client writes exactly the fields the rule allows.
    assert.match(client, /\{ uid, eventId, start: start\.slice\(0, 40\), createdAt: Date\.now\(\) \}/);
    assert.match(client, /\{ count: increment\(on \? 1 : -1\), updatedAt: Date\.now\(\) \}/);
  });
  it('events unsubscribes are token-gated like the Monday list', () => {
    const block = rules.slice(rules.indexOf('match /events_digest_unsubscribes/'));
    assert.match(block, /digestUnsubToken/);
    assert.match(block, /processedAt == null/);
    assert.match(block, /allow delete: if false/);
    const page = readFileSync(new URL('../src/pages/UnsubscribePage.tsx', import.meta.url), 'utf8');
    assert.match(page, /events_digest_unsubscribes/);
  });
});
