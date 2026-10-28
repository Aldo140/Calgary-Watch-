/**
 * CalgaryWatch Spotlights (/spotlight/:slug): sourced, attributed, temporary
 * promotion, evergreen page, privacy-safe measurement.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HEX_AFTER_DARK, SPOTLIGHTS } from '../src/content/spotlights';
import { activeSpotlight, nightsLine, promoActive, spotlightForEntity, spotlightJsonLd, spotlightPath, upcomingNights } from '../src/lib/spotlights';
import { sanitizeEventProps } from '../src/lib/productEvents';
import { PRERENDER_ROUTES, buildPageJsonLd, getSeoConfig } from '../src/lib/seo';
import { shareCardFor } from '../src/lib/shareImage';
import { buildStaticRouteBody } from '../scripts/seo/rewriteHtml';
import { discoveryRepository } from '../src/data/discovery';
import type { Event } from '../src/types/discovery';

const PATH = spotlightPath(HEX_AFTER_DARK);
const night = (day: number): Event => ({
  id: `n${day}`, kind: 'event', slug: `n${day}`, title: 'ScreamFest at Stampede Park', summary: '', description: '', categories: [], tags: [], sources: [],
  status: 'published', verification: 'source-checked', updatedAt: '2026-10-23T00:00:00Z', sourceId: 'screamfest', address: '', timezone: 'America/Edmonton',
  start: `2026-10-${day}T19:00:00-06:00`, end: `2026-10-${day}T23:59:00-06:00`, pricing: 'paid', organizer: 'ScreamFest',
});

describe('spotlight content', () => {
  it('has unique slugs and https links and sources', () => {
    assert.equal(new Set(SPOTLIGHTS.map(s => s.slug)).size, SPOTLIGHTS.length);
    for (const s of SPOTLIGHTS) for (const u of [...s.links.map(l => l.url), ...s.sources.map(x => x.url)]) assert.match(u, /^https:\/\//);
  });
  it('publishes no invented films, quotes or review before they exist', () => {
    for (const s of SPOTLIGHTS) {
      for (const f of s.showcase.films) {
        assert.ok(f.source.trim(), `${f.title}: every film says where its details come from`);
        if (f.image) assert.ok(f.image.permission.trim() && f.image.credit.trim(), `${f.title}: images need permission and credit`);
      }
      if (s.interview.status !== 'published') assert.ok(s.interview.questions.every(q => !q.answer), 'no answers before the interview is done');
      if (s.review.status !== 'published') assert.equal(s.review.body.length, 0);
    }
  });
  it('attributes the GRAND ambition to Cameron and names the partnership', () => {
    assert.match(HEX_AFTER_DARK.future, /^Cameron Gall has told CalgaryWatch he hopes/);
    assert.match(HEX_AFTER_DARK.future, /grant funding/);
    assert.match(HEX_AFTER_DARK.disclosure, /partnering with Hex After Dark/);
    assert.match(HEX_AFTER_DARK.partnerLabel, /In partnership with/);
    assert.doesNotMatch(JSON.stringify(HEX_AFTER_DARK), /VIP|passes|free tickets/i);
  });
});

describe('spotlight promotion', () => {
  it('runs on the homepage and /events only inside its window', () => {
    assert.equal(promoActive(HEX_AFTER_DARK, new Date('2026-10-26T12:00:00-06:00')), false);
    assert.equal(promoActive(HEX_AFTER_DARK, new Date('2026-10-30T20:00:00-06:00')), true);
    assert.equal(promoActive(HEX_AFTER_DARK, new Date('2026-11-01T00:00:01-06:00')), false);
    assert.equal(activeSpotlight(new Date('2026-12-01T12:00:00-06:00')), undefined);
  });
  it('sits on every ScreamFest night, and on nothing else', () => {
    const screamfest = discoveryRepository.list().filter(e => e.kind === 'event' && e.sourceId === 'screamfest');
    assert.ok(screamfest.length > 0);
    for (const e of screamfest) assert.equal(spotlightForEntity(e), HEX_AFTER_DARK);
    assert.equal(spotlightForEntity({ sourceId: 'vertigo-theatre' }), undefined);
    assert.ok(!discoveryRepository.list().some(e => e.kind === 'event' && /Hex After Dark/i.test(e.title)), 'no duplicate Hex event listing');
  });
  it('counts the nights left from the ScreamFest listings', () => {
    const nights = [night(29), night(30), night(31), night(17)];
    const left = upcomingNights(HEX_AFTER_DARK, nights, new Date('2026-10-27T12:00:00-06:00'));
    assert.deepEqual(left.map(n => n.id), ['n29', 'n30', 'n31']);
    assert.equal(nightsLine(left), '3 nights left, to Sat, Oct 31');
    assert.equal(nightsLine([]), 'This year’s run has ended');
    assert.equal(nightsLine([night(31)], new Date('2026-10-31T12:00:00-06:00')), 'Tonight is the last night');
  });
});

describe('spotlight SEO and sharing', () => {
  it('is indexed, prerendered and in the sitemap after the promo ends', () => {
    assert.ok(PRERENDER_ROUTES.includes(PATH));
    const seo = getSeoConfig(PATH);
    assert.equal(seo.index, true);
    assert.match(seo.title, /Hex After Dark/);
    assert.ok(seo.description.length <= 200);
    assert.equal(seo.image, `https://calgarywatch.ca/og${PATH}.jpg`);
  });
  it('has its own share card naming the partnership', () => {
    const card = shareCardFor(PATH, discoveryRepository)!;
    assert.equal(card.theme, 'spotlight');
    assert.match(card.pill ?? '', /In partnership with Hex After Dark/);
  });
  it('emits Article JSON-LD about the festival without prices or performers', () => {
    const page = buildPageJsonLd(PATH, 'https://calgarywatch.ca') as { mainEntity: Record<string, any> };
    assert.equal(page.mainEntity['@type'], 'Article');
    assert.equal(page.mainEntity.headline, HEX_AFTER_DARK.title);
    const ld = spotlightJsonLd(HEX_AFTER_DARK, 'https://calgarywatch.ca', 'x.jpg', [night(29), night(31)]) as Record<string, any>;
    assert.equal(ld.about['@type'], 'Event');
    assert.equal(ld.about.startDate, '2026-10-29T19:00:00-06:00');
    assert.equal(ld.about.organizer.name, 'Cameron Gall');
    assert.equal(ld.about.offers.price, undefined);
    assert.equal(ld.about.performer, undefined);
  });
  it('prerenders the headline, attribution and official links', () => {
    const html = buildStaticRouteBody(PATH);
    assert.match(html, /The Dark Side of Calgary Cinema/);
    assert.match(html, /Cameron Gall has told CalgaryWatch/);
    assert.match(html, /showpass\.com\/screamfest-28/);
  });
});

describe('spotlight measurement', () => {
  it('keeps only short, non-identifying props', () => {
    const out = sanitizeEventProps({ spot: 'hex-after-dark', link: 'tickets', at: 'home', sid: 'abc123', title: 'x', email: 'a@b.c' });
    assert.deepEqual(out, { spot: 'hex-after-dark', link: 'tickets', at: 'home', sid: 'abc123' });
  });
});
