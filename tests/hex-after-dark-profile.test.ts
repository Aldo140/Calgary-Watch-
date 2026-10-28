import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createDiscoveryRepository, entityPath } from '../src/lib/discovery.ts';
import { shelfOf } from '../src/lib/localShelves.ts';
import { spotlightForProfile, spotlightPath } from '../src/lib/spotlights.ts';
import { renderRouteHtml } from '../scripts/seo/rewriteHtml.ts';
import type { Business, DiscoveryEntity } from '../src/types/discovery.ts';

const entityId = 'biz-hex-after-dark';
const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const editorial = JSON.parse(read('src/content/editorial-inventory.json')) as { entities: DiscoveryEntity[] };
const generated = JSON.parse(read('src/generated/discovery-index.json')) as { entities: DiscoveryEntity[]; occurrences: [] };
const repository = createDiscoveryRepository(generated.entities, generated.occurrences);
const host = (url: string) => new URL(url).hostname.replace(/^www\./, '');

describe('Hex After Dark organization profile', () => {
  it('is one published, unclaimed Local profile, retained by the export', () => {
    const authored = editorial.entities.filter(item => item.id === entityId || /hex after dark/i.test(item.title));
    assert.equal(authored.length, 1, 'exactly one authored profile');
    assert.deepEqual(generated.entities.find(item => item.id === entityId), authored[0]);
    const org = authored[0] as Business;
    assert.equal(org.status, 'published');
    assert.equal(org.claimed, false, 'never claimed on the festival’s behalf');
    assert.equal(org.ownerVerifiedAt, undefined);
    assert.equal(org.partner, false, 'not a paid placement');
    // The organizer's personal contact was given to us, not for publishing.
    assert.equal(org.email, undefined);
    assert.equal(org.phone, undefined);
    for (const source of org.sources.filter(s => s.kind === 'official')) assert.ok(['hex.ca', 'hexafterdark.com', 'filmfreeway.com'].includes(host(source.url)));
    assert.equal(shelfOf(org), 'seasonal', 'sits beside ScreamFest');
  });

  it('resolves to the public profile and the free claim route', () => {
    const entity = repository.find('business', 'hex-after-dark') as Business | undefined;
    assert.ok(entity);
    assert.equal(entityPath(entity), '/local/hex-after-dark');
    const html = renderRouteHtml('<html><head><title>CalgaryWatch</title></head><body><div id="root"></div></body></html>', `/claim/${entityId}`, 'https://calgarywatch.ca');
    assert.match(html, /<title>Claim Hex After Dark Film Festival \| CalgaryWatch<\/title>/);
    assert.doesNotMatch(html, /Listing unavailable|Page not found/);
  });

  it('carries the spotlight, and the spotlight points back to it', () => {
    const spotlight = spotlightForProfile(entityId);
    assert.ok(spotlight);
    assert.equal(spotlightPath(spotlight), '/spotlight/hex-after-dark');
    assert.equal(spotlightForProfile('biz-screamfest'), undefined);
  });
});
