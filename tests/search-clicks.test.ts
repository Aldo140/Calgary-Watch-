import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clickAction, clickRef, readClickRecords, reachedBusiness, summarizeClicks } from '../src/lib/searchClicks';

const O = 'https://calgarywatch.ca';

test('a click means what its link does', () => {
  assert.equal(clickAction('tel:+14035551234', O, false), 'call');
  assert.equal(clickAction('mailto:info@x.ca', O, true), 'email');
  assert.equal(clickAction('https://www.google.com/maps/dir/?api=1&destination=x', O, true), 'directions');
  assert.equal(clickAction('https://knightplumbing.ca/', O, true), 'site');
  assert.equal(clickAction('/claim/biz-urban-piping', O, false), 'claim');
  assert.equal(clickAction('/local/paradise-lanes', O, false), 'open');
  assert.equal(clickAction('https://calgarywatch.ca/events/some-show', O, false), 'open');
  // On a profile, other listings and site pages are browsing, not a lead.
  assert.equal(clickAction('/local/paradise-lanes', O, true), null);
  assert.equal(clickAction('/search?q=x', O, false), null);
  assert.equal(clickAction('#lp-programme', O, true), null);
  assert.equal(clickAction('https://www.facebook.com/sharer/sharer.php?u=x', O, true), null);
  assert.equal(clickAction('javascript:void(0)', O, true), null);
});

test('stored refs are ids or paths, nothing else', () => {
  assert.equal(clickRef('biz-urban-piping'), 'biz-urban-piping');
  assert.equal(clickRef('/local/urban-piping'), '/local/urban-piping');
  assert.equal(clickRef('a b <script>'), null);
});

test('only well-formed search_click events are read back', () => {
  const rows = readClickRecords([
    { name: 'search_click', q: 'Plumber', ref: 'biz-a', act: 'call', from: 'search', ts: 5 },
    { name: 'search_click', q: 'x@y.ca', ref: 'biz-a', act: 'open', ts: 6 },
    { name: 'search_click', ref: 'biz-a', act: 'hack', ts: 7 },
    { name: 'pick_contact', ref: 'biz-a', act: 'call', ts: 8 },
    null,
  ]);
  assert.deepEqual(rows, [
    { q: 'plumber', ref: 'biz-a', act: 'call', from: 'search', ts: 5 },
    { q: '', ref: 'biz-a', act: 'open', from: 'search', ts: 6 },
  ]);
});

test('terms and businesses add up, and typeahead paths join profile ids', () => {
  const clicks = [
    { q: 'plumber', ref: 'biz-knight', act: 'open', from: 'search', ts: 1 },
    { q: 'plumber', ref: 'biz-knight', act: 'call', from: 'profile', ts: 2 },
    { q: 'plumber', ref: '/local/urban', act: 'open', from: 'typeahead', ts: 3 },
    { q: '', ref: 'biz-urban', act: 'site', from: 'profile', ts: 4 },
    { q: 'bowling', ref: 'biz-lanes', act: 'open', from: 'search', ts: 5 },
  ] as const;
  const resolve = (r: string) => (r === 'biz-urban' ? '/local/urban' : r);
  const { terms, listings } = summarizeClicks(clicks, [{ q: 'plumber' }, { q: 'plumber' }, { q: 'bowling' }, { q: 'pho' }], resolve);
  assert.deepEqual(terms.map(t => [t.q, t.searches, t.counts.open, t.counts.call, t.listings]), [['plumber', 2, 2, 1, 2], ['bowling', 1, 1, 0, 1]]);
  const urban = listings.find(l => l.key === '/local/urban')!;
  assert.equal(urban.counts.open, 1); assert.equal(urban.counts.site, 1); assert.equal(urban.fromSearch, 1);
  assert.equal(reachedBusiness(listings[0].counts), 1);
  assert.equal(listings[0].key, 'biz-knight');
  assert.deepEqual(listings[0].terms, [{ q: 'plumber', n: 2 }]);
});
