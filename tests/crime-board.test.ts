import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCrimeBoard, isCitySignal, isSafety311, memberMapLifetimeMs, readCrimeBoard, sameStory, tidyIncidentText } from '../src/lib/crimeBoard';
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
      inc({ id: 'member', title: 'Car broken into overnight', authorUid: 'abc', anonymous: true, name: 'Pat' }),
      inc({ id: '311', source_type: 'calgary_open_data', data_source: 'official' }),
      inc({ id: 'demo', data_source: 'demo', authorUid: 'demo' }),
      inc({ id: 'hidden', authorUid: 'abc', visibility: 'hidden' } as unknown as Partial<Incident>),
      inc({ id: 'old', source_type: 'calgary_police_crime', data_source: 'official', timestamp: NOW - 70 * DAY }),
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
    assert.ok(isCitySignal({ category: 'crime', source_type: 'calgary_open_data', data_source: 'official', title: 'Graffiti reported in Beltline' }));
    assert.ok(!isCitySignal({ category: 'crime', source_type: 'calgary_open_data', data_source: 'official', title: 'Disturbance reported in Beltline' }));
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

  it('puts neighbours’ 311 safety reports on the board, not graffiti or vehicles', () => {
    const board = buildCrimeBoard([
      inc({ id: 'dist', title: 'Disturbance reported in Forest Lawn', source_type: 'calgary_open_data', data_source: 'official' }),
      inc({ id: 'vand', title: 'Vandalism reported in Beltline', source_type: 'calgary_open_data', data_source: 'official' }),
      inc({ id: 'transit', title: 'Transit safety concern reported in Downtown Commercial Core', source_type: 'calgary_open_data', data_source: 'official' }),
      inc({ id: 'graf', title: 'Graffiti reported in Beltline', source_type: 'calgary_open_data', data_source: 'official' }),
      inc({ id: 'car', title: 'Abandoned or problem vehicle reported in Beltline', source_type: 'calgary_open_data', data_source: 'official' }),
    ], NOW);
    assert.deepEqual(board.entries.map((e) => e.id).sort(), ['dist', 'transit', 'vand']);
    assert.ok(isSafety311({ category: 'crime', source_type: 'calgary_open_data', title: 'Derelict or unsecured property reported in Ogden' }));
  });

  it('keeps a neighbour’s post off the board when it reads as no crime at all', () => {
    const board = buildCrimeBoard([
      inc({ id: 'scream', title: 'Nighttime Screamer', authorUid: 'abc' }),
      inc({ id: 'late', title: 'CTrain Is late', authorUid: 'abc' }),
      inc({ id: 'bike', title: 'stolen bike :(', authorUid: 'abc' }),
      inc({ id: 'prowl', title: 'Sketchy guy prowling around', authorUid: 'abc' }),
    ], NOW);
    assert.deepEqual(board.entries.map((e) => e.id).sort(), ['bike', 'prowl']);
  });

  it('folds three newsrooms on one fire, and a release and its update, into one pin', () => {
    const news = { source_type: 'news_rss', data_source: 'official', category: 'emergency', neighborhood: 'Southeast Calgary' } as const;
    const board = buildCrimeBoard([
      inc({ ...news, id: 'ctv', title: 'Fire tears through southeast Calgary strip mall', source_name: 'CTV News Calgary', timestamp: NOW - 3 * 3600_000 }),
      inc({ ...news, id: 'global', title: 'Calgary fire crews battle blaze outside southeast Calgary business', source_name: 'Global News Calgary', timestamp: NOW - 4 * 3600_000 }),
      inc({ ...news, id: 'city', title: 'Early morning fire in SE Calgary, &#8216;spread into the building&#8217;', source_name: 'CityNews Calgary', timestamp: NOW - 5 * 3600_000 }),
      inc({ id: 'thi', title: 'Missing person - Thi', source_type: 'calgary_police_crime', data_source: 'official', neighborhood: 'Forest Lawn', timestamp: NOW - 3 * DAY }),
      inc({ id: 'thi2', title: 'Update #1: Missing person – Thi/Eva/Trang', source_type: 'calgary_police_crime', data_source: 'official', neighborhood: 'Forest Lawn', timestamp: NOW - 1 * DAY }),
      inc({ id: 'stab1', title: 'Police investigate fatal stabbing', source_type: 'calgary_police_crime', data_source: 'official', neighborhood: 'Southeast Calgary', lat: 50.975, lng: -113.98, timestamp: NOW - 4 * DAY }),
      inc({ id: 'stab2', title: 'Update #3: Police investigate fatal stabbing', source_type: 'calgary_police_crime', data_source: 'official', neighborhood: 'Downtown', lat: 51.045, lng: -114.06, timestamp: NOW - 1 * DAY }),
    ], NOW);
    assert.deepEqual(board.entries.map((e) => e.id).sort(), ['ctv', 'stab1', 'stab2', 'thi2']);
    const fire = board.entries.find((e) => e.id === 'ctv')!;
    assert.equal(fire.related_count, 3);
    assert.deepEqual(fire.related_ids, ['global', 'city']);
    assert.deepEqual(fire.related_sources, ['CTV News Calgary', 'Global News Calgary', 'CityNews Calgary']);
    assert.equal(board.entries.find((e) => e.id === 'thi2')!.related_count, 2);
  });

  it('never folds two neighbours’ reports together', () => {
    const a = inc({ id: 'a', title: 'Car break in', authorUid: 'abc' });
    const b = inc({ id: 'b', title: 'Car break in', authorUid: 'def' });
    assert.equal(sameStory(a, b), false);
  });

  it('decodes entities a feed left in a headline', () => {
    const fixed = tidyIncidentText({ title: '&#8216;Got ripped off&#8217;: Calgary woman', description: 'A &amp; B' });
    assert.equal(fixed.title, '‘Got ripped off’: Calgary woman');
    assert.equal(fixed.description, 'A & B');
  });
});
