import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { curatePersonalStories, curateTrafficReports } from '../src/lib/reportCuration.js';
import type { Incident } from '../src/types/index.js';

const NOW = Date.UTC(2026, 7, 28, 8);
const mapPage = readFileSync('src/pages/MapPage.tsx', 'utf8');

function incident(id: string, category: Incident['category'], over: Partial<Incident> = {}): Incident {
  return {
    id,
    title: `${category} report ${id}`,
    description: 'A specific report with enough local detail to help a resident understand what changed.',
    category,
    neighborhood: 'Beltline',
    lat: 51.04,
    lng: -114.07,
    timestamp: NOW - 3_600_000,
    name: 'City source',
    verified_status: 'community_confirmed',
    report_count: 1,
    visibility: 'public',
    data_source: 'official',
    ...over,
  } as Incident;
}

describe('personal report curation', () => {
  it('builds two lead stories and five additional crimes without traffic', () => {
    const items = [
      incident('emergency', 'emergency'),
      ...Array.from({ length: 7 }, (_, index) => incident(`crime-${index}`, 'crime')),
      ...Array.from({ length: 8 }, (_, index) => incident(`traffic-${index}`, 'traffic')),
    ].map((entry, index) => ({ incident: entry, distanceM: 100 + index * 20 }));
    const result = curatePersonalStories(items, NOW);
    assert.equal(result.leads.length, 2);
    assert.equal(result.crimes.length, 5);
    assert.equal([...result.leads, ...result.crimes].some((item) => item.incident.category === 'traffic'), false);
  });

  it('favours specific verified stories over generic infrastructure rows', () => {
    const result = curatePersonalStories([
      { incident: incident('generic', 'infrastructure', { verified_status: 'unverified', description: 'Issue reported.' }), distanceM: 40 },
      { incident: incident('wanted', 'crime', { title: 'Suspect wanted after break-in', source_type: 'calgary_police_crime' }), distanceM: 500 },
    ], NOW);
    assert.equal(result.leads[0].incident.id, 'wanted');
  });

  it('does not promote thin unverified filler into a lead story', () => {
    const result = curatePersonalStories([
      { incident: incident('thin', 'infrastructure', { verified_status: 'unverified', description: 'Issue reported.' }), distanceM: 20 },
    ], NOW);
    assert.equal(result.leads.length, 0);
  });
});

describe('traffic report curation', () => {
  it('accepts 15% fewer traffic rows', () => {
    const rows = Array.from({ length: 60 }, (_, index) => incident(`traffic-${index}`, 'traffic'));
    assert.equal(curateTrafficReports(rows).length, 51);
  });

  it('keeps trip-changing closures ahead of routine stalled vehicles', () => {
    const selected = curateTrafficReports([
      incident('stalled-new', 'traffic', { title: 'Stalled Vehicle', timestamp: NOW }),
      incident('stalled-old', 'traffic', { title: 'Stalled Vehicle', timestamp: NOW - 1 }),
      incident('closure', 'traffic', { title: 'Road Closure', timestamp: NOW - 10_000 }),
    ], 0.67);
    assert.equal(selected.length, 2);
    assert.equal(selected[0].id, 'closure');
  });

  it('applies the reduction after all API traffic sources are merged', () => {
    assert.match(mapPage, /const apiTraffic = combined\.filter/);
    assert.match(mapPage, /const keptTrafficIds = new Set\(curateTrafficReports\(apiTraffic\)/);
    assert.match(mapPage, /incident\.data_source !== 'official'/);
  });
});

describe('mobile personalized report entry', () => {
  it('loads cameras when the briefing opens and uses a modal phone sheet', () => {
    assert.match(mapPage, /showCameras \|\| briefingOpen/);
    assert.match(mapPage, /aria-labelledby="mobile-notifications-title"/);
    assert.match(mapPage, /max-h-\[82dvh\]/);
  });
});
