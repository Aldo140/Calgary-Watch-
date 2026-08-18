/**
 * PM2.5 banding and the incident it produces.
 *
 * The banding decides whether a health message appears on a public safety map,
 * so the thresholds are asserted at their exact boundaries rather than in the
 * middle of each range.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  airQualityToIncident,
  classifyPm25,
  isSevereAir,
  type AirZoneReading,
} from '../src/lib/airQuality.ts';

const CALGARY: AirZoneReading = { zone: 'Calgary', lat: 51.0447, lng: -114.0719, pm25: 30 };

describe('classifyPm25', () => {
  it('stays silent on clean air rather than announcing it', () => {
    assert.equal(classifyPm25(0), null);
    assert.equal(classifyPm25(11.9), null);
  });

  it('bands at the exact breakpoints, not near them', () => {
    assert.equal(classifyPm25(12)?.band, 'moderate');
    assert.equal(classifyPm25(34.9)?.band, 'moderate');
    assert.equal(classifyPm25(35)?.band, 'sensitive');
    assert.equal(classifyPm25(54.9)?.band, 'sensitive');
    assert.equal(classifyPm25(55)?.band, 'unhealthy');
    assert.equal(classifyPm25(149.9)?.band, 'unhealthy');
    assert.equal(classifyPm25(150)?.band, 'severe');
    assert.equal(classifyPm25(900)?.band, 'severe');
  });

  it('names who should act, not the chemistry', () => {
    assert.match(classifyPm25(40)!.advice, /asthma|older adults|children/i);
    assert.match(classifyPm25(200)!.advice, /indoors/i);
  });

  it('refuses values that cannot be a concentration', () => {
    assert.equal(classifyPm25(Number.NaN), null);
    assert.equal(classifyPm25(Number.POSITIVE_INFINITY), null);
    assert.equal(classifyPm25(-5), null);
  });
});

describe('isSevereAir', () => {
  it('treats only the top two bands as severe', () => {
    assert.equal(isSevereAir('good'), false);
    assert.equal(isSevereAir('moderate'), false);
    assert.equal(isSevereAir('sensitive'), false);
    assert.equal(isSevereAir('unhealthy'), true);
    assert.equal(isSevereAir('severe'), true);
  });
});

describe('airQualityToIncident', () => {
  const now = 1_700_000_000_000;

  it('produces nothing when the air is clean', () => {
    assert.equal(airQualityToIncident({ ...CALGARY, pm25: 4 }, now), null);
  });

  it('states the measured number so the claim can be checked', () => {
    const incident = airQualityToIncident(CALGARY, now)!;
    assert.match(incident.description, /30 µg\/m³/);
    assert.match(incident.description, /Calgary/);
  });

  it('never claims to be AQHI, which it does not compute', () => {
    const incident = airQualityToIncident({ ...CALGARY, pm25: 120, usAqi: 180 }, now)!;
    assert.doesNotMatch(incident.description, /AQHI/i);
    assert.doesNotMatch(incident.title, /AQHI/i);
  });

  it('carries through the provider\'s own US AQI when present, and omits it when not', () => {
    assert.match(airQualityToIncident({ ...CALGARY, usAqi: 62 }, now)!.description, /US AQI 62/);
    assert.doesNotMatch(airQualityToIncident(CALGARY, now)!.description, /US AQI/);
  });

  it('uses the weather category, which the rules contract already accepts', () => {
    assert.equal(airQualityToIncident(CALGARY, now)!.category, 'weather');
  });

  it('is attributed and expires, so a stale reading cannot linger', () => {
    const incident = airQualityToIncident(CALGARY, now)!;
    assert.equal(incident.data_source, 'official');
    assert.match(incident.source_name!, /Open-Meteo/);
    assert.equal(incident.expires_at, now + 2 * 60 * 60 * 1000);
  });

  it('gives each zone a stable id so refreshes replace rather than accumulate', () => {
    const a = airQualityToIncident(CALGARY, now)!;
    const b = airQualityToIncident(CALGARY, now + 60_000)!;
    assert.equal(a.id, b.id);
    assert.equal(a.id, 'air-calgary');
  });
});
