import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MEMBER_VISITS } from '../src/data/memberVisits';
import inventory from '../src/content/editorial-inventory.json' with { type: 'json' };

const ids = new Set((inventory as { entities: { id: string }[] }).entities.map(e => e.id));

describe('member visits', () => {
  for (const [id, v] of Object.entries(MEMBER_VISITS)) {
    it(`${id} is sourced, honest and linked to a real profile`, () => {
      assert.ok(ids.has(id), 'profile exists');
      assert.match(v.on, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(v.sources.length > 0 && v.sources.every(s => s.url.startsWith('https://')), 'every visit cites its sources');
      assert.match(v.partnerLabel, /^In partnership with /);
      const text = [v.event, v.recommendation, ...v.about, ...v.impressions].join(' ').toLowerCase();
      assert.doesNotMatch(text, /\b(comp|complimentary|free tickets?)\b/, 'never mention comp tickets');
      // Impressions are only ever the member's own words, so a visit that didn't happen has none.
      if (!v.attended) assert.equal(v.impressions.length, 0);
    });
  }
});
