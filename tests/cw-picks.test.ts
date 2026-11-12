/**
 * CalgaryWatch Picks (src/lib/cwPicks.ts, docs/cw-picks.md): a Pick shows only
 * when fully vetted, follow-ups and reviews are shaped the way the rules accept.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { BEST_CATEGORIES, PICK_CHECKS, type BestCategory, type PickCheck } from '../src/content/bestOf';
import { activePick, buildFollowup, buildReview, followupEmail, newReviewKey, placeFromLink, placeKey, reviewPath, telHref, validEmail } from '../src/lib/cwPicks';
import { bestForQuery } from '../src/lib/bestOf';
import { sanitizeEventProps } from '../src/lib/productEvents';

const plumbers = BEST_CATEGORIES.find(c => c.slug === 'plumbers')!;
const NOW = Date.parse('2026-11-12T18:00:00Z');
const allChecks = (date: string) => Object.fromEntries((Object.keys(PICK_CHECKS) as PickCheck[]).map(k => [k, date])) as Record<PickCheck, string>;
const withPick = (pick: BestCategory['pick']): BestCategory => ({ ...plumbers, pick });

describe('the Pick', () => {
  it('no list ships a Pick that hasn’t been vetted (content check)', () => {
    for (const c of BEST_CATEGORIES) if (c.pick) assert.ok(activePick(c, NOW), `${c.slug}: pick set but not fully vetted or lapsed`);
  });

  it('shows only with all seven dated checks, a company on the list, and not lapsed', () => {
    const place = plumbers.places[0].name;
    assert.ok(activePick(withPick({ place, checks: allChecks('2026-11-01'), why: 'x', until: '2027-05-01' }), NOW));
    const { pledge: _, ...six } = allChecks('2026-11-01');
    assert.equal(activePick(withPick({ place, checks: six as Record<PickCheck, string>, why: 'x', until: '2027-05-01' }), NOW), null, 'a missing check');
    assert.equal(activePick(withPick({ place, checks: allChecks('2026-12-01'), why: 'x', until: '2027-05-01' }), NOW), null, 'a check dated in the future');
    assert.equal(activePick(withPick({ place, checks: allChecks('2026-11-01'), why: 'x', until: '2026-11-01' }), NOW), null, 'lapsed');
    assert.equal(activePick(withPick({ place: 'Nobody Plumbing', checks: allChecks('2026-11-01'), why: 'x', until: '2027-05-01' }), NOW), null, 'not on the list');
    assert.equal(activePick({ ...BEST_CATEGORIES.find(c => c.kind === 'food')!, pick: { place, checks: allChecks('2026-11-01'), why: 'x', until: '2027-05-01' } }, NOW), null, 'food lists have no Pick');
  });

  it('"plumber" and friends find the plumbers list', () => {
    for (const q of ['plumber', 'plumbers', 'emergency plumber', 'hot water tank', 'frozen pipes calgary']) assert.deepEqual(bestForQuery(q).map(c => c.slug), ['plumbers'], q);
  });

  it('every plumber has a phone or website from its own site', () => {
    for (const p of plumbers.places) assert.ok(p.website || p.phone, p.name);
    assert.equal(telHref('587-317-2535'), 'tel:+15873172535');
  });
});

describe('contact and follow-up', () => {
  it('a place key is short and analytics-safe', () => {
    for (const c of BEST_CATEGORIES) for (const p of c.places) {
      const k = placeKey(p);
      assert.match(k, /^[a-z0-9-]{1,32}$/, p.name);
      assert.deepEqual(sanitizeEventProps({ list: c.slug, place: k, via: 'search', contact: 'call', followup: 'no' }), { list: c.slug, place: k, via: 'search', contact: 'call', followup: 'no' });
    }
    assert.equal(placeKey({ name: 'Mr. Mike’s Plumbing' }), 'mr-mikes-plumbing');
  });

  it('builds a follow-up only with a valid email, due in 7 days, with a 24-character key', () => {
    assert.equal(buildFollowup({ list: 'plumbers', place: plumbers.places[0], email: 'not an email', via: 'search', contact: 'call', now: NOW }), null);
    const f = buildFollowup({ list: 'plumbers', place: plumbers.places[0], email: ' Sam@Example.ca ', via: 'search', contact: 'site', now: NOW })!;
    assert.equal(f.email, 'sam@example.ca');
    assert.equal(f.dueAt - f.createdAt, 7 * 86_400_000);
    assert.match(f.key, /^[A-Za-z0-9_-]{24}$/);
    assert.equal(f.consent, 'pick-v1');
    assert.equal(f.status, 'pending');
    assert.match(newReviewKey(), /^[A-Za-z0-9_-]{24}$/);
    assert.ok(!validEmail("o'brien@example.ca"), 'matches the firestore isValidEmail pattern exactly');
  });

  it('the follow-up fields match the Firestore rule, field for field', () => {
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    const block = rules.slice(rules.indexOf('match /pick_followups/'), rules.indexOf('match /pick_reviews/'));
    const allowed = block.match(/hasOnlyAllowedFields\(\[([^\]]+)\]/)![1].match(/'([^']+)'/g)!.map(x => x.slice(1, -1)).sort();
    const f = buildFollowup({ list: 'plumbers', place: plumbers.places[0], email: 'a@b.ca', via: 'best', contact: 'call', now: NOW })!;
    assert.deepEqual(Object.keys(f).sort(), allowed);
    const rblock = rules.slice(rules.indexOf('match /pick_reviews/'));
    const rallowed = rblock.match(/hasOnlyAllowedFields\(\[([^\]]+)\]/)![1].match(/'([^']+)'/g)!.map(x => x.slice(1, -1)).sort();
    const r = buildReview({ followup: 'abcdefghij1234567890', key: f.key, list: 'plumbers', place: f.place, hired: 'yes', stars: 5, again: true, onTime: true, onPrice: false, text: 'Fast and tidy.' });
    assert.notEqual(typeof r, 'string');
    assert.deepEqual(Object.keys(r as object).sort(), rallowed);
  });
});

describe('reviews', () => {
  const base = { followup: 'abcdefghij1234567890', key: 'A'.repeat(24), list: 'plumbers', place: 'knight-plumbing', again: null, onTime: null, onPrice: null };
  it('needs stars when hired, drops the rest when not', () => {
    assert.equal(typeof buildReview({ ...base, hired: 'yes', stars: null, text: '' }), 'string');
    const r = buildReview({ ...base, hired: 'no', stars: 4, again: true, onTime: true, onPrice: true, text: 'Went with my brother-in-law.' });
    assert.ok(typeof r !== 'string' && r.stars === null && r.again === null);
  });
  it('keeps contact details and links out of review text', () => {
    for (const text of ['call me 403 555 1234', 'email me at x@y.ca', 'see https://spam.example']) assert.equal(typeof buildReview({ ...base, hired: 'yes', stars: 1, text }), 'string', text);
  });
  it('the email links to a page that names the company', () => {
    const mail = followupEmail({ email: 'a@b.ca', placeName: 'Knight Plumbing', list: 'plumbers', place: 'knight-plumbing' }, 'abcdefghij1234567890', 'A'.repeat(24), { listLabel: 'Plumbers' });
    assert.match(mail.text, /calgarywatch\.ca\/review\?f=abcdefghij1234567890&k=A{24}&l=plumbers&p=knight-plumbing/);
    assert.match(mail.subject, /Knight Plumbing/);
    assert.match(mail.text, /only email/);
    const url = new URL(`https://x${reviewPath('abcdefghij1234567890', 'A'.repeat(24), 'plumbers', 'knight-plumbing')}`);
    assert.equal(placeFromLink(url.searchParams.get('l')!, url.searchParams.get('p')!, BEST_CATEGORIES)?.place.name, 'Knight Plumbing');
    assert.equal(placeFromLink('plumbers', 'nobody', BEST_CATEGORIES), null);
  });
});
