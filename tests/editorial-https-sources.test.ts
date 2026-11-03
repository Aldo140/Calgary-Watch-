import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createDiscoveryRepository } from '../src/lib/discovery.ts';
import type { DiscoveryEntity } from '../src/types/discovery.ts';

// The public repository only lists entities whose sources are all https. A profile
// saved with an http:// website builds fine but its /local page is a 404, which is how
// five Nov 3 outreach profiles went missing after deploy.
const inventory = JSON.parse(readFileSync('src/content/editorial-inventory.json', 'utf8')) as { entities: DiscoveryEntity[] };
// Their site has no https, so the profile stays unpublished until it does.
const knownHttpOnly = new Set(['biz-sunnyside-art-supplies']);

describe('editorial inventory sources', () => {
  const published = inventory.entities.filter(e => e.status === 'published' && !knownHttpOnly.has(e.id));

  it('uses https for every source of a published entry', () => {
    const http = published.filter(e => !e.sources.every(s => /^https:\/\//.test(s.url))).map(e => e.id);
    assert.deepEqual(http, []);
  });

  it('lists the profiles fixed on Nov 3', () => {
    const listed = new Set(createDiscoveryRepository(published, [], false).list().map(e => e.id));
    for (const id of ['biz-amici-italian-grill', 'biz-teatro-calgary', 'biz-nam-vietnamese-kitchen', 'biz-vin-room', 'biz-high-line-brewing'])
      assert.ok(listed.has(id), id);
  });
});
