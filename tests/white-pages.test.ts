import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sectionOf } from '../src/components/discovery/WhitePages';
import { cleanRecommendation } from '../src/lib/recommendationInput';

test('a place is filed under its own first category that has a section', () => {
  assert.equal(sectionOf({ categories: ['arts', 'services', 'shopping'] }), 'arts');
  assert.equal(sectionOf({ categories: ['shopping', 'food', 'services'] }), 'shopping');
  assert.equal(sectionOf({ categories: ['day-trip', 'markets'] }), 'out');
  assert.equal(sectionOf({ categories: [] }), 'out');
});

test('a recommendation needs a name, a way to check them and a reason', () => {
  const base = { businessName: '  Bow Plumbing ', kind: 'plumbing', contact: 'https://bowplumbing.ca', neighbourhood: '', why: 'Came out on a Sunday and fixed it.', creditAs: '' };
  const ok = cleanRecommendation(base);
  assert.equal(typeof ok, 'object');
  assert.equal((ok as { businessName: string }).businessName, 'Bow Plumbing');
  assert.equal(typeof cleanRecommendation({ ...base, businessName: ' ' }), 'string');
  assert.equal(typeof cleanRecommendation({ ...base, contact: '' }), 'string');
  assert.equal(typeof cleanRecommendation({ ...base, why: 'good' }), 'string');
});

test('the rules accept exactly the fields the client writes', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  const block = rules.slice(rules.indexOf('match /local_recommendations/'), rules.indexOf('match /listing_claims/'));
  const src = readFileSync('src/lib/localRecommendations.ts', 'utf8');
  for (const f of ['id', 'uid', 'businessName', 'kind', 'contact', 'neighbourhood', 'why', 'creditAs', 'status', 'createdAt']) {
    assert.ok(block.includes(`'${f}'`), `rules allow ${f}`);
  }
  assert.match(src, /status: 'new'/);
  assert.match(block, /status == 'new'/);
});
