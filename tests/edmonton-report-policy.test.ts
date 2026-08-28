import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  classifyEdmontonBylaw,
  classifyEdmontonTraffic,
  curateEdmontonReports,
} from '../src/hooks/useEdmontonOpenData';
import type { Incident, IncidentCategory } from '../src/types';

function incident(id: string, category: IncidentCategory, timestamp: number): Incident {
  return {
    id,
    title: id,
    description: id,
    category,
    neighborhood: 'Edmonton',
    lat: 53.5461,
    lng: -113.4938,
    timestamp,
    email: 'opendata@edmonton.ca',
    name: 'City of Edmonton Open Data',
    anonymous: false,
    verified_status: 'community_confirmed',
    report_count: 1,
    data_source: 'official',
    source_type: 'edmonton_open_data',
  };
}

test('Edmonton intake keeps 50 percent and prioritizes crime', () => {
  const rows = [
    incident('crime-old', 'crime', 10),
    incident('crime-new', 'crime', 20),
    incident('weather', 'weather', 30),
    incident('infrastructure', 'infrastructure', 40),
    incident('traffic', 'traffic', 50),
    incident('emergency', 'emergency', 60),
  ];

  assert.deepEqual(
    curateEdmontonReports(rows).map(({ id }) => id),
    ['crime-new', 'crime-old', 'weather'],
  );
  assert.equal(rows.length, 6, 'curation must not mutate the fetched collection');
});

test('Edmonton bylaw and disruption labels do not create emergency alerts', () => {
  assert.equal(classifyEdmontonBylaw('Community Standards', 'Fireworks complaint'), 'crime');
  assert.equal(classifyEdmontonTraffic('Road Work', 'Utility Emergency'), 'infrastructure');
});

test('desktop and mobile feeds share the Edmonton-free list while the map keeps its own list', () => {
  const source = readFileSync(new URL('../src/pages/MapPage.tsx', import.meta.url), 'utf8');

  assert.match(source, /const localFeed = incidents\.filter\(\(incident\) => incident\.source_type !== 'edmonton_open_data'\)/);
  assert.match(source, /<Sidebar[\s\S]*?incidents=\{feedIncidents\}/);
  assert.match(source, /<MobileMapSheet[\s\S]*?incidents=\{feedIncidents\}/);
  assert.match(source, /<Map[\s\S]*?incidents=\{mapIncidents\}/);
});
