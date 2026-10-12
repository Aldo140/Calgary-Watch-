import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LOCAL_SERVICES, SERVICE_GROUPS, offersService, serviceById } from '../src/data/localServices';
import { LOCAL_CATEGORIES } from '../src/lib/discovery';

describe('local services directory', () => {
  it('has unique ids that never collide with a Local category', () => {
    const ids = LOCAL_SERVICES.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.ok(!LOCAL_CATEGORIES.includes(id), id);
  });
  it('every service has a group, trades, a tip and valid peak months', () => {
    for (const s of LOCAL_SERVICES) {
      assert.ok(SERVICE_GROUPS[s.group], s.id);
      assert.ok(s.trades.length && s.match.length && s.tip.length > 20, s.id);
      assert.ok(s.peak.every(m => m >= 1 && m <= 12), s.id);
    }
  });
  it('matches a listing by its tags or services', () => {
    const plumbing = serviceById('plumbing')!;
    assert.equal(offersService({ tags: ['Plumbing', 'emergency'] }, plumbing), true);
    assert.equal(offersService({ services: ['drain cleaning'] }, plumbing), true);
    assert.equal(offersService({ tags: ['coffee'] }, plumbing), false);
  });
});
