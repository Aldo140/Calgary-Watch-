/**
 * Verified listings, end to end: an approved claim is the only way in, the
 * badge shows it, ranking gives it a modest lift, and outreach only describes
 * the benefit where it is real.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { VERIFICATION_PRIORITY_ENABLED, VERIFIED_WEIGHT, applyOwnerVerification, byVerified, isOwnerVerified, ownerVerification, verificationCounts, verifiedBoost } from '../src/lib/verified.ts';
import { interestScore } from '../src/lib/eventRank.ts';
import { searchListings } from '../src/lib/listingSearch.ts';
import { linksFor } from '../src/lib/neighbourhoods.ts';
import { buildEventPicks } from '../src/lib/eventPicks.ts';
import { CLAIM_BENEFIT, VerifiedBadge } from '../src/components/entity/VerifiedBadge.tsx';
import { NO_CLAIM, claimFactsFor, claimFactsText, claimLanguageProblems, claimLine, claimUrlFor, guaranteeProblems } from '../scripts/ops/lib/claimFacts.ts';
import { adoptListings, followUpTemplate, templatePitch, withClaimLink } from '../scripts/ops/jobs/outreach.ts';
import type { Business, DiscoveryEntity, Event, Neighbourhood } from '../src/types/discovery.ts';
import type { PartnerLead } from '../src/types/ops.ts';

const AT = Date.parse('2026-10-01T18:00:00Z');
const NOW = new Date('2026-10-15T16:00:00Z'); // Thursday, 10:00 in Calgary

const base = { summary: '', description: '', categories: [], tags: [], sources: [{ name: 'x', url: 'https://x.ca', kind: 'official' as const }], status: 'published' as const, verification: 'unverified' as const, updatedAt: '2026-10-01' };
const event = (id: string, title: string, extra: Partial<Event> = {}): Event => ({
  ...base, kind: 'event', id, slug: id, title, start: '2026-10-17T02:00:00Z', end: '2026-10-17T04:00:00Z',
  timezone: 'America/Edmonton', pricing: 'paid', organizer: 'x', address: 'Calgary', ...extra,
});
const shop = (id: string, title: string, extra: Partial<Business> = {}): Business => ({
  ...base, kind: 'business', id, slug: id, title, name: title, address: 'Calgary', images: [], socials: {}, services: [],
  claimed: false, partner: false, editorialSelection: false, ...extra,
});
const VERIFIED = { ownerVerifiedAt: '2026-10-01T18:00:00.000Z' };

describe('verified state follows approved claims only', () => {
  it('1. an unclaimed listing is not verified', () => {
    const [e] = applyOwnerVerification([shop('cafe', 'Cafe')], ownerVerification([]));
    assert.equal(isOwnerVerified(e), false);
    assert.equal(e.claimed, false);
  });

  it('2. pending or rejected claims, however many, do not verify', () => {
    const claims = [
      { entityId: 'cafe', status: 'pending', reviewedAt: null },
      { entityId: 'cafe', status: 'pending', reviewedAt: null },
      { entityId: 'cafe', status: 'rejected', reviewedAt: AT },
    ];
    assert.equal(ownerVerification(claims).size, 0);
  });

  it('3. an approved claim verifies the listing, dated from the public mark', () => {
    const v = ownerVerification([{ entityId: 'cafe', status: 'pending' }, { entityId: 'cafe', status: 'approved', reviewedAt: AT + 5 }], [{ entityId: 'cafe', verifiedAt: AT }]);
    assert.equal(v.get('cafe'), new Date(AT).toISOString());
    const [e] = applyOwnerVerification([shop('cafe', 'Cafe')], v);
    assert.equal(e.ownerVerifiedAt, new Date(AT).toISOString());
    assert.equal(e.claimed, true);
  });

  it('existing approved claims without a mark still count (no reclaim needed)', () => {
    assert.equal(ownerVerification([{ entityId: 'old', status: 'approved', reviewedAt: AT }]).get('old'), new Date(AT).toISOString());
  });

  it('a public mark with no approved claim behind it does not count', () => {
    assert.equal(ownerVerification([], [{ entityId: 'stray', verifiedAt: AT }]).size, 0);
  });

  it('a feed or entity document cannot mark itself verified', () => {
    const [e] = applyOwnerVerification([shop('cafe', 'Cafe', { ownerVerifiedAt: '2026-01-01', claimed: true })], new Map());
    assert.equal('ownerVerifiedAt' in e, false);
    assert.equal(e.claimed, false);
  });

  it('the build stamps from listing_claims and verified_listings', () => {
    const exp = readFileSync(new URL('../scripts/discovery/export.ts', import.meta.url), 'utf8');
    assert.match(exp, /collection\('listing_claims'\)\.where\('status', '==', 'approved'\)/);
    assert.match(exp, /applyOwnerVerification\(/);
  });

  it('approval in admin writes the public mark and closes every lead for the listing', () => {
    const panel = readFileSync(new URL('../src/components/admin/ClaimsPanel.tsx', import.meta.url), 'utf8');
    assert.match(panel, /status: approve \? 'approved' : 'rejected'/);
    assert.match(panel, /if \(approve\) \{\s*await setDoc\(doc\(db, VERIFIED, c\.entityId\)/);
    assert.match(panel, /leads\?\.filter\(\(l\) => l\.entityId === c\.entityId\)/);
  });
});

describe('the verified badge', () => {
  const cta = readFileSync(new URL('../src/components/entity/ClaimCta.tsx', import.meta.url), 'utf8');

  it('4. shows on a verified listing, with what it means', () => {
    const html = renderToStaticMarkup(createElement(VerifiedBadge));
    assert.match(html, /<strong>Verified<\/strong>/);
    assert.match(html, /Confirmed by the organization/);
    assert.match(html, /aria-hidden="true"/); // the icon is decorative; the words carry it
    // Shown from the build's stamp, or the public mark for approvals since the build.
    assert.match(cta, /useVerifiedListing\(entityId, Boolean\(verifiedAt\)\);\n  return verified \? <VerifiedBadge \/> : null;/);
    for (const page of ['entity/ListingDetail.tsx', 'markets/MarketDetail.tsx', 'entity/EntityDetail.tsx']) {
      assert.match(readFileSync(new URL(`../src/components/${page}`, import.meta.url), 'utf8'), /<VerifiedMark entityId=\{[\w.]+\} verifiedAt=\{[\w.]+\} \/>/, page);
    }
  });

  it('5. does not show on an unverified listing, which offers the claim instead', () => {
    assert.match(cta, /if \(verified\) \{\n    return <p><a href=\{`mailto:/);
    assert.match(cta, /<Link to=\{`\/claim\/\$\{encodeURIComponent\(entityId\)\}`\}>Claim this listing/);
    assert.deepEqual(guaranteeProblems(CLAIM_BENEFIT), []);
    assert.match(CLAIM_BENEFIT, /more weight/);
  });
});

describe('ranking', () => {
  it('weights are modest and all positive', () => {
    assert.equal(VERIFICATION_PRIORITY_ENABLED, true);
    assert.ok(VERIFIED_WEIGHT.interest > 0 && VERIFIED_WEIGHT.interest <= 2);
    assert.ok(VERIFIED_WEIGHT.search > 0 && VERIFIED_WEIGHT.search < 5);
    assert.ok(VERIFIED_WEIGHT.picks > 0 && VERIFIED_WEIGHT.picks < 1);
  });

  it('6. a verified listing beats an otherwise equal unverified one', () => {
    const plain = event('a', 'Comedy night', { venue: 'Somewhere' });
    const mine = event('b', 'Comedy night', { venue: 'Somewhere', ...VERIFIED });
    const start = '2026-10-17T02:00:00Z';
    assert.equal(interestScore(mine, start, NOW.getTime()) - interestScore(plain, start, NOW.getTime()), VERIFIED_WEIGHT.interest);

    const ids = searchListings([shop('a-cafe', 'Kensington Coffee', { tags: ['coffee'] }), shop('b-cafe', 'Kensington Coffee House', { tags: ['coffee'], ...VERIFIED })], [], 'coffee', NOW).groups.business!.map(e => e.id);
    assert.deepEqual(ids, ['b-cafe', 'a-cafe']);
  });

  it('7. a clearly more relevant result still wins', () => {
    // Flames game vs a verified, ordinary event.
    const flames = event('f', 'Calgary Flames vs. Colorado Avalanche', { venue: 'Scotiabank Saddledome' });
    const talk = event('t', 'Neighbourhood chat', { venue: 'Hall', ...VERIFIED });
    assert.ok(interestScore(flames, flames.start, NOW.getTime()) > interestScore(talk, talk.start, NOW.getTime()));
    // A title match beats a verified listing that only matches in its summary.
    const results = searchListings([
      shop('title', 'Pottery Studio'),
      shop('summary', 'Craft Corner', { summary: 'Sometimes pottery', ...VERIFIED }),
    ], [], 'pottery', NOW).groups.business!.map(e => e.id);
    assert.deepEqual(results, ['title', 'summary']);
  });

  it('8. cancelled, finished or unpublished listings get no lift', () => {
    const now = NOW.getTime();
    assert.equal(verifiedBoost(event('c', 'X', { ...VERIFIED, cancelled: true }), 'interest', now), 0);
    assert.equal(verifiedBoost(event('p', 'X', { ...VERIFIED, end: '2026-10-01T00:00:00Z' }), 'interest', now), 0);
    assert.equal(verifiedBoost({ ...shop('arch', 'X', VERIFIED), status: 'archived' }, 'search', now), 0);
    assert.equal(verifiedBoost(event('ok', 'X', VERIFIED), 'interest', now), VERIFIED_WEIGHT.interest);
    assert.equal(verificationCounts(event('ok', 'X'), now), false);
  });

  it('breaks ties on Local and in neighbourhood place lists', () => {
    assert.ok(byVerified(shop('a', 'A'), shop('b', 'B', VERIFIED)) > 0);
    assert.equal(byVerified(shop('a', 'A'), shop('b', 'B')), 0);
    const local = readFileSync(new URL('../src/components/discovery/LocalBoard.tsx', import.meta.url), 'utf8');
    assert.match(local, /Number\(b\.editorialSelection\) - Number\(a\.editorialSelection\) \|\| byVerified\(a, b, now\)/);

    const hood: Neighbourhood = { ...base, kind: 'neighbourhood', id: 'hood-k', slug: 'kensington', title: 'Kensington', quadrant: 'NW', entityIds: [] };
    const all: DiscoveryEntity[] = [hood, shop('s-a', 'Alpha Books', { neighbourhood: 'Kensington' }), shop('s-z', 'Zed Coffee', { neighbourhood: 'Kensington', ...VERIFIED })];
    assert.deepEqual(linksFor(hood, all, [], NOW).places.map(l => l.entity.id), ['s-z', 's-a']);
  });

  it('orders otherwise equal personal picks, never past an interest match', () => {
    const a = event('pa', 'Show A', { neighbourhood: 'Beltline', start: '2026-10-16T02:00:00Z', end: '2026-10-16T04:00:00Z' });
    const b = event('pb', 'Show B', { neighbourhood: 'Beltline', start: '2026-10-16T02:00:00Z', end: '2026-10-16T04:00:00Z', ...VERIFIED });
    const picks = buildEventPicks({ entities: [a, b], occurrences: [], interests: [], now: NOW, days: 7, limit: 1 });
    assert.equal(picks.picks[0].entityId, 'pb');
  });
});

describe('outreach claim facts', () => {
  const sig = 'Aldo Ortiz\nFounder, CalgaryWatch';
  const lead = (extra: Partial<PartnerLead> = {}) => ({ entityId: 'biz-vertigo-theatre', entityKind: 'business', status: 'new', ...extra }) as PartnerLead;
  const listed = { id: 'biz-vertigo-theatre', kind: 'business', title: 'Vertigo Theatre', slug: 'vertigo-theatre', status: 'published' };

  it('9. a real, claimable organization listing may mention verified priority', () => {
    const f = claimFactsFor(lead(), listed);
    assert.equal(f.claimable, true);
    assert.equal(f.verificationBenefitEnabled, true);
    assert.equal(f.claimUrl, 'https://calgarywatch.ca/claim/biz-vertigo-theatre');
    const body = withClaimLink(`Hello,\n\nWe listed you.\n\n${sig}`, f, sig, 'lead-biz-vertigo-theatre');
    assert.match(body, /verified/i);
    assert.match(body, /https:\/\/calgarywatch\.ca\/claim\/biz-vertigo-theatre\n\nAldo Ortiz/);
    assert.deepEqual(claimLanguageProblems(body, f), []);
    // Wording varies by lead, meaning doesn't.
    const lines = new Set(Array.from({ length: 30 }, (_, i) => claimLine(f, `lead-${i}`)));
    assert.ok(lines.size > 1);
    for (const l of lines) {
      assert.match(l!, /verified/i);
      assert.match(l!, /priority|weight/i);
      assert.deepEqual(guaranteeProblems(l!), []);
    }
  });

  it('10. prospects, unlisted organizations and event-only organizers get no verified pitch', () => {
    assert.deepEqual(claimFactsFor({ entityId: null, entityKind: 'prospect', status: 'new' } as PartnerLead, undefined), NO_CLAIM);
    // The entity id is no longer published (or never was): nothing to claim.
    assert.equal(claimFactsFor(lead({ entityId: 'gone' }), undefined).claimable, false);
    assert.equal(claimFactsFor(lead(), { ...listed, status: 'draft' }).claimable, false);
    assert.equal(claimFactsFor(lead(), { ...listed, fixture: true }).claimable, false);
    // An organizer whose only listing is one event: the plain claim line, no benefit.
    const org = claimFactsFor({ entityId: 'ev-1', entityKind: 'organizer', status: 'new' } as PartnerLead, { id: 'ev-1', kind: 'event', title: 'Show', slug: 'show', status: 'published' });
    assert.equal(org.claimable, true);
    assert.equal(org.verificationBenefitEnabled, false);
    assert.doesNotMatch(claimLine(org)!, /verified|priority|weight/i);
    // A pitch to a prospect that drifts into claims is caught.
    const pitch = templatePitch({ businessName: 'Arts Org', category: 'arts' } as PartnerLead, 'Business: Arts Org', sig);
    assert.equal(withClaimLink(pitch.body, NO_CLAIM, sig), pitch.body);
    assert.doesNotMatch(pitch.body, /claim|verified/i);
    assert.ok(claimLanguageProblems(`${pitch.body}\nClaim it at https://calgarywatch.ca/claim/x`, NO_CLAIM).length);
    assert.ok(claimLanguageProblems('Verified organizations get more priority across the site.', NO_CLAIM).length);
  });

  it('11. an already verified organization is not asked to claim again', () => {
    for (const f of [
      claimFactsFor(lead(), { ...listed, ...VERIFIED }),
      claimFactsFor(lead(), listed, new Set(['biz-vertigo-theatre'])),
      claimFactsFor(lead({ status: 'claimed' }), listed),
    ]) {
      assert.equal(f.verified, true);
      assert.equal(f.claimable, false);
      assert.equal(f.claimUrl, null);
      assert.equal(withClaimLink(`Hi\n\n${sig}`, f, sig), `Hi\n\n${sig}`);
    }
    // And never told they're verified when they aren't.
    assert.ok(claimLanguageProblems('Your listing is already verified.', claimFactsFor(lead(), listed)).length);
    assert.deepEqual(claimLanguageProblems('Your listing is already verified.', claimFactsFor(lead(), listed, new Set(['biz-vertigo-theatre']))), []);
  });

  it('12. the direct claim link is the listing’s own claim page', () => {
    assert.equal(claimUrlFor('biz-vertigo-theatre'), 'https://calgarywatch.ca/claim/biz-vertigo-theatre');
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    assert.match(app, /path="\/claim\/:id"/);
    const f = claimFactsFor(lead(), listed);
    assert.ok(claimLanguageProblems(`Claim it: https://calgarywatch.ca/claim/someone-else\n`, f).length, 'an invented link is caught');
    assert.deepEqual(claimLanguageProblems(`Claim it: ${f.claimUrl}.`, f), []);
  });

  it('organizer leads hear about the event listing, prospects never about "your listing"', () => {
    const org = claimFactsFor({ entityId: 'ev-1', entityKind: 'organizer', status: 'contacted' } as PartnerLead, { id: 'ev-1', kind: 'event', title: 'Show', slug: 'show', status: 'published' });
    assert.match(claimLine(org)!, /claim the event listing/);
    assert.match(claimFactsText(org), /entityKind: event \(one of their events is listed/);
    assert.match(followUpTemplate({ businessName: 'Downstage' }, org, sig), /the CalgaryWatch event listing for Downstage/);
    const prospect = followUpTemplate({ businessName: 'Downstage' }, NO_CLAIM, sig);
    assert.doesNotMatch(prospect, /Downstage's listing|your listing|already listed|claim/i);
    assert.match(prospect, /my note about listing Downstage on CalgaryWatch/);
    assert.match(followUpTemplate({ businessName: 'Vertigo Theatre' }, claimFactsFor(lead(), listed), sig), /Vertigo Theatre's listing on CalgaryWatch/);
    assert.match(claimFactsText(claimFactsFor(lead(), listed)), /entityId: biz-vertigo-theatre\nentityKind: business\n/);
  });

  it('a prospect that gets a real listing takes it over instead of a second lead', () => {
    const leads = [
      { id: 'lead-prospect-downstage-ca', entityId: null, website: 'https://downstage.ca/' },
      { id: 'lead-biz-x', entityId: 'biz-x', website: 'https://x.ca/' },
    ];
    const entities = [
      { id: 'biz-downstage', kind: 'business', title: 'Downstage', slug: 'downstage', status: 'published', website: 'https://www.downstage.ca/currentseason/' },
      { id: 'ev-downstage', kind: 'event', title: 'Creative Stretch', slug: 'cs', status: 'published', website: 'https://downstage.ca/' },
      { id: 'biz-other', kind: 'business', title: 'Other', slug: 'other', status: 'draft', website: 'https://x.ca/' },
    ];
    const adopted = adoptListings(leads, entities);
    assert.deepEqual([...adopted].map(([l, e]) => [l, e.id]), [['lead-prospect-downstage-ca', 'biz-downstage']]);
  });

  it('refuses guarantee language anywhere', () => {
    for (const bad of ['We guarantee top ranking.', 'You will always be shown first.', 'Guaranteed placement on the homepage.', 'Your listing will be featured everywhere.', 'Guaranteed traffic to your site.']) {
      assert.ok(guaranteeProblems(bad).length, bad);
    }
    assert.deepEqual(guaranteeProblems('Verified listings get more weight in relevant recommendations.'), []);
  });

  it('templates and prompts carry no guarantee wording', () => {
    for (const file of ['../scripts/ops/jobs/outreach.ts', '../scripts/ops/lib/claimFacts.ts', '../scripts/ops/lib/claude.ts', '../brand/outreach.json']) {
      const text = readFileSync(new URL(file, import.meta.url), 'utf8')
        // the guardrails themselves name the forbidden phrases
        .replace(/^.*(GUARANTEE|Never promise or imply).*$/gm, '');
      assert.deepEqual(guaranteeProblems(text), [], file);
    }
    const prompt = readFileSync(new URL('../scripts/ops/lib/claude.ts', import.meta.url), 'utf8');
    assert.match(prompt, /CLAIM_RULES/);
    assert.match(prompt, /claimFactsText/);
  });
});
