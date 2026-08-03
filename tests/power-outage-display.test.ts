/**
 * Client-side classification + formatting tests for the ENMAX outage layer.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PowerOutage } from '../src/types/powerOutage.js';
import {
  classifyOutage,
  formatAreasAffected,
  formatCustomersAffected,
  formatOutageDateTime,
  powerOutageToIncident,
  powerOutagesToIncidents,
} from '../src/lib/powerOutages.js';

const NOW = Date.parse('2026-08-02T20:00:00Z'); // 2 p.m. Calgary (MDT)

function outage(overrides: Partial<PowerOutage> = {}): PowerOutage {
  return {
    id: 'test-1',
    referenceNumber: '0199',
    type: 'unplanned',
    status: 'Under Review',
    state: 'open',
    areasAffected: ['Copperfield', 'New Brighton'],
    customersAffected: 1141,
    latitude: 50.919141526,
    longitude: -113.92210899,
    cause: 'Damage to ENMAX equipment',
    startedAt: '2026-08-02T03:51:29.000-06:00',
    estimatedRestorationAt: '2026-08-02T17:00:00.000-06:00',
    requestDate: '2026-08-02T13:45:07.783-06:00',
    source: 'ENMAX',
    sourceUrl: 'https://powerservices.enmax.com/',
    isOfficial: true,
    ...overrides,
  };
}

describe('classifyOutage', () => {
  it('classifies a started unplanned outage as active unplanned', () => {
    assert.equal(classifyOutage(outage(), NOW), 'active_unplanned');
  });

  it('treats an unplanned outage with no start date as already underway', () => {
    assert.equal(classifyOutage(outage({ startedAt: null }), NOW), 'active_unplanned');
  });

  it('classifies a planned outage that has begun as active planned', () => {
    const record = outage({
      type: 'planned',
      startedAt: '2026-08-02T09:00:00.000-06:00',
      status: 'Crew Assigned',
    });
    assert.equal(classifyOutage(record, NOW), 'active_planned');
  });

  it('does NOT label a future planned outage as currently active', () => {
    const record = outage({
      type: 'planned',
      // Two days out, but ENMAX still reports state "open".
      startedAt: '2026-08-04T09:00:00.000-06:00',
      state: 'open',
    });
    assert.equal(classifyOutage(record, NOW), 'upcoming_planned');
  });

  it('drops outages that have been closed or restored', () => {
    assert.equal(classifyOutage(outage({ state: 'closed' }), NOW), null);
    assert.equal(classifyOutage(outage({ status: 'Power Restored' }), NOW), null);
    assert.equal(classifyOutage(outage({ status: 'Cancelled', type: 'planned' }), NOW), null);
  });

  it('drops an unplanned record dated in the future rather than mislabelling it', () => {
    assert.equal(classifyOutage(outage({ startedAt: '2026-08-05T09:00:00.000-06:00' }), NOW), null);
  });
});

describe('powerOutageToIncident', () => {
  it('adapts an active outage into an infrastructure incident', () => {
    const incident = powerOutageToIncident(outage(), NOW);
    assert.ok(incident);
    assert.equal(incident.category, 'infrastructure');
    assert.equal(incident.data_source, 'official');
    assert.equal(incident.source_type, 'enmax_power_outage');
    assert.equal(incident.source_name, 'ENMAX');
    assert.equal(incident.neighborhood, 'Copperfield');
    assert.match(incident.title, /^Power outage — Copperfield$/);
  });

  it('namespaces the id so it cannot collide with a Firestore document id', () => {
    assert.equal(powerOutageToIncident(outage(), NOW)?.id, 'enmax-test-1');
  });

  it('carries ENMAX attribution and the disclaimer into the description', () => {
    const incident = powerOutageToIncident(outage(), NOW);
    assert.match(incident!.description, /1,141 customers affected/);
    assert.match(incident!.description, /Damage to ENMAX equipment/);
    assert.match(incident!.description, /provided by ENMAX/);
    assert.equal(incident!.source_url, 'https://powerservices.enmax.com/');
  });

  it('labels a planned outage that has started as planned', () => {
    const incident = powerOutageToIncident(
      outage({ type: 'planned', startedAt: '2026-08-02T09:00:00.000-06:00' }),
      NOW,
    );
    assert.match(incident!.title, /^Planned power outage — /);
  });

  it('includes planned work starting within 24 hours', () => {
    const soon = new Date(NOW + 6 * 60 * 60 * 1000).toISOString();
    const incident = powerOutageToIncident(outage({ type: 'planned', startedAt: soon }), NOW);
    assert.ok(incident, 'imminent planned work should surface as an incident');
    assert.match(incident.title, /^Planned power outage starts /);
  });

  it('excludes planned work scheduled beyond 24 hours', () => {
    // ENMAX publishes scheduled outages months out; those are not incidents.
    const far = new Date(NOW + 8 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(powerOutageToIncident(outage({ type: 'planned', startedAt: far }), NOW), null);
  });

  it('excludes restored and cancelled outages', () => {
    assert.equal(powerOutageToIncident(outage({ status: 'Power Restored' }), NOW), null);
    assert.equal(powerOutageToIncident(outage({ state: 'closed' }), NOW), null);
  });

  it('expires an hour after the estimated restoration', () => {
    const incident = powerOutageToIncident(outage(), NOW);
    const restoration = Date.parse('2026-08-02T17:00:00.000-06:00');
    assert.equal(incident!.expires_at, restoration + 60 * 60 * 1000);
  });

  it('still sets a future expiry when no restoration estimate is given', () => {
    const incident = powerOutageToIncident(outage({ estimatedRestorationAt: null }), NOW);
    assert.ok(incident!.expires_at! > NOW, 'must not expire immediately');
  });

  it('never emits Invalid Date, null or undefined in user-visible text', () => {
    const incident = powerOutageToIncident(
      outage({ estimatedRestorationAt: null, areasAffected: [], referenceNumber: null }),
      NOW,
    );
    assert.ok(incident);
    for (const text of [incident.title, incident.description, incident.neighborhood]) {
      assert.doesNotMatch(text, /Invalid Date|\bnull\b|\bundefined\b|NaN/);
    }
  });

  it('drops non-incident records from a batch without failing the rest', () => {
    const far = new Date(NOW + 30 * 24 * 60 * 60 * 1000).toISOString();
    const incidents = powerOutagesToIncidents(
      [
        outage(),
        outage({ id: 'restored', status: 'Power Restored' }),
        outage({ id: 'far-off', type: 'planned', startedAt: far }),
      ],
      NOW,
    );
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0].id, 'enmax-test-1');
  });
});

describe('formatCustomersAffected', () => {
  it('formats thousands with separators', () => {
    assert.equal(formatCustomersAffected(1141), '1,141 customers affected');
    assert.equal(formatCustomersAffected(12345), '12,345 customers affected');
  });

  it('handles the singular case', () => {
    assert.equal(formatCustomersAffected(1), '1 customer affected');
  });

  it('never prints "0 customers" as if it were a real count', () => {
    assert.equal(formatCustomersAffected(0), 'Customers affected not reported');
    assert.equal(formatCustomersAffected(Number.NaN), 'Customers affected not reported');
  });
});

describe('formatOutageDateTime', () => {
  it('renders Calgary local time for a qualified timestamp', () => {
    const formatted = formatOutageDateTime('2026-08-02T17:00:00.000-06:00');
    // en-CA medium/short in America/Edmonton — assert on the parts, not the
    // exact ICU punctuation, which varies by Node build.
    assert.match(formatted, /Aug/);
    assert.match(formatted, /2026/);
    assert.match(formatted, /5:00/);
  });

  it('never renders "Invalid Date", "null" or "undefined"', () => {
    for (const value of [null, undefined, '', 'not a date']) {
      const formatted = formatOutageDateTime(value);
      assert.equal(formatted, 'Not provided');
      assert.doesNotMatch(formatted, /Invalid Date|null|undefined/);
    }
  });

  it('honours a custom fallback', () => {
    assert.equal(formatOutageDateTime(null, 'Unknown'), 'Unknown');
  });
});

describe('formatAreasAffected', () => {
  it('lists areas and truncates long lists', () => {
    assert.equal(formatAreasAffected(['Beltline', 'Mission']), 'Beltline, Mission');
    assert.equal(
      formatAreasAffected(['A', 'B', 'C', 'D', 'E', 'F']),
      'A, B, C, D +2 more',
    );
  });

  it('handles an empty area list', () => {
    assert.equal(formatAreasAffected([]), 'Area not specified');
  });
});
