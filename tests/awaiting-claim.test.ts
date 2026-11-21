import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryRepository } from '../src/lib/discovery';
import type { DiscoveryEntity } from '../src/types/discovery';

const biz = (id: string, extra: Partial<DiscoveryEntity> = {}) => ({
  id, kind: 'business', slug: id, name: id, title: id, summary: 'A Calgary plumbing company.', description: 'A Calgary plumbing company.',
  categories: ['services'], tags: ['plumber'], address: 'Calgary, AB', images: [], socials: {}, services: [], claimed: false, partner: false, editorialSelection: false,
  sources: [{ name: 'Official site', url: `https://${id}.ca/`, kind: 'official', retrievedAt: new Date().toISOString() }],
  status: 'published', verification: 'source-checked', verifiedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...extra,
}) as unknown as DiscoveryEntity;

describe('listings awaiting their owner', () => {
  it('stay off the site until a claim is approved, but the claim page can open them', () => {
    const repo = createDiscoveryRepository([biz('live'), biz('waiting', { awaitingClaim: true }), biz('claimed', { awaitingClaim: true, ownerVerifiedAt: '2026-11-21' })]);
    assert.deepEqual(repo.list().map(e => e.id), ['live', 'claimed']);
    assert.equal(repo.find('business', 'waiting'), undefined);
    assert.deepEqual(repo.claimable().map(e => e.id), ['live', 'waiting', 'claimed']);
  });
});
