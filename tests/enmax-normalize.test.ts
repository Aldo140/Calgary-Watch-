/**
 * Normalization + fetch-failure tests for the ENMAX outage ingest.
 *
 * Run with: npm test
 * (node:test via tsx — no extra test dependencies are added to the project.)
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  DEFAULT_CAUSE,
  DEFAULT_STATUS,
  normalizeOutage,
  normalizeOutages,
  resolveOutageType,
  splitAreasAffected,
} from '../scripts/ingest/enmax/normalize.js';
import { toCalgaryIso } from '../scripts/ingest/enmax/time.js';
import { fetchEnmaxOutages } from '../scripts/ingest/enmax/fetch.js';

/** A realistic ENMAX record, matching the shape observed on the live feed. */
function sampleRecord(overrides: Record<string, unknown> = {}) {
  return {
    incidentID: '6689ca55-8b24-4ade-87c1-0c6f449dd040',
    areasAffected: 'Copperfield, Downtown Commercial Core, Hotchkiss, New Brighton',
    customersAffected: 1141,
    estimatedRestoration: '2026-08-02T17:00:00',
    incidentName: '0199',
    latitude: 50.919141526,
    longitude: -113.92210899,
    outageCause: 'Damage to ENMAX equipment',
    outageStart: '2026-08-02T03:51:29',
    outageType: 'Unplanned',
    status: 'Under Review',
    reasonCode: 2,
    state: 'open',
    requestDate: '2026-08-02T13:45:07.783',
    isPlanned: false,
    ...overrides,
  };
}

describe('splitAreasAffected', () => {
  it('splits on commas and trims each value', () => {
    assert.deepEqual(
      splitAreasAffected('Copperfield,  Downtown Commercial Core ,Hotchkiss'),
      ['Copperfield', 'Downtown Commercial Core', 'Hotchkiss'],
    );
  });

  it('returns an empty array for null areasAffected', () => {
    assert.deepEqual(splitAreasAffected(null), []);
    assert.deepEqual(splitAreasAffected(undefined), []);
  });

  it('drops empty segments left by trailing or doubled commas', () => {
    assert.deepEqual(splitAreasAffected('Beltline, ,Mission,'), ['Beltline', 'Mission']);
  });
});

describe('normalizeOutage', () => {
  it('maps the ENMAX field names onto the Calgary Watch model', () => {
    const outage = normalizeOutage(sampleRecord());
    assert.ok(outage);
    assert.equal(outage.id, '6689ca55-8b24-4ade-87c1-0c6f449dd040');
    assert.equal(outage.referenceNumber, '0199');
    assert.equal(outage.type, 'unplanned');
    assert.equal(outage.customersAffected, 1141);
    assert.equal(outage.source, 'ENMAX');
    assert.equal(outage.isOfficial, true);
    assert.equal(outage.areasAffected.length, 4);
  });

  it('defaults a blank status to "Active"', () => {
    assert.equal(normalizeOutage(sampleRecord({ status: '   ' }))?.status, DEFAULT_STATUS);
    assert.equal(normalizeOutage(sampleRecord({ status: null }))?.status, DEFAULT_STATUS);
  });

  it('treats the literal string "null" as blank', () => {
    // The live feed really does send status:"null" as a four-character string.
    assert.equal(normalizeOutage(sampleRecord({ status: 'null' }))?.status, DEFAULT_STATUS);
    assert.equal(normalizeOutage(sampleRecord({ outageCause: 'null' }))?.cause, DEFAULT_CAUSE);
    assert.equal(normalizeOutage(sampleRecord({ incidentName: 'null' }))?.referenceNumber, null);
  });

  it('defaults a missing cause to "Under investigation"', () => {
    assert.equal(normalizeOutage(sampleRecord({ outageCause: null }))?.cause, DEFAULT_CAUSE);
    assert.equal(normalizeOutage(sampleRecord({ outageCause: '' }))?.cause, DEFAULT_CAUSE);
  });

  it('converts missing or negative customer counts to zero', () => {
    assert.equal(normalizeOutage(sampleRecord({ customersAffected: null }))?.customersAffected, 0);
    assert.equal(normalizeOutage(sampleRecord({ customersAffected: -5 }))?.customersAffected, 0);
    assert.equal(normalizeOutage(sampleRecord({ customersAffected: 'abc' }))?.customersAffected, 0);
  });

  it('rejects records with invalid coordinates', () => {
    assert.equal(normalizeOutage(sampleRecord({ latitude: null })), null);
    assert.equal(normalizeOutage(sampleRecord({ longitude: 'not-a-number' })), null);
    assert.equal(normalizeOutage(sampleRecord({ latitude: 0, longitude: 0 })), null);
    assert.equal(normalizeOutage(sampleRecord({ latitude: 999 })), null);
  });

  it('nulls out unparseable dates instead of emitting invalid ones', () => {
    const outage = normalizeOutage(
      sampleRecord({ outageStart: '', estimatedRestoration: 'soon', requestDate: null }),
    );
    assert.equal(outage?.startedAt, null);
    assert.equal(outage?.estimatedRestorationAt, null);
    assert.equal(outage?.requestDate, null);
  });

  it('returns null for non-object input', () => {
    assert.equal(normalizeOutage(null), null);
    assert.equal(normalizeOutage('nope'), null);
    assert.equal(normalizeOutage([1, 2, 3]), null);
  });
});

describe('resolveOutageType', () => {
  it('trusts isPlanned when it is true', () => {
    assert.equal(resolveOutageType({ isPlanned: true, outageType: 'Unplanned' }), 'planned');
    assert.equal(resolveOutageType({ isPlanned: true }), 'planned');
  });

  it('lets outageType "Planned" override a false isPlanned', () => {
    // This is the dominant real-world combination on the live feed: scheduled
    // work with isPlanned:false, outageType:"Planned" and a future start date.
    assert.equal(resolveOutageType({ isPlanned: false, outageType: 'Planned' }), 'planned');
  });

  it('reports unplanned only when both signals agree', () => {
    assert.equal(resolveOutageType({ isPlanned: false, outageType: 'Unplanned' }), 'unplanned');
    assert.equal(resolveOutageType({ outageType: 'Unplanned' }), 'unplanned');
    assert.equal(resolveOutageType({}), 'unplanned');
  });
});

describe('normalizeOutages', () => {
  it('keeps valid records when one record in the batch is malformed', () => {
    const outages = normalizeOutages([
      sampleRecord(),
      null,
      'garbage',
      { incidentID: 'no-coords' },
      sampleRecord({ incidentID: 'second-id', incidentName: '0200' }),
    ]);
    assert.equal(outages.length, 2);
    assert.deepEqual(outages.map((o) => o.id).sort(), ['6689ca55-8b24-4ade-87c1-0c6f449dd040', 'second-id']);
  });

  it('collapses duplicate incident IDs so map keys stay unique', () => {
    const outages = normalizeOutages([sampleRecord(), sampleRecord({ status: 'Crew Assigned' })]);
    assert.equal(outages.length, 1);
    assert.equal(outages[0].status, 'Crew Assigned');
  });

  it('throws when the payload is not an array', () => {
    assert.throws(() => normalizeOutages({ outages: [] }), /not an array/);
    assert.throws(() => normalizeOutages(null), /not an array/);
  });
});

describe('toCalgaryIso', () => {
  it('treats naive timestamps as Calgary local time, not UTC', () => {
    // 2026-08-02 is MDT (UTC-6).
    const iso = toCalgaryIso('2026-08-02T17:00:00');
    assert.ok(iso);
    assert.match(iso, /^2026-08-02T17:00:00\.000-06:00$/);
    // The instant must be 23:00 UTC, i.e. 5 p.m. in Calgary.
    assert.equal(new Date(iso).toISOString(), '2026-08-02T23:00:00.000Z');
  });

  it('uses the standard-time offset in winter', () => {
    const iso = toCalgaryIso('2026-01-15T08:30:00');
    assert.ok(iso);
    assert.match(iso, /-07:00$/);
    assert.equal(new Date(iso).toISOString(), '2026-01-15T15:30:00.000Z');
  });

  it('preserves timestamps that already carry a timezone', () => {
    assert.equal(toCalgaryIso('2026-08-02T23:00:00Z'), '2026-08-02T23:00:00.000Z');
  });

  it('returns null for blank or unparseable values', () => {
    assert.equal(toCalgaryIso(''), null);
    assert.equal(toCalgaryIso(null), null);
    assert.equal(toCalgaryIso('whenever'), null);
  });
});

/**
 * The ingest script publishes a snapshot only when fetchEnmaxOutages resolves.
 * Every rejection below therefore means "keep the previous snapshot" — the
 * property that stops a bad ENMAX day from wiping the map.
 */
describe('fetchEnmaxOutages failure handling', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stubFetch(impl: () => Promise<unknown> | never, ok = true, status = 200) {
    globalThis.fetch = (async () => ({
      ok,
      status,
      json: async () => impl(),
    })) as unknown as typeof fetch;
  }

  it('normalizes a healthy response', async () => {
    stubFetch(async () => [sampleRecord()]);
    const outages = await fetchEnmaxOutages();
    assert.equal(outages.length, 1);
    assert.equal(outages[0].referenceNumber, '0199');
  });

  it('rejects on a non-2xx response so the old snapshot survives', async () => {
    stubFetch(async () => [], false, 503);
    await assert.rejects(() => fetchEnmaxOutages(), /503/);
  });

  it('rejects on a transport failure so the old snapshot survives', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ENMAX timed out');
    }) as unknown as typeof fetch;
    await assert.rejects(() => fetchEnmaxOutages(), /timed out/);
  });

  it('treats a non-array response as a failure, not as zero outages', async () => {
    stubFetch(async () => ({ error: 'maintenance' }));
    await assert.rejects(() => fetchEnmaxOutages(), /not an array/);
  });

  it('still resolves when only some records are malformed', async () => {
    stubFetch(async () => [sampleRecord(), null, { incidentID: 'no-coords' }]);
    const outages = await fetchEnmaxOutages();
    assert.equal(outages.length, 1, 'one bad record must not fail the whole run');
  });
});
