import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shortlistPoints } from '../scripts/ingest/sources/community-locator.js';
import { headlineKey, judgeNewsItem, parseRssItems, placeWithPolice, tidyFeedText } from '../scripts/ingest/sources/rss.js';

const NOW = Date.parse('2026-10-24T08:00:00Z');
const POINTS = shortlistPoints();
const newsroom = { id: 'ctv', name: 'CTV News Calgary', urls: [] };
const search = { id: 'google-news-1', name: 'Google News', urls: [], aggregator: true };
const item = (title: string, extra: Partial<{ description: string; outlet: string; pubDate: string }> = {}) => ({
  title, description: '', link: 'https://example.ca/story', pubDate: new Date(NOW - 3600_000).toUTCString(), ...extra,
});

describe('news items', () => {
  it('decodes escaped HTML and numeric entities before anyone reads them', () => {
    assert.equal(tidyFeedText('&lt;p&gt;Early morning fire in SE Calgary, &#8216;spread into the building&#8217;&lt;/p&gt;'),
      'Early morning fire in SE Calgary, ‘spread into the building’');
    assert.equal(tidyFeedText('<![CDATA[Man &amp; dog]]>'), 'Man & dog');
  });

  it('reads the outlet off a search result and credits it', () => {
    const [parsed] = parseRssItems(`<rss><channel><item><title>Man charged after stabbing in Forest Lawn - Calgary Herald</title>
      <link>https://news.google.com/rss/articles/abc</link><pubDate>${new Date(NOW - 3600_000).toUTCString()}</pubDate>
      <description>&lt;a href="x"&gt;Man charged after stabbing in Forest Lawn&lt;/a&gt;&amp;nbsp;&lt;font&gt;Calgary Herald&lt;/font&gt;</description>
      <source url="https://calgaryherald.com">Calgary Herald</source></item></channel></rss>`);
    const decision = judgeNewsItem(search, parsed, POINTS, NOW);
    assert.ok(decision.keep);
    if (!decision.keep) return;
    assert.equal(decision.incident.title, 'Man charged after stabbing in Forest Lawn');
    assert.equal(decision.incident.source_name, 'Calgary Herald');
    assert.equal(decision.incident.neighborhood, 'Forest Lawn');
    assert.equal(decision.incident.category, 'crime');
    assert.match(decision.incident.description, /Calgary Herald reported this story/);
  });

  it('writes one record when a newsroom feed and a search carry the same story', () => {
    const a = judgeNewsItem(newsroom, item('Man charged after stabbing in Forest Lawn'), POINTS, NOW);
    const b = judgeNewsItem(search, item('Man charged after stabbing in Forest Lawn - CTV News Calgary', { outlet: 'CTV News Calgary' }), POINTS, NOW);
    assert.ok(a.keep && b.keep);
    if (a.keep && b.keep) assert.equal(a.incident.dedup_key, b.incident.dedup_key);
    assert.equal(headlineKey('‘Got ripped off’: fraud'), headlineKey("'Got ripped off': fraud"));
  });

  it('says why it drops an item', () => {
    const reason = (feed: typeof newsroom | typeof search, title: string, extra = {}) => {
      const d = judgeNewsItem(feed, item(title, extra), POINTS, NOW);
      return d.keep ? 'kept' : d.reason;
    };
    assert.equal(reason(newsroom, 'Calgary tourists attacked after Bruno Mars show in Vancouver, police say'), 'set outside Calgary');
    assert.equal(reason(newsroom, 'Judge rules in Calgary stabbing trial'), 'not an incident');
    assert.equal(reason(newsroom, 'Calgary man arrested'), 'names no Calgary community or quadrant');
    assert.equal(reason(search, 'Robbery in Forest Lawn - Some Blog', { outlet: 'Some Blog' }), 'outlet not on the list (Some Blog)');
    assert.equal(reason(newsroom, 'Robbery in Forest Lawn', { pubDate: new Date(NOW - 9 * 86_400_000).toUTCString() }), 'older than a week');
  });
});

describe('placing a story by its police release', () => {
  const release = (title: string, neighborhood: string, hoursAgo: number) => ({
    title, description: '', category: 'crime' as const, neighborhood, lat: 51, lng: -114, timestamp: NOW - hoursAgo * 3600_000,
    source_name: 'Calgary Police Service', source_url: 'x', source_type: 'calgary_police_crime' as const, data_source: 'official' as const,
    dedup_key: `cps:${title}`, expires_at: NOW + 1, verified_status: 'community_confirmed' as const, report_count: 1 as const,
    email: '', name: '', anonymous: false as const,
  });
  const story = (title: string) => {
    const d = judgeNewsItem(search, item(`${title} - CTV News`, { outlet: 'CTV News' }), POINTS, NOW);
    assert.ok(!d.keep && d.unplaced, `${title} should be an unplaced Calgary story`);
    return (d as { unplaced: NonNullable<Parameters<typeof placeWithPolice>[0][number]> }).unplaced;
  };

  it('takes the place of the one release about the same event', () => {
    const placed = placeWithPolice([story('Teen charged in Calgary armed robberies; more suspects sought')], [
      release('Youth charged, two additional suspects sought in armed robberies', 'Woodbine', 30),
      release('Teen charged in southeast stabbing', 'Copperfield', 20),
    ]);
    assert.equal(placed.length, 1);
    assert.equal(placed[0].neighborhood, 'Woodbine');
    assert.equal(placed[0].source_name, 'CTV News');
  });

  it('leaves a story unplaced when no release, or more than one, fits', () => {
    assert.equal(placeWithPolice([story('Dozens arrested in 2-day blitz between Calgary police, Alberta Sheriffs')], [
      release('Youth charged, two additional suspects sought in armed robberies', 'Woodbine', 30),
    ]).length, 0);
    assert.equal(placeWithPolice([story('Calgary police investigate stabbing downtown overnight')], [
      release('Police investigate stabbing downtown', 'Downtown', 10),
      release('Second stabbing downtown under investigation', 'Beltline', 12),
    ]).length, 0);
  });
});
