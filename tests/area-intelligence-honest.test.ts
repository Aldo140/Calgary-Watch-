import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAreaIntelligence } from '../src/services/mockData.ts';

const NOW = Date.UTC(2026, 9, 21, 4, 0, 0);
const HOUR = 60 * 60 * 1000;

test('area baseline never invents figures', () => {
  const a = getAreaIntelligence('Beltline', [], NOW);
  const b = getAreaIntelligence('Beltline', [], NOW);
  assert.deepEqual(a, b);
  assert.equal(a.activeIncidents, 0);
  assert.deepEqual(a.monthlyTrends, []);
  assert.deepEqual(a.insights, []);
  assert.equal(a.liveOverlayInsight, '');
});

test('area baseline counts only real reports in that community', () => {
  const incidents = [
    { neighborhood: 'Beltline', timestamp: NOW - HOUR },
    { neighborhood: 'beltline', timestamp: NOW - 5 * HOUR },
    { neighborhood: 'Beltline', timestamp: NOW - 30 * HOUR },
    { neighborhood: 'Mission', timestamp: NOW - HOUR },
  ];
  const a = getAreaIntelligence('Beltline', incidents, NOW);
  assert.equal(a.activeIncidents, 2);
  assert.match(a.liveOverlayInsight, /^1 report on the map from Beltline in the last 2 hours\.$/);
});
