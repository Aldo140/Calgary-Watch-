/**
 * Calgary safety news (/safety): headline classification, merging, search and SEO.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SAFETY_PATH, SAFETY_TOPICS } from '../src/content/safetyTopics';
import { NEWS_FEEDS } from '../src/content/newsFeeds';
import { safetyForQuery, safetyPath } from '../src/lib/safety';
import { communityIn, headlinesForQuery, isCalgaryStory, KEEP_DAYS, mergeHeadlines, parseFeed, toHeadline, topicsFor, type SafetyHeadline } from '../src/lib/safetyNews';
import { PRERENDER_ROUTES, buildPageJsonLd, getSeoConfig } from '../src/lib/seo';
import { safetyStaticBody } from '../scripts/seo/rewriteHtml';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const row = (title: string, over: Partial<SafetyHeadline> = {}): SafetyHeadline => ({
  title, url: `https://example.ca/${encodeURIComponent(title)}`, source: 'CTV News Calgary', publishedAt: '2026-10-20T15:00:00.000Z', topics: topicsFor(title), ...over,
});

describe('safety topics', () => {
  it('has unique slugs, a title and description for search, and steps', () => {
    assert.equal(new Set(SAFETY_TOPICS.map(t => t.slug)).size, SAFETY_TOPICS.length);
    for (const t of SAFETY_TOPICS) {
      assert.match(t.slug, /^[a-z-]+$/);
      assert.match(t.seoTitle, /^Calgary /, t.slug);
      assert.ok(t.seoDescription.length >= 90 && t.seoDescription.length <= 200, `${t.slug} description is ${t.seoDescription.length} chars`);
      assert.ok(t.steps.length >= 3 && t.faqs.length >= 1, t.slug);
    }
  });

  it('only quotes the official numbers', () => {
    const text = JSON.stringify(SAFETY_TOPICS);
    for (const n of text.match(/\b\d[\d-]{6,}\d\b/g) ?? []) assert.ok(['403-266-1234', '1-800-222-8477', '1-888-495-8501'].includes(n), n);
  });

  it('every feed is https and the police feed is marked official', () => {
    for (const f of NEWS_FEEDS) for (const u of [f.site, ...f.urls]) assert.match(u, /^https:\/\//);
    assert.deepEqual(NEWS_FEEDS.filter(f => f.police).map(f => f.id), ['cps']);
  });
});

describe('headline classification', () => {
  it('sorts headlines into topics', () => {
    assert.deepEqual(topicsFor('Police seek suspects after string of break-ins in Bowness'), ['break-ins']);
    assert.deepEqual(topicsFor('Calgary man charged after stolen truck crashes on Deerfoot'), ['car-theft']);
    assert.deepEqual(topicsFor('Man taken to hospital after overnight shooting in Forest Lawn'), ['shootings']);
    assert.deepEqual(topicsFor('Seniors warned about grandparent scam calls'), ['fraud-scams']);
    assert.deepEqual(topicsFor('Police ask for help finding missing 15-year-old girl'), ['missing-persons']);
    assert.deepEqual(topicsFor('Graffiti cleanup costs climb'), ['vandalism']);
  });

  it('keeps general theft off stories that have a narrower topic', () => {
    assert.ok(!topicsFor('Catalytic converter thefts on the rise').includes('theft'));
    assert.ok(topicsFor('Shoplifting charges laid at Chinook').includes('theft'));
  });

  it('ignores sport and non-crime stories', () => {
    assert.deepEqual(topicsFor('Flames shooting woes continue in loss to Oilers'), []);
    assert.deepEqual(topicsFor('City council approves new bike lanes'), []);
    assert.deepEqual(topicsFor('Drug prices at pharmacies'), []);
  });

  it('finds a community by its proper name only', () => {
    assert.equal(communityIn('Two people hurt in Forest Lawn stabbing'), 'Forest Lawn');
    assert.equal(communityIn('Break-ins in Kensington'), 'Hillhurst');
    assert.equal(communityIn('A mission to help seniors'), undefined);
    assert.equal(communityIn('Mission accomplished for police'), undefined);
  });

  it('keeps Calgary stories only, unless the source is Calgary Police', () => {
    assert.ok(isCalgaryStory('Calgary police investigate robbery'));
    assert.ok(isCalgaryStory('Robbery in Bowness overnight'));
    assert.ok(!isCalgaryStory('Edmonton police investigate robbery'));
    assert.ok(isCalgaryStory('Man charged with robbery', true));
  });
});

describe('feeds and merging', () => {
  const xml = `<?xml version="1.0"?><rss><channel><title>CTV</title>
    <item><title><![CDATA[Calgary police seek suspect in Beltline robbery &amp; assault]]></title><link>https://www.ctvnews.ca/calgary/article/a1</link><description><![CDATA[<p>Police say a man was robbed.</p>]]></description><pubDate>Mon, 20 Oct 2026 15:00:00 GMT</pubDate></item>
    <item><title>Stampede grounds host craft fair</title><link>https://www.ctvnews.ca/calgary/article/a2</link><pubDate>Mon, 20 Oct 2026 16:00:00 GMT</pubDate></item>
    <item><title>Edmonton shooting under investigation</title><link>https://www.ctvnews.ca/edmonton/article/a3</link><pubDate>Mon, 20 Oct 2026 16:00:00 GMT</pubDate></item>
  </channel></rss>`;

  it('parses RSS and keeps only Calgary safety headlines, without their text', () => {
    const items = parseFeed(xml);
    assert.equal(items.length, 3);
    assert.equal(items[0].title, 'Calgary police seek suspect in Beltline robbery & assault');
    const kept = items.map(i => toHeadline(i, { name: 'CTV News Calgary' })).filter(Boolean) as SafetyHeadline[];
    assert.equal(kept.length, 1);
    assert.deepEqual(kept[0].topics.sort(), ['assaults', 'robbery']);
    assert.equal(kept[0].community, 'Beltline');
    assert.equal(kept[0].publishedAt, '2026-10-20T15:00:00.000Z');
    assert.ok(!('summary' in kept[0]));
  });

  it('parses Atom entries', () => {
    const atom = '<feed><entry><title>Calgary fraud warning</title><link href="https://example.ca/x"/><updated>2026-10-20T10:00:00Z</updated></entry></feed>';
    assert.equal(parseFeed(atom)[0].link, 'https://example.ca/x');
  });

  it('merges without duplicates, newest first, and drops old or future rows', () => {
    const a = row('Calgary break-ins in Bowness');
    const sameTitle = row('Calgary break-ins in Bowness', { url: 'https://other.ca/b', source: 'CBC Calgary' });
    const newer = row('Calgary police investigate shooting', { publishedAt: '2026-10-21T09:00:00.000Z' });
    const old = row('Calgary robbery', { publishedAt: new Date(NOW - (KEEP_DAYS + 1) * 86_400_000).toISOString() });
    const future = row('Calgary stabbing', { publishedAt: '2026-10-25T00:00:00.000Z' });
    const merged = mergeHeadlines([a, old], [newer, a, sameTitle, future], NOW);
    assert.deepEqual(merged.map(h => h.title), ['Calgary police investigate shooting', 'Calgary break-ins in Bowness']);
  });

  it('matches headlines to a search', () => {
    const items = [row('Break-ins reported in Bowness', { community: 'Bowness' }), row('Shooting in Forest Lawn', { community: 'Forest Lawn' })];
    assert.deepEqual(headlinesForQuery(items, 'calgary bowness').map(h => h.community), ['Bowness']);
    assert.deepEqual(headlinesForQuery(items, 'calgary'), []);
  });
});

describe('safety search and SEO', () => {
  it('finds topics for "Calgary <crime>" searches', () => {
    assert.deepEqual(safetyForQuery('calgary car theft').map(t => t.slug), ['car-theft']);
    assert.deepEqual(safetyForQuery('B&E Calgary').map(t => t.slug), ['break-ins']);
    assert.deepEqual(safetyForQuery('Calgary shootings').map(t => t.slug), ['shootings']);
    assert.deepEqual(safetyForQuery('jazz this weekend'), []);
  });

  it('indexes every topic page with breadcrumbs and FAQ JSON-LD', () => {
    for (const route of [SAFETY_PATH, ...SAFETY_TOPICS.map(safetyPath)]) {
      assert.ok(PRERENDER_ROUTES.includes(route), route);
      assert.equal(getSeoConfig(route).index, true, route);
      const ld = buildPageJsonLd(route, 'https://calgarywatch.ca') as { breadcrumb: { itemListElement: unknown[] }; mainEntity: Array<{ '@type': string }> };
      assert.ok(ld.breadcrumb.itemListElement.length >= 2, route);
      assert.ok(ld.mainEntity.every(q => q['@type'] === 'Question'), route);
    }
  });

  it('prerenders headlines that link out and the topic copy', () => {
    const news = { updatedAt: null, feeds: [], items: [row('Calgary police investigate car theft ring', { community: 'Bowness' })] };
    const html = safetyStaticBody('/safety/car-theft', news);
    assert.match(html, /<h1>Car theft in Calgary\.<\/h1>/);
    assert.match(html, /href="https:\/\/example\.ca\/Calgary/);
    assert.match(html, /403-266-1234/);
    assert.match(html, /\/search\?q=Bowness/);
    assert.equal(safetyStaticBody('/safety/nope', news), '');
    assert.match(safetyStaticBody('/safety', { updatedAt: null, feeds: [], items: [] }), /appear here as they’re published/);
  });
});
