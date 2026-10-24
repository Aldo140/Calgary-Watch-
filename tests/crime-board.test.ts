import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCrimeBoard, isCitySignal, memberMapLifetimeMs, readCrimeBoard } from '../src/lib/crimeBoard';
import type { Incident } from '../src/types';

const NOW = Date.parse('2026-10-21T20:00:00Z');
const DAY = 86_400_000;
const base = { lat: 51.05, lng: -114.07, neighborhood: 'Beltline', description: '', verified_status: 'community_confirmed', report_count: 1, email: 'x@y', name: 'Someone', anonymous: false } as const;
const inc = (over: Partial<Incident>): Incident => ({ ...base, id: Math.random().toString(36).slice(2), title: 't', category: 'crime', timestamp: NOW - DAY, ...over }) as Incident;

describe('crime board', () => {
  it('keeps police, news crime and neighbour reports, and drops 311 and the example pulse', () => {
    const board = buildCrimeBoard([
      inc({ id: 'cps', source_type: 'calgary_police_crime', data_source: 'official', timestamp: NOW - 20 * DAY }),
      inc({ id: 'news', source_type: 'news_rss', data_source: 'official' }),
      inc({ id: 'member', authorUid: 'abc', anonymous: true, name: 'Pat' }),
      inc({ id: '311', source_type: 'calgary_open_data', data_source: 'official' }),
      inc({ id: 'demo', data_source: 'demo', authorUid: 'demo' }),
      inc({ id: 'hidden', authorUid: 'abc', visibility: 'hidden' } as Partial<Incident>),
      inc({ id: 'old', source_type: 'calgary_police_crime', data_source: 'official', timestamp: NOW - 40 * DAY }),
    ], NOW);
    assert.deepEqual(board.entries.map((e) => e.id).sort(), ['cps', 'member', 'news']);
    const member = board.entries.find((e) => e.id === 'member')!;
    assert.equal(member.member, true);
    assert.equal(member.name, 'Anonymous');
    assert.equal(member.email, '');
    assert.ok(readCrimeBoard(board, NOW + 60_000));
    assert.equal(readCrimeBoard(board, NOW + 13 * 60 * 60 * 1000), null);
  });

  it('treats City feeds as signals but never police, news crime or emergencies', () => {
    assert.ok(isCitySignal({ category: 'infrastructure', source_type: 'calgary_open_data', data_source: 'official' }));
    assert.ok(isCitySignal({ category: 'crime', source_type: 'calgary_open_data', data_source: 'official' }));
    assert.ok(!isCitySignal({ category: 'traffic', source_type: 'calgary_police_crime', data_source: 'official' }));
    assert.ok(!isCitySignal({ category: 'crime', source_type: 'news_rss', data_source: 'official' }));
    assert.ok(!isCitySignal({ category: 'emergency', source_type: 'enmax_power_outage', data_source: 'official' }));
    assert.ok(!isCitySignal({ category: 'traffic' }));
  });

  it('keeps neighbours’ crime reports a month and everything else they post five days', () => {
    assert.equal(memberMapLifetimeMs({ category: 'crime', authorUid: 'abc' }), 30 * DAY);
    assert.equal(memberMapLifetimeMs({ category: 'traffic', authorUid: 'abc' }), 5 * DAY);
    assert.equal(memberMapLifetimeMs({ category: 'crime', data_source: 'demo', authorUid: 'demo' }), 5 * DAY);
    assert.equal(memberMapLifetimeMs({ category: 'crime', data_source: 'official' }), null);
  });
});
