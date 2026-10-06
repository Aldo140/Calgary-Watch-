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
import { eventsConsentRefusal, eventsEmailMode, eventsSubject, eventsUnsubscribeUrl } from '../src/lib/eventsDigest.ts';
import { emailConsentPatch, readPlansProfile } from '../src/lib/plansProfile.ts';
import { renderDigestText, renderEventsHtml, renderEventsText } from '../scripts/digest/render.ts';
import { buildDigestSummary } from '../src/lib/digest.ts';
import { googleCalendarUrl, icsFile } from '../src/lib/calendarFile.ts';
import { filterInventory, matchesText } from '../src/lib/discoveryCalendar.ts';
import { demandQuery, summarizeDemand } from '../src/lib/searchDemand.ts';

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

describe('one form, two email lists', () => {
  it('keeps the first consent date while a list stays on', () => {
    const p = emailConsentPatch({ weeklyDigestOptIn: true, weeklyDigestOptInAt: 100, eventsDigestOptIn: false, eventsDigestOptInAt: null }, { weekly: true, events: true }, 500);
    assert.equal(p.weeklyDigestOptInAt, 100);
    assert.equal(p.eventsDigestOptInAt, 500);
    assert.equal(p.eventsDigestUnsubscribedAt, null);
  });
  it('records an opt-out with its source, per list, and leaves the other alone', () => {
    const p = emailConsentPatch({ weeklyDigestOptIn: true, weeklyDigestOptInAt: 100, eventsDigestOptIn: true, eventsDigestOptInAt: 200 }, { weekly: false, events: true }, 500);
    assert.equal(p.weeklyDigestOptIn, false);
    assert.equal(p.weeklyDigestOptInAt, null);
    assert.equal(p.digestUnsubscribedAt, 500);
    assert.equal(p.digestUnsubscribeSource, 'plans-page');
    assert.equal(p.eventsDigestOptInAt, 200);
  });
  it('does not invent an opt-out for a list that was never on', () => {
    const p = emailConsentPatch(null, { weekly: false, events: false }, 500);
    assert.ok(!('digestUnsubscribedAt' in p) && !('eventsDigestUnsubscribedAt' in p));
  });
});

describe('finding and adding events', () => {
  it('builds a valid, escaped calendar file and Google link', () => {
    const f = icsFile({ id: 'x', title: 'Jazz, live; late', start: '2026-10-10T02:00:00Z', end: '2026-10-10T04:00:00Z', location: 'Studio Bell', url: 'https://calgarywatch.ca/events/x' }, new Date('2026-10-01T00:00:00Z'));
    assert.match(f, /DTSTART:20261010T020000Z/);
    assert.match(f, /SUMMARY:Jazz\\, live\; late/);
    assert.match(f, /\r\nEND:VCALENDAR\r\n$/);
    assert.match(googleCalendarUrl({ id: 'x', title: 'Jazz', start: '2026-10-10T02:00:00Z', end: '2026-10-10T04:00:00Z', url: 'u' }), /dates=20261010T020000Z%2F20261010T040000Z/);
  });
  it('the Music chip finds the symphony even without a music tag', () => {
    assert.deepEqual(filterInventory([symphony, kids], [], undefined, 'music', NOW).map((e) => e.id), ['sym']);
    assert.deepEqual(filterInventory([symphony, kids], [], undefined, 'family', NOW).map((e) => e.id), ['kids']);
  });
  it('search within a listing matches every word', () => {
    assert.ok(matchesText(symphony, 'mahler phil'));
    assert.ok(!matchesText(symphony, 'mahler jazz'));
  });
  it('search demand never stores contact-like text, and groups terms', () => {
    assert.equal(demandQuery('  Jazz   Night '), 'jazz night');
    assert.equal(demandQuery('me@x.ca'), null);
    assert.equal(demandQuery('call 4035551234'), null);
    assert.deepEqual(summarizeDemand([{ q: 'jazz', results: 0, ts: 1 }, { q: 'jazz', results: 2, ts: 2 }, { q: 'yoga', results: 0, ts: 3 }]).map((r) => [r.q, r.searches, r.lastResults]), [['jazz', 2, 2], ['yoga', 1, 0]]);
  });
  it('sharing a listing earns Event scout', () => {
    const base = { hasHomeArea: false, interestCount: 0, eventsDigestOptIn: false, weeklyDigestOptIn: false, goingCount: 0, goingInterestCount: 0 };
    assert.equal(computeBadges({ ...base, submissionCount: 1 }).find((b) => b.id === 'scout')!.unlocked, true);
  });
});

describe('every Thursday case', () => {
  const branding = { mailingAddress: '123 Main St, Calgary AB', senderName: 'CalgaryWatch', supportEmail: 'hi@calgarywatch.ca', origin: 'https://calgarywatch.ca' };
  const base = { interests: ['outdoors'] as ('outdoors')[], area: 'Beltline', unsubscribeUrl: 'u', branding, at: NOW.getTime() };
  const none = { going: [], picks: [], considered: 0 };
  it('picks, fallback, going-only, skip', () => {
    const matched = buildEventPicks({ entities, occurrences, interests: ['music'], now: NOW });
    const unmatched = buildEventPicks({ entities, occurrences, interests: ['outdoors'], now: NOW });
    const everything = buildEventPicks({ entities, occurrences, interests: [], now: NOW });
    assert.equal(eventsEmailMode(matched, null), 'picks');
    assert.equal(eventsEmailMode(unmatched, everything), 'fallback');
    assert.equal(eventsEmailMode({ ...none, going: matched.picks }, none), 'going-only');
    assert.equal(eventsEmailMode(none, none), 'skip');
  });
  it('fallback says so plainly and lists what else is on', () => {
    const unmatched = buildEventPicks({ entities, occurrences, interests: ['outdoors'], now: NOW });
    const text = renderEventsText({ ...base, picks: unmatched, fallback: buildEventPicks({ entities, occurrences, interests: [], now: NOW }) });
    assert.match(text, /Nothing we’ve checked with an organizer matches your interests/);
    assert.match(text, /ALSO ON IN CALGARY/);
  });
  it('first email says hello; later ones do not', () => {
    const picks = buildEventPicks({ entities, occurrences, interests: ['music'], now: NOW });
    assert.match(renderEventsText({ ...base, interests: ['music'], picks, first: true }), /Welcome to Thursday picks/);
    assert.doesNotMatch(renderEventsText({ ...base, interests: ['music'], picks }), /Welcome to Thursday picks/);
    assert.match(eventsSubject(picks, ['music'], { mode: 'picks', first: true }), /^Your first Thursday picks/);
  });
  it('no home area asks for one', () => {
    const picks = buildEventPicks({ entities, occurrences, interests: ['music'], now: NOW });
    assert.match(renderEventsHtml({ ...base, interests: ['music'], area: '', picks }), /Tell us your neighbourhood/);
  });
  it('each email offers the other list only to people not on it', () => {
    const picks = buildEventPicks({ entities, occurrences, interests: ['music'], now: NOW });
    assert.match(renderEventsText({ ...base, interests: ['music'], picks, offerMonday: true }), /plans\?email=monday/);
    assert.doesNotMatch(renderEventsText({ ...base, interests: ['music'], picks, offerMonday: false }), /email=monday/);
    const summary = buildDigestSummary({ incidents: [], profile: { uid: 'u', weeklyDigestOptIn: true }, home: null, now: NOW.getTime() });
    assert.match(renderDigestText({ summary, unsubscribeUrl: 'u', branding, offerThursday: true }), /plans\?email=thursday/);
    assert.doesNotMatch(renderDigestText({ summary, unsubscribeUrl: 'u', branding }), /email=thursday/);
  });
});

describe('combined "your week" email (both lists)', async () => {
  const { renderCombinedHtml, renderCombinedText, combinedEmailContent } = await import('../scripts/digest/render.ts');
  const { combinedSubject } = await import('../scripts/digest/copy.ts');
  const { allUnsubscribeUrl } = await import('../src/lib/eventsDigest.ts');
  const branding = { mailingAddress: '123 Main St, Calgary AB', senderName: 'CalgaryWatch', supportEmail: 'hi@calgarywatch.ca', origin: 'https://calgarywatch.ca' };
  const home = { lat: 51.0447, lng: -114.0719 };
  const profile = { uid: 'u1', email: 'a@b.co', displayName: 'Sam Lee', neighborhood: 'Beltline', weeklyDigestOptIn: true, weeklyDigestOptInAt: 1 };
  const busy = buildDigestSummary({
    incidents: [{ id: 'i1', title: 'Bike stolen', description: '', category: 'crime', neighborhood: 'Beltline', lat: home.lat, lng: home.lng, timestamp: NOW.getTime() - 3600_000, name: 'A neighbour', verified_status: 'unverified', report_count: 1, visibility: 'public', data_source: 'community' } as never],
    profile, home, now: NOW.getTime(),
  });
  const quiet = buildDigestSummary({ incidents: [], profile, home, now: NOW.getTime() });
  const picks = buildEventPicks({ entities, occurrences, interests: ['music', 'sports'], goingIds: new Set(['flames']), homeArea: 'Beltline', now: NOW, days: 7, limit: 5 });
  const base = {
    summary: busy, picks, interests: ['music', 'sports'] as ('music' | 'sports')[], area: 'Beltline', displayName: 'Sam Lee', branding,
    unsubscribeAllUrl: allUnsubscribeUrl(branding.origin, 'u1', 'a'.repeat(32)),
    unsubscribeMondayUrl: 'https://calgarywatch.ca/unsubscribe?uid=u1&t=x',
    unsubscribeEventsUrl: eventsUnsubscribeUrl(branding.origin, 'u1', 'a'.repeat(32)),
  };

  it('carries both chapters, the glance tiles and all three unsubscribe choices', () => {
    const html = renderCombinedHtml(base);
    const text = renderCombinedText(base);
    for (const body of [html, text]) {
      assert.match(body, /Bike stolen/);
      assert.match(body, /Flames vs\. Oilers/);
      assert.match(body, /list=all/);
      assert.match(body, /list=events/);
      assert.match(body, /123 Main St/);
    }
    assert.match(html, /Near home/);
    assert.match(html, /Out &amp; about/);
    assert.match(html, /Unsubscribe from both/);
    assert.match(html, /Only stop safety reports/);
    assert.match(html, /Only stop event picks/);
    assert.match(html, /reminder here next Monday/);
  });

  it('leads the subject with the plan the reader made', () => {
    assert.match(combinedEmailContent(base).subject, /^Your week in Beltline: you’re going to Flames vs\. Oilers, plus 1 report nearby$/);
  });

  it('says so plainly on a quiet week, and in fallback mode', () => {
    const fallback = buildEventPicks({ entities, occurrences, interests: [], homeArea: 'Beltline', now: NOW, days: 7, limit: 4 });
    assert.equal(combinedSubject({ summary: quiet, going: [], listed: 3, fallback: true }), 'Your week in Beltline: all quiet, and 3 things on');
    const c = combinedEmailContent({ ...base, summary: quiet, picks: { going: [], picks: [], considered: 0 }, fallback });
    assert.equal(c.mode, 'fallback');
    assert.equal(c.subline, 'Quiet streets. Plenty on.');
    assert.match(c.eventsLead, /what else is on/);
  });

  it('explains the merge once, only when asked to', () => {
    assert.match(renderCombinedHtml({ ...base, firstCombined: true }), /One email a week instead of two/);
    assert.doesNotMatch(renderCombinedHtml(base), /One email a week instead of two/);
  });

  it('escapes listing titles', () => {
    const evil = event({ id: 'x', title: '<script>alert(1)</script> gig', start: '2026-10-10T02:00:00Z' });
    const p2 = buildEventPicks({ entities: [evil], occurrences: [], interests: [], now: NOW });
    assert.doesNotMatch(renderCombinedHtml({ ...base, picks: p2 }), /<script>/);
  });

  it('wires the senders: Monday sends it, Thursday skips readers it reached', () => {
    const monday = readFileSync(new URL('../scripts/digest/weekly.ts', import.meta.url), 'utf8');
    const thursday = readFileSync(new URL('../scripts/digest/events.ts', import.meta.url), 'utf8');
    assert.match(monday, /kind: 'combined'/);
    assert.match(monday, /processEventsUnsubscribes/);
    assert.match(monday, /unsubscribeUrl: combined\.unsubscribeAllUrl/);
    assert.match(thursday, /monday\.kind === 'combined'/);
    const page = readFileSync(new URL('../src/pages/UnsubscribePage.tsx', import.meta.url), 'utf8');
    assert.match(page, /get\('list'\) === 'all'/);
  });
});
