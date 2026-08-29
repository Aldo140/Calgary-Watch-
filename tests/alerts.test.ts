/**
 * Alert eligibility — the pure core of Phase 3.
 *
 * Not everything near you is worth interrupting a day for. selectAlerts is the
 * gate: emergencies always get through; a neighbour's report gets through when
 * it falls in a watched zone and an allowed category; routine machine feeds
 * never do; and quiet hours silence everything except an emergency. Pure, so
 * the policy is testable without a scheduler or a device.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Incident } from '../src/types/index.ts';
import {
  selectAlerts,
  isWithinQuietHours,
  zoneMatchesIncident,
  type AlertPreferences,
  type WatchZone,
} from '../src/lib/alerts.ts';

const NOW = 1_700_000_000_000;
const HOME_ZONE: WatchZone = { id: 'home', label: 'Home', lat: 51.0447, lng: -114.0719, radiusM: 2000 };

function inc(over: Partial<Incident> & { id: string }): Incident {
  return {
    title: 'Report',
    description: '',
    category: 'crime',
    neighborhood: 'Beltline',
    lat: 51.0447,
    lng: -114.0719,
    timestamp: NOW - 60_000,
    name: 'Ana',
    verified_status: 'unverified',
    report_count: 1,
    data_source: 'community',
    ...over,
  } as Incident;
}

function prefs(over: Partial<AlertPreferences> = {}): AlertPreferences {
  return {
    zones: [HOME_ZONE],
    quietHours: null,
    categories: [],
    emergencyAlways: true,
    ...over,
  };
}

describe('zoneMatchesIncident', () => {
  it('matches within a coordinate radius', () => {
    assert.equal(zoneMatchesIncident(HOME_ZONE, inc({ id: 'a' })), true);
  });
  it('rejects outside the radius', () => {
    assert.equal(zoneMatchesIncident(HOME_ZONE, inc({ id: 'b', lat: 51.3, lng: -114.5 })), false);
  });
  it('falls back to a neighbourhood name when a zone has no coordinates', () => {
    const named: WatchZone = { id: 'work', label: 'Work', neighborhood: 'Inglewood', radiusM: 0 };
    assert.equal(zoneMatchesIncident(named, inc({ id: 'c', neighborhood: 'Inglewood' })), true);
    assert.equal(zoneMatchesIncident(named, inc({ id: 'd', neighborhood: 'Beltline' })), false);
  });
});

describe('isWithinQuietHours', () => {
  const at = (h: number) => NOW - (NOW % 86_400_000) + h * 3_600_000; // h:00 UTC
  it('is false when quiet hours are off', () => {
    assert.equal(isWithinQuietHours(prefs({ quietHours: null }), at(3)), false);
  });
  it('handles an overnight window that crosses midnight', () => {
    const p = prefs({ quietHours: { startHour: 22, endHour: 7 } });
    assert.equal(isWithinQuietHours(p, at(23)), true);
    assert.equal(isWithinQuietHours(p, at(3)), true);
    assert.equal(isWithinQuietHours(p, at(12)), false);
  });
  it('handles a daytime window', () => {
    const p = prefs({ quietHours: { startHour: 9, endHour: 17 } });
    assert.equal(isWithinQuietHours(p, at(12)), true);
    assert.equal(isWithinQuietHours(p, at(20)), false);
  });
});

describe('selectAlerts', () => {
  it('always alerts on an emergency, even outside every zone', () => {
    const out = selectAlerts({
      incidents: [inc({ id: 'e', category: 'emergency', lat: 51.4, lng: -114.9 })],
      prefs: prefs(),
      since: NOW - 3_600_000,
      now: NOW,
    });
    assert.deepEqual(out.map((i) => i.id), ['e']);
  });

  it('alerts on a community report inside a zone', () => {
    const out = selectAlerts({
      incidents: [inc({ id: 'c' })],
      prefs: prefs(),
      since: NOW - 3_600_000,
      now: NOW,
    });
    assert.deepEqual(out.map((i) => i.id), ['c']);
  });

  it('ignores routine machine feeds even inside a zone', () => {
    const out = selectAlerts({
      incidents: [inc({ id: 't', category: 'traffic', data_source: 'system', source_type: '511_alberta_traffic' })],
      prefs: prefs(),
      since: NOW - 3_600_000,
      now: NOW,
    });
    assert.equal(out.length, 0);
  });

  it('respects the category filter for non-emergencies', () => {
    const out = selectAlerts({
      incidents: [inc({ id: 'crime', category: 'crime' }), inc({ id: 'weather', category: 'weather', data_source: 'community' })],
      prefs: prefs({ categories: ['crime'] }),
      since: NOW - 3_600_000,
      now: NOW,
    });
    assert.deepEqual(out.map((i) => i.id), ['crime']);
  });

  it('excludes anything older than since or in the future', () => {
    const out = selectAlerts({
      incidents: [
        inc({ id: 'old', timestamp: NOW - 10 * 3_600_000 }),
        inc({ id: 'future', timestamp: NOW + 3_600_000 }),
        inc({ id: 'fresh', timestamp: NOW - 60_000 }),
      ],
      prefs: prefs(),
      since: NOW - 3_600_000,
      now: NOW,
    });
    assert.deepEqual(out.map((i) => i.id), ['fresh']);
  });

  it('suppresses non-emergency alerts during quiet hours but lets emergencies through', () => {
    const nowQuiet = NOW - (NOW % 86_400_000) + 23 * 3_600_000; // 23:00 UTC
    const out = selectAlerts({
      incidents: [inc({ id: 'c' }), inc({ id: 'e', category: 'emergency' })],
      prefs: prefs({ quietHours: { startHour: 22, endHour: 7 } }),
      since: nowQuiet - 3_600_000,
      now: nowQuiet,
    });
    assert.deepEqual(out.map((i) => i.id), ['e']);
  });
});
