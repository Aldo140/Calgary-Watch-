/**
 * CalgaryWatch Picks (src/lib/cwPicks.ts, docs/cw-picks.md): a Pick shows only
 * when fully vetted, follow-ups and reviews are shaped the way the rules accept.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { BEST_CATEGORIES } from '../src/content/bestOf';
import { PICK_CHECKS, PICKS, type CwPick, type PickCheck } from '../src/content/cwPicks';
import { LOCAL_SERVICES } from '../src/data/localServices';
import { allShelves, askFor, buildFollowup, buildReview, followupEmail, newReviewKey, placeFromLink, placeKey, reviewPath, serviceForQuery, shelfFor, telHref, validEmail } from '../src/lib/cwPicks';
import { sanitizeEventProps } from '../src/lib/productEvents';
import type { DiscoveryEntity } from '../src/types/discovery';

const plumbers = BEST_CATEGORIES.find(c => c.slug === 'plumbers')!;
const NOW = Date.parse('2026-11-12T18:00:00Z');
const allChecks = (date: string) => Object.fromEntries((Object.keys(PICK_CHECKS) as PickCheck[]).map(k => [k, date])) as Record<PickCheck, string>;
/** shelfFor('plumbing') with a trial Pick, put back after. */
const liveWith = (pick: CwPick, id = 'plumbing') => {
  const prev = PICKS[id];
  PICKS[id] = pick;
  try { return shelfFor(id, [], NOW)?.live ?? null; } finally { if (prev) PICKS[id] = prev; else delete PICKS[id]; }
};

describe('the Pick', () => {
  it('no service ships a Pick that hasn’t been vetted (content check)', () => {
    for (const [id, pick] of Object.entries(PICKS)) {
      assert.ok(LOCAL_SERVICES.some(s => s.id === id), `${id}: not a Local service id`);
      assert.ok(pick && shelfFor(id, [], NOW)?.live, `${id}: pick set but not fully vetted, lapsed, or not on the shelf`);
    }
  });

  it('shows only with all seven dated checks, a company on the shelf, and not lapsed', () => {
    const place = plumbers.places[0].name;
    assert.ok(liveWith({ place, checks: allChecks('2026-11-01'), why: 'x', until: '2027-05-01' }));
    const { pledge: _, ...six } = allChecks('2026-11-01');
    assert.equal(liveWith({ place, checks: six as Record<PickCheck, string>, why: 'x', until: '2027-05-01' }), null, 'a missing check');
    assert.equal(liveWith({ place, checks: allChecks('2026-12-01'), why: 'x', until: '2027-05-01' }), null, 'a check dated in the future');
    assert.equal(liveWith({ place, checks: allChecks('2026-11-01'), why: 'x', until: '2026-11-01' }), null, 'lapsed');
    assert.equal(liveWith({ place: 'Nobody Plumbing', checks: allChecks('2026-11-01'), why: 'x', until: '2027-05-01' }), null, 'not on the shelf');
  });

  it('the live Pick is taken off the A–Z list it sits above', () => {
    const live = liveWith({ place: plumbers.places[0].name, checks: allChecks('2026-11-01'), why: 'x', until: '2027-05-01' });
    assert.equal(live?.contender.name, plumbers.places[0].name);
  });
});

describe('shelves', () => {
  it('every Local service has a desk, and every service with a Best list carries its companies', () => {
    const shelves = allShelves([], NOW);
    assert.equal(shelves.length, LOCAL_SERVICES.length);
    for (const s of shelves) {
      assert.equal(askFor(s.service).length, 3, s.service.id);
      if (s.service.best) {
        const best = BEST_CATEGORIES.find(c => c.slug === s.service.best);
        assert.ok(best, `${s.service.id}: best list ${s.service.best} missing`);
        assert.equal(s.contenders.length, best!.places.length, s.service.id);
      }
    }
  });

  it('companies are A–Z ignoring “The”, verified first, each reachable', () => {
    const names = shelfFor('plumbing', [], NOW)!.contenders.map(c => c.name);
    assert.deepEqual(names, ['The Gentlemen Pros', 'Knight Plumbing', 'Mr. Mike’s Plumbing', 'Mr. Rooter Plumbing of Calgary']);
    for (const c of shelfFor('plumbing', [], NOW)!.contenders) assert.ok(c.website || c.phone, c.name);
    assert.equal(telHref('587-317-2535'), 'tel:+15873172535');
  });

  it('cited facts keep their publisher', () => {
    const pros = shelfFor('plumbing', [], NOW)!.contenders.find(c => c.name === 'The Gentlemen Pros')!;
    assert.ok(pros.fact?.label, 'fact has a source label');
  });

  it('Local profiles that offer the service join the shelf, merged by name', () => {
    const biz = (title: string, tags: string[], extra: Partial<DiscoveryEntity> = {}) => ({ id: title, kind: 'business', slug: placeKey({ name: title }), title, tags, website: 'https://x.example', ...extra }) as unknown as DiscoveryEntity;
    const shelf = shelfFor('electrical', [biz('Bright Spark Electric', ['electrician']), biz('Some Bakery', ['bakery']), biz('Hidden Co', ['electrician'], { developmentOnly: true } as Partial<DiscoveryEntity>)], NOW)!;
    assert.deepEqual(shelf.contenders.map(c => c.name), ['Bright Spark Electric']);
    assert.equal(shelf.contenders[0].path, '/local/bright-spark-electric');
    const merged = shelfFor('plumbing', [biz('Knight Plumbing', ['plumber'])], NOW)!;
    assert.equal(merged.contenders.length, plumbers.places.length, 'a profile for a listed plumber adds a link, not a row');
    assert.equal(merged.contenders.find(c => c.name === 'Knight Plumbing')?.path, '/local/knight-plumbing');
  });

  it('a search names its service', () => {
    const cases: Array<[string, string]> = [['plumber', 'plumbing'], ['plumbers', 'plumbing'], ['emergency plumber', 'plumbing'], ['electrician', 'electrical'], ['best electricians calgary', 'electrical'],
      ['snow removal', 'snow'], ['locksmith', 'locksmith'], ['furnace repair', 'heating'], ['window cleaning', 'windows'], ['junk removal', 'junk'], ['mechanic', 'mechanic']];
    for (const [q, id] of cases) assert.equal(serviceForQuery(q)?.id, id, q);
    for (const q of ['pho', 'calgary', 'hillhurst', '']) assert.equal(serviceForQuery(q), undefined, q);
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
    assert.equal(buildFollowup({ list: 'plumbing', place: plumbers.places[0], email: 'not an email', via: 'search', contact: 'call', now: NOW }), null);
    const f = buildFollowup({ list: 'plumbing', place: plumbers.places[0], email: ' Sam@Example.ca ', via: 'search', contact: 'site', now: NOW })!;
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
    const f = buildFollowup({ list: 'plumbing', place: plumbers.places[0], email: 'a@b.ca', via: 'best', contact: 'call', now: NOW })!;
    assert.deepEqual(Object.keys(f).sort(), allowed);
    const rblock = rules.slice(rules.indexOf('match /pick_reviews/'));
    const rallowed = rblock.match(/hasOnlyAllowedFields\(\[([^\]]+)\]/)![1].match(/'([^']+)'/g)!.map(x => x.slice(1, -1)).sort();
    const r = buildReview({ followup: 'abcdefghij1234567890', key: f.key, list: 'plumbing', place: f.place, hired: 'yes', stars: 5, again: true, onTime: true, onPrice: false, text: 'Fast and tidy.' });
    assert.notEqual(typeof r, 'string');
    assert.deepEqual(Object.keys(r as object).sort(), rallowed);
  });
});

describe('reviews', () => {
  const base = { followup: 'abcdefghij1234567890', key: 'A'.repeat(24), list: 'plumbing', place: 'knight-plumbing', again: null, onTime: null, onPrice: null };
  it('needs stars when hired, drops the rest when not', () => {
    assert.equal(typeof buildReview({ ...base, hired: 'yes', stars: null, text: '' }), 'string');
    const r = buildReview({ ...base, hired: 'no', stars: 4, again: true, onTime: true, onPrice: true, text: 'Went with my brother-in-law.' });
    assert.ok(typeof r !== 'string' && r.stars === null && r.again === null);
  });
  it('keeps contact details and links out of review text', () => {
    for (const text of ['call me 403 555 1234', 'email me at x@y.ca', 'see https://spam.example']) assert.equal(typeof buildReview({ ...base, hired: 'yes', stars: 1, text }), 'string', text);
  });
  it('the email links to a page that names the company', () => {
    const mail = followupEmail({ email: 'a@b.ca', placeName: 'Knight Plumbing', list: 'plumbing', place: 'knight-plumbing' }, 'abcdefghij1234567890', 'A'.repeat(24), { listLabel: 'Plumbers' });
    assert.match(mail.text, /calgarywatch\.ca\/review\?f=abcdefghij1234567890&k=A{24}&l=plumbing&p=knight-plumbing/);
    assert.match(mail.subject, /Knight Plumbing/);
    assert.match(mail.text, /only email/);
    const url = new URL(`https://x${reviewPath('abcdefghij1234567890', 'A'.repeat(24), 'plumbing', 'knight-plumbing')}`);
    assert.equal(placeFromLink(url.searchParams.get('l')!, url.searchParams.get('p')!)?.contender.name, 'Knight Plumbing');
    assert.equal(placeFromLink('plumbing', 'nobody'), null);
    assert.equal(placeFromLink('nowhere', 'knight-plumbing'), null);
  });
});
