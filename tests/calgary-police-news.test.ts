import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  locateCalgaryPoliceRelease,
  normalizeCalgaryPoliceFeed,
  parseCalgaryPoliceFeed,
} from '../scripts/ingest/sources/calgary-police-news.js';

const NOW = Date.parse('2026-08-24T15:00:00Z');
const XML = `<?xml version="1.0"?><rss><channel><item>
  <title><![CDATA[Information sought in Saddle Ridge vandalism investigation]]></title>
  <link>https://newsroom.calgary.ca/saddle-ridge-vandalism/</link>
  <description><![CDATA[<p>Police are investigating property damage in the community of Saddle Ridge.</p><p>Anyone with information may contact CPS.</p>]]></description>
  <pubDate>Wed, 19 Aug 2026 13:05:06 -0600</pubDate>
</item><item>
  <title>Fatal collision in southwest Calgary</title>
  <link>https://newsroom.calgary.ca/sw-collision/</link>
  <description><![CDATA[<p>The Traffic Unit is investigating a collision in southwest Calgary.</p>]]></description>
  <pubDate>Tue, 18 Aug 2026 11:00:00 -0600</pubDate>
</item></channel></rss>`;

describe('Calgary Police newsroom source', () => {
  it('parses the official RSS timestamps and markup', () => {
    const items = parseCalgaryPoliceFeed(XML);
    assert.equal(items.length, 2);
    assert.equal(items[0].title, 'Information sought in Saddle Ridge vandalism investigation');
    assert.doesNotMatch(items[0].description, /<p>/);
  });

  it('uses named Calgary areas and does not invent a location', () => {
    assert.equal(locateCalgaryPoliceRelease('Incident in Saddle Ridge')?.neighborhood, 'Saddle Ridge');
    assert.equal(locateCalgaryPoliceRelease('A city-wide policy announcement'), null);
  });

  it('creates attributed, timestamped, long-lived police incidents', () => {
    const incidents = normalizeCalgaryPoliceFeed(XML, NOW);
    assert.equal(incidents.length, 2);
    assert.equal(incidents[0].source_type, 'calgary_police_crime');
    assert.equal(incidents[0].source_name, 'Calgary Police Service');
    assert.equal(incidents[0].timestamp, Date.parse('Wed, 19 Aug 2026 13:05:06 -0600'));
    assert.ok(incidents[0].expires_at - incidents[0].timestamp! >= 28 * 86_400_000);
    assert.equal(incidents[1].category, 'traffic');
  });
});
