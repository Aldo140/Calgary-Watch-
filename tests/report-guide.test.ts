import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { areaPulse, reportGuide, reportOrigin } from '../src/lib/reportGuide';
import type { Incident } from '../src/types';

const base = {
  id: 'a', title: 'Bike stolen from building parkade', description: 'Lock cut overnight.', category: 'crime',
  neighborhood: 'Beltline', lat: 51.04, lng: -114.07, timestamp: Date.now(), name: 'Neighbour',
  verified_status: 'unverified', report_count: 1, visibility: 'public',
} as unknown as Incident;

describe('report guide', () => {
  it('names every origin', () => {
    assert.equal(reportOrigin(base), 'neighbour');
    assert.equal(reportOrigin({ ...base, data_source: 'demo' }), 'example');
    assert.equal(reportOrigin({ ...base, data_source: 'official', source_type: 'calgary_police_crime' }), 'police');
    assert.equal(reportOrigin({ ...base, data_source: 'official', source_type: 'news_rss' }), 'news');
    assert.equal(reportOrigin({ ...base, data_source: 'official', source_type: 'calgary_open_data' }), 'city311');
    assert.equal(reportOrigin({ ...base, data_source: 'official', source_type: 'enmax_power_outage' }), 'feed');
  });

  it('gives every category steps and a call, and links a matching safety guide', () => {
    for (const category of ['crime', 'traffic', 'infrastructure', 'weather', 'emergency']) {
      const g = reportGuide({ ...base, title: 'Something happened', description: '', category } as Incident);
      assert.ok(g.steps.length >= 2 && g.steps.length <= 3, category);
      assert.ok(g.calls.length >= 1, category);
      assert.ok(g.what.length > 20, category);
    }
    const theft = reportGuide(base);
    assert.equal(theft.topic?.path, '/safety/theft');
  });

  it('sends after-the-fact police and news to tips, and examples to no calls', () => {
    const police = reportGuide({ ...base, title: 'Man charged after stabbing', data_source: 'official', source_type: 'calgary_police_crime' } as Incident);
    assert.match(police.calls[0].label, /1-800-222-8477/);
    assert.equal(reportGuide({ ...base, data_source: 'demo' } as Incident).calls.length, 0);
  });

  it('counts other reports in the same community in the last day', () => {
    const now = Date.now();
    const all = [
      { id: 'a', neighborhood: 'Beltline', timestamp: now },
      { id: 'b', neighborhood: 'beltline', timestamp: now - 3600e3 },
      { id: 'c', neighborhood: 'Beltline', timestamp: now - 30 * 3600e3 },
      { id: 'd', neighborhood: 'Mission', timestamp: now },
    ];
    assert.equal(areaPulse(base, all, now), 1);
    assert.equal(areaPulse({ ...base, neighborhood: 'Calgary' }, all, now), 0);
  });
});
