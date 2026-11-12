import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readPublishedPicks } from '../src/content/cwPicks';
import { blockers, buildPicksFile, CHECK_ORDER, publicPick, readVetting, untilFor, type Vetting } from '../src/lib/pickVetting';

const dated = (d: string) => Object.fromEntries(CHECK_ORDER.map(k => [k, { date: d, note: 'secret note' }]));
const ready = (over: Partial<Vetting> = {}): Vetting => ({
  service: 'plumbing', place: 'knight-plumbing', placeName: 'Knight Plumbing', checks: dated('2026-11-10'),
  why: 'Family-run since 1970 and answered our test call at 9 pm.', status: 'live', updatedAt: 1, ...over,
});

describe('pick vetting desk', () => {
  it('lapses six months after the oldest check', () => {
    assert.equal(untilFor({ checks: { ...dated('2026-11-10'), licence: { date: '2026-10-01' } } }), '2027-04-01');
    assert.equal(untilFor({ checks: { licence: { date: '2026-10-01' } } }), null);
  });

  it('blocks a missing check, a future date, a thin why or an expired vet', () => {
    assert.deepEqual(blockers(ready(), '2026-11-12'), []);
    const { wcb: _w, ...six } = dated('2026-11-10');
    assert.match(blockers(ready({ checks: six }), '2026-11-12')[0], /1 check not dated: WCB/);
    assert.equal(blockers(ready({ checks: dated('2026-11-20') }), '2026-11-12').length, 1);
    assert.match(blockers(ready({ why: 'Good.' }), '2026-11-12')[0], /why/);
    assert.match(blockers(ready(), '2027-06-01').join(' '), /six months/);
  });

  it('publishes dates, company and why, never notes, and only when live', () => {
    const p = publicPick(ready(), '2026-11-12')!;
    assert.equal(p.place, 'Knight Plumbing');
    assert.equal(p.until, '2027-05-10');
    assert.equal(p.checks.pledge, '2026-11-10');
    assert.ok(!JSON.stringify(p).includes('secret'));
    assert.equal(publicPick(ready({ status: 'paused' }), '2026-11-12'), null);
    assert.equal(publicPick(ready({ status: 'vetting' }), '2026-11-12'), null);
    const file = buildPicksFile([ready(), ready({ service: 'electrical', status: 'paused' })], Date.parse('2026-11-12T18:00:00Z'));
    assert.deepEqual(Object.keys(file.picks), ['plumbing']);
  });

  it('reads untrusted rows and keeps notes on undated checks', () => {
    const v = readVetting('plumbing', { place: 'k', placeName: 'K', status: 'nope', checks: { licence: { date: 'soon', note: 'asked' }, wcb: { date: '2026-11-01' } } })!;
    assert.equal(v.status, 'vetting');
    assert.deepEqual(v.checks.licence, { date: '', note: 'asked' });
    assert.equal(v.checks.wcb?.date, '2026-11-01');
  });

  it('the site drops a malformed published Pick', () => {
    const good = publicPick(ready(), '2026-11-12')!;
    const picks = readPublishedPicks({ picks: { plumbing: good, electrical: { ...good, checks: { ...good.checks, wcb: '' } }, roofing: null } });
    assert.deepEqual(Object.keys(picks), ['plumbing']);
  });
});
