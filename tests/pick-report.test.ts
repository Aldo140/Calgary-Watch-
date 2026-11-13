/** Admin tallies for CalgaryWatch Picks (src/lib/pickReport.ts): counts, never people. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contactLine, tallyPickContacts } from '../src/lib/pickReport';

const NOW = Date.parse('2026-11-12T18:00:00Z');
const DAY = 86_400_000;
const ev = (list: string, place: string, contact: 'call' | 'site', ago: number, extra: Record<string, unknown> = {}) => ({ name: 'pick_contact', list, place, contact, via: 'search', followup: 'no', ts: NOW - ago * DAY, ...extra });

describe('pick contact tally', () => {
  it('counts per service and company inside the window, busiest first, with real names', () => {
    const t = tallyPickContacts([
      ev('plumbing', 'knight-plumbing', 'call', 1), ev('plumbing', 'knight-plumbing', 'site', 2, { followup: 'yes', via: 'desk' }),
      ev('plumbing', 'mr-mikes-plumbing', 'call', 3), ev('plumbing', 'knight-plumbing', 'call', 40),
      ev('junk', 'someone', 'call', 5), ev('nope', 'x', 'call', 1), { list: 'plumbing', place: 'knight-plumbing' },
    ], { now: NOW, days: 30 });
    assert.deepEqual(t.map(s => [s.id, s.contacts]), [['plumbing', 3], ['junk', 1]]);
    const k = t[0].companies[0];
    assert.equal(k.name, 'Knight Plumbing');
    assert.deepEqual([k.contacts, k.calls, k.sites, k.checkIns], [2, 1, 1, 1]);
    assert.deepEqual(t[0].bySource, { search: 2, desk: 1 });
    assert.equal(t[1].companies[0].name, 'someone', 'unknown companies keep their key');
  });
  it('writes an outreach line from the counts alone', () => {
    const [s] = tallyPickContacts([ev('plumbing', 'knight-plumbing', 'call', 1)], { now: NOW });
    assert.equal(contactLine(s.companies[0]), '1 Calgarian reached Knight Plumbing from CalgaryWatch in the last 30 days (1 call, 0 website visits).');
  });
});
