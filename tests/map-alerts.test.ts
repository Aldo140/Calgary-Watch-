import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertAreaLabel, alertHazard, buildAlertDeck, isCityAlertRecord, splitCityAlerts } from '../src/lib/mapAlerts';
import { quadrantOf, summarizeQuadrants } from '../src/lib/cityQuadrants';
import type { Incident } from '../src/types';

const H = 3600e3;
const now = Date.UTC(2026, 9, 24, 20);
function inc(p: Partial<Incident>): Incident {
  return {
    id: 'x', title: 't', description: 'd', category: 'crime', neighborhood: 'Beltline', lat: 51.04, lng: -114.07,
    timestamp: now - H, name: 'n', verified_status: 'unverified', report_count: 1, ...p,
  } as Incident;
}

test('official weather, air, river and emergency alerts leave the report list; neighbours keep theirs', () => {
  const ec = inc({ id: 'ec', category: 'weather', data_source: 'official', source_type: 'env_canada_weather', title: 'Snowfall warning in effect' });
  const aea = inc({ id: 'aea', category: 'emergency', data_source: 'official', source_type: 'alberta_emergency_alert', title: 'Amber Alert' });
  const member = inc({ id: 'm', category: 'weather', title: 'Black ice on 17 Ave' });
  const demo = inc({ id: 'd', category: 'weather', data_source: 'demo' });
  const police = inc({ id: 'p', data_source: 'official', source_type: 'calgary_police_crime' });
  assert.equal(isCityAlertRecord(member), false);
  assert.equal(isCityAlertRecord(demo), false);
  const { reports, alertRecords } = splitCityAlerts([ec, aea, member, demo, police]);
  assert.deepEqual(reports.map((i) => i.id), ['m', 'd', 'p']);
  assert.deepEqual(alertRecords.map((i) => i.id), ['ec', 'aea']);
});

test('the deck ranks emergencies first, merges forecast zones and drops towns outside Calgary', () => {
  const deck = buildAlertDeck([
    inc({ id: 'wx-northwest-calgary-71', category: 'weather', data_source: 'official', title: 'Snow', neighborhood: 'Northwest Calgary', description: 'Light snow. (Northwest Calgary, -3°C)' }),
    inc({ id: 'wx-southeast-calgary-71', category: 'weather', data_source: 'official', title: 'Snow', neighborhood: 'Southeast Calgary' }),
    inc({ id: 'wx-airdrie-71', category: 'weather', data_source: 'official', title: 'Snow', neighborhood: 'Airdrie' }),
    inc({ id: 'wx-downtown-calgary-48', category: 'weather', data_source: 'official', title: 'Freezing Fog Warning', neighborhood: 'Downtown Calgary' }),
    inc({ id: 'ec', category: 'weather', data_source: 'official', source_type: 'env_canada_weather', title: 'Snowfall warning in effect', expires_at: now + 5 * H }),
    inc({ id: 'aea', category: 'emergency', data_source: 'official', source_type: 'alberta_emergency_alert', title: 'Amber Alert' }),
    inc({ id: 'old', category: 'weather', data_source: 'official', source_type: 'env_canada_weather', title: 'Wind warning', expires_at: now - H }),
  ], now);
  assert.deepEqual(deck.map((a) => a.kind), ['emergency', 'warning', 'conditions', 'conditions']);
  const snow = deck.find((a) => a.title === 'Snow')!;
  assert.deepEqual(snow.areas, ['Northwest Calgary', 'Southeast Calgary']);
  assert.equal(snow.body, 'Light snow.');
  assert.equal(snow.official, false);
  assert.equal(snow.source, 'Open-Meteo forecast model');
  // Only issued alerts may call themselves a warning.
  assert.ok(deck.some((a) => a.title === 'Freezing Fog'));
  assert.equal(deck[1].hazard, 'snow');
});

test('hazards and area labels', () => {
  assert.equal(alertHazard('Extreme cold warning'), 'cold');
  assert.equal(alertHazard('Wind chill warning'), 'cold');
  assert.equal(alertHazard('Wind warning'), 'wind');
  assert.equal(alertHazard('Freezing rain'), 'ice');
  assert.equal(alertAreaLabel(['Northwest Calgary', 'Downtown Calgary']), 'NW Calgary, Downtown');
  assert.equal(alertAreaLabel(['a', 'b', 'c', 'd']), 'Across Calgary');
});

test('quadrants follow Calgary addresses: downtown and Beltline are SW', () => {
  assert.equal(quadrantOf(51.046, -114.065), 'SW');
  assert.equal(quadrantOf(51.039, -114.072), 'SW');
  assert.equal(quadrantOf(51.053, -114.088), 'NW');
  assert.equal(quadrantOf(51.041, -113.973), 'SE');
  assert.equal(quadrantOf(51.125, -113.95), 'NE');
  const s = summarizeQuadrants([
    inc({ id: 'a', lat: 50.877, lng: -113.953, title: 'Seton break-in' }),
    inc({ id: 'b', lat: 50.877, lng: -113.953, category: 'traffic', timestamp: now }),
    inc({ id: 'c', lat: 53.5, lng: -113.5, source_type: 'edmonton_open_data' }),
  ]);
  const se = s.find((q) => q.quadrant === 'SE')!;
  assert.equal(se.total, 2);
  assert.equal(se.crime, 1);
  assert.equal(s.reduce((n, q) => n + q.total, 0), 2);
});
