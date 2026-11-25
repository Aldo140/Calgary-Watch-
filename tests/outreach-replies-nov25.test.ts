import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('PAWSitively Natural Black Friday sale', () => {
  it('runs Nov 25 to 30 at the 4 St SW shop', async () => {
    const { readFileSync } = await import('node:fs');
    const sources = JSON.parse(readFileSync(new URL('../scripts/discovery/reviewed-sources.json', import.meta.url), 'utf8'));
    const sale = sources.find((s: { source: { id: string } }) => s.source.id === 'pawsitively-natural').records[0].input;
    assert.equal(sale.start, '2026-11-25T09:00:00-06:00');
    assert.equal(sale.end, '2026-11-30T19:00:00-06:00');
    assert.match(sale.address, /2100 4 St SW/);
  });
});

describe('Kane Medical Aesthetics', () => {
  it('is set up to go live once the clinic claims it', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['../src/content/editorial-inventory.json', '../src/generated/discovery-index.json']) {
      const { entities } = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
      const kane = entities.find((e: { id: string }) => e.id === 'biz-kane-medical-aesthetics');
      assert.equal(kane.awaitingClaim, true);
      assert.equal(kane.email, 'info@kanemedicalaesthetics.com');
    }
  });
});
