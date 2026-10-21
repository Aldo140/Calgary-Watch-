import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEntityJsonLd, buildSitemap } from '../src/lib/discoverySeo';
import { buildPageJsonLd, getSeoConfig } from '../src/lib/seo';
import { DESCRIPTION_MAX, TITLE_MAX, clip, listingBlurb, listingDescription, listingTitle, relatedGroups } from '../src/lib/listingSeo';
import { discoveryRepository } from '../src/data/discovery';
import { entityPath } from '../src/lib/discovery';
import { renderRouteHtml } from '../scripts/seo/rewriteHtml';
import type { Business, Event } from '../src/types/discovery';

const origin = 'https://calgarywatch.ca';
const base = { categories: ['arts'], tags: [], status: 'published' as const, verification: 'source-checked' as const, updatedAt: '2026-10-01T00:00:00-06:00', verifiedAt: '2026-10-20T00:00:00-06:00' };
const event: Event = { ...base, id: 'e1', kind: 'event', slug: 'little-shop', title: 'Little Shop of Horrors', summary: 'A musical about a plant.', description: 'Theatre Calgary stages the cult musical about a florist and a very hungry plant, with live band.', start: '2026-11-04T19:30:00-06:00', end: '2026-11-04T22:00:00-06:00', timezone: 'America/Edmonton', pricing: 'paid', priceRange: [35, 90], organizer: 'Theatre Calgary', venue: 'Max Bell Theatre', address: '205 8 Avenue SE, Calgary, AB T2G 0K9', neighbourhood: 'Downtown', sources: [{ name: 'Theatre Calgary', url: 'https://theatrecalgary.com/', kind: 'official' }] };
const shell = '<html><head><title>x</title></head><body><div id="root"></div></body></html>';

test('event titles name the date and venue, and stay short enough to show', () => {
  const title = listingTitle(event);
  assert.equal(title, 'Little Shop of Horrors, Nov 4, 2026 at Max Bell Theatre, Calgary');
  assert.ok(title.length <= TITLE_MAX + 6);
  const long = { ...event, title: 'An extremely long lecture title that goes on and on about many things at once' };
  assert.ok(listingTitle(long).length <= 70);
  assert.match(listingTitle({ ...event, cancelled: true }), /^Cancelled: /);
});

test('descriptions lead with when, where and the price we hold, then the listing’s words', () => {
  const d = listingDescription(event);
  assert.match(d, /^Wednesday, November 4, 2026, 7:30 p\.m\. at Max Bell Theatre, Downtown, Calgary\. Tickets \$35–\$90\./);
  assert.ok(d.length <= DESCRIPTION_MAX);
  assert.doesNotMatch(listingDescription({ ...event, pricing: 'unknown', priceRange: undefined }), /Tickets|Free/);
  assert.match(listingDescription({ ...event, pricing: 'free', priceRange: undefined }), /Free\./);
});

test('a summary cut off at an initial falls back to the description', () => {
  assert.equal(listingBlurb({ summary: 'Join curator Jenelle M.', description: 'Join curator Jenelle M. Pasiechnik for a tour.' }), 'Join curator Jenelle M. Pasiechnik for a tour.');
  assert.equal(listingBlurb({ summary: 'A year-round Wednesday farmers’ market in Hillhurst.', description: 'Longer text here, much longer than the summary.' }), 'A year-round Wednesday farmers’ market in Hillhurst.');
  assert.equal(clip('calgary farmers market hours', 20), 'calgary farmers…');
});

test('business titles do not repeat a neighbourhood the name already carries', () => {
  const b = { ...base, id: 'b', kind: 'business', slug: 'rosso', title: 'Rosso Coffee Roasters — Inglewood', name: 'Rosso', neighbourhood: 'Inglewood', summary: 's', description: 'd', address: '1402 9 Ave SE, Calgary, AB', images: [], socials: {}, services: [], claimed: false, partner: false, editorialSelection: false, sources: event.sources } as Business;
  assert.equal(listingTitle(b), 'Rosso Coffee Roasters — Inglewood, Calgary | CalgaryWatch');
});

test('listing JSON-LD carries a structured Calgary address and offline attendance', () => {
  const json = buildEntityJsonLd(event, origin) as any;
  assert.deepEqual(json.location.address, { '@type': 'PostalAddress', streetAddress: '205 8 Avenue SE', addressLocality: 'Calgary', addressRegion: 'AB', postalCode: 'T2G 0K9', addressCountry: 'CA' });
  assert.equal(json.eventAttendanceMode, 'https://schema.org/OfflineEventAttendanceMode');
  // An address outside Calgary stays as written rather than being relabelled.
  assert.equal((buildEntityJsonLd({ ...event, address: '306097 192 Street W, Millarville, AB' }, origin) as any).location.address, '306097 192 Street W, Millarville, AB');
});

test('listing pages get Home › hub › listing breadcrumbs', () => {
  const entity = discoveryRepository.list().find(e => e.kind === 'market')!;
  const crumbs = (buildPageJsonLd(entityPath(entity), origin) as any).breadcrumb.itemListElement;
  assert.deepEqual(crumbs.map((c: any) => c.name), ['Home', 'Markets', entity.title]);
  assert.deepEqual((buildPageJsonLd('/events', origin) as any).breadcrumb.itemListElement.map((c: any) => c.name), ['Home', 'Events']);
});

test('the sitemap dates each listing by its last source check and includes Local profiles', () => {
  const xml = buildSitemap([], [event], origin);
  assert.match(xml, /<loc>https:\/\/calgarywatch\.ca\/events\/little-shop<\/loc><lastmod>2026-10-20<\/lastmod>/);
  const local = discoveryRepository.list().find(e => e.kind === 'business')!;
  assert.equal(getSeoConfig(entityPath(local)).index, true);
  assert.equal(getSeoConfig('/local').index, true);
});

test('related links never repeat a page and never link the page to itself', () => {
  const all = discoveryRepository.list();
  for (const entity of all.slice(0, 120)) {
    const paths = relatedGroups(entity, all, discoveryRepository.occurrences()).flatMap(g => g.links.map(l => l.path));
    assert.equal(new Set(paths).size, paths.length, entity.slug);
    assert.ok(!paths.includes(entityPath(entity)), entity.slug);
  }
});

test('prerendered listing pages carry breadcrumbs, facts and onward links', () => {
  const org = discoveryRepository.list().find(e => e.kind === 'business' && e.slug === 'vertigo-theatre')!;
  const html = renderRouteHtml(shell, entityPath(org), origin);
  assert.match(html, /<nav aria-label="Breadcrumb"><ol><li><a href="\/">Home<\/a><\/li><li><a href="\/local">Local<\/a><\/li>/);
  assert.match(html, /<dt>Phone<\/dt><dd>403-221-3708<\/dd>/);
  assert.match(html, /<h2>Upcoming events from Vertigo Theatre<\/h2>/);
  assert.match(html, /<meta name="robots" content="index, follow/);
});
