import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createDiscoveryRepository, entityPath } from '../src/lib/discovery.ts';
import type { Business, DiscoveryEntity } from '../src/types/discovery.ts';

const entityId = 'biz-calgary-chinese-cultural-centre';
const slug = 'calgary-chinese-cultural-centre';
const root = new URL('../', import.meta.url);
const editorial = JSON.parse(readFileSync(new URL('src/content/editorial-inventory.json', root), 'utf8')) as { entities: DiscoveryEntity[] };
const generated = JSON.parse(readFileSync(new URL('src/generated/discovery-index.json', root), 'utf8')) as { entities: DiscoveryEntity[]; occurrences: [] };
const repository = createDiscoveryRepository(generated.entities, generated.occurrences);
const entity = repository.find('business', slug) as Business | undefined;

describe('Calgary Chinese Cultural Centre listing', () => {
  it('is a real published Local entity in authored and generated inventory', () => {
    const authored = editorial.entities.find(item => item.id === entityId);
    const exported = generated.entities.find(item => item.id === entityId);
    assert.ok(authored, 'listing must be authored in editorial-inventory.json');
    assert.ok(exported, 'discovery export must retain the listing');
    assert.equal(authored.kind, 'business');
    assert.equal(authored.status, 'published');
    assert.equal(authored.developmentOnly, undefined);
    assert.deepEqual(exported, authored);
  });

  it('resolves at the expected public Local path from the production repository', () => {
    assert.ok(entity);
    assert.equal(entity.id, entityId);
    assert.equal(entity.kind, 'business');
    assert.equal(entity.slug, slug);
    assert.equal(entityPath(entity), '/local/calgary-chinese-cultural-centre');
  });

  it('uses only the organization’s official site for source verification', () => {
    assert.ok(entity);
    assert.equal(entity.verification, 'source-checked');
    assert.ok(entity.sources.length >= 3);
    for (const source of entity.sources) {
      assert.equal(new URL(source.url).hostname.replace(/^www\./, ''), 'culturalcentre.ca');
      assert.equal(source.kind, 'official');
    }
  });

  it('is eligible for the existing claim route and CTA', () => {
    assert.ok(entity);
    const claimPage = readFileSync(new URL('src/pages/ClaimListingPage.tsx', root), 'utf8');
    const listingPage = readFileSync(new URL('src/components/discovery/LocalPlace.tsx', root), 'utf8');
    const claimCta = readFileSync(new URL('src/components/entity/ClaimCta.tsx', root), 'utf8');
    const app = readFileSync(new URL('src/App.tsx', root), 'utf8');

    const claimLookup = repository.list().find(item => item.id === entityId && ['event', 'market', 'business'].includes(item.kind));
    assert.equal(claimLookup?.title, 'Calgary Chinese Cultural Centre');
    assert.match(app, /path="\/claim\/:id"/);
    assert.match(claimPage, /'Claim '\}<em>\{profile\?\.title\?\?entity.title\}/);
    assert.match(listingPage, /<ClaimCta entityId=\{place\.id\} title=\{place\.title\} kind="business" verifiedAt=\{place\.ownerVerifiedAt\} \/>/);
    assert.match(claimCta, /to=\{organizationClaimPath\(listing,discoveryRepository.list\(\)\)\}/);
    assert.equal(`/claim/${entity.id}`, '/claim/biz-calgary-chinese-cultural-centre');
  });
});
