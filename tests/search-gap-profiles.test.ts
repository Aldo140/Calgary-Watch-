import { test } from 'node:test';
import assert from 'node:assert/strict';
import inventory from '../src/content/editorial-inventory.json';
import { readTerms } from '../scripts/discovery/search-gaps';

type Profile = { id: string; kind: string; slug: string; address?: string; tags?: string[]; claimed?: boolean; partner?: boolean; verification?: string; verifiedAt?: string; sources?: Array<{ url: string; kind: string; retrievedAt?: string }> };

// docs/search-gap-profiles.md: a profile made because someone searched for it
// must be a confirmed organization in Calgary, from its own site.
test('profiles added from empty searches are confirmed, Calgary, and unclaimed', () => {
  const now = Date.now() + 5 * 60_000;
  for (const p of (inventory.entities as Profile[]).filter(e => e.tags?.includes('search-gap'))) {
    assert.equal(p.kind, 'business', p.id);
    assert.equal(p.id, `biz-${p.slug}`, p.id);
    assert.ok(p.tags?.includes('organization'), `${p.id} is tagged organization`);
    assert.match(p.address ?? '', /\bCalgary\b/, `${p.id} has a Calgary address`);
    assert.ok(p.sources?.some(s => s.kind === 'official' && s.url.startsWith('https://')), `${p.id} cites its own site`);
    assert.equal(p.verification, 'source-checked', p.id);
    assert.ok(p.verifiedAt && Date.parse(p.verifiedAt) <= now, `${p.id} verifiedAt is real, not in the future`);
    assert.equal(p.claimed, false, p.id);
    assert.equal(p.partner, false, p.id);
  }
});

test('search:gaps reads the admin panel as pasted, or plain terms', () => {
  const pasted = '1. [madigan](https://calgarywatch.ca/search?q=madigan)\n1 searchno results\n2. [herringer kiss gallery](https://calgarywatch.ca/search?q=herringer%20kiss%20gallery)\nAnswered now: Herringer Kiss Gallery\n7. [madigan](https://calgarywatch.ca/search?q=madigan)';
  assert.deepEqual(readTerms([], pasted), ['madigan', 'herringer kiss gallery']);
  assert.deepEqual(readTerms([], 'Altafor\n\nmadigan\n'), ['altafor', 'madigan']);
  assert.deepEqual(readTerms(['ATP', ' atp '], ''), ['atp']);
});
