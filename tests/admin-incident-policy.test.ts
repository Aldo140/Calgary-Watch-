import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  adminIncidentTimestamp,
  canPermanentlyDeleteIncident,
  coerceAdminIncidentTimestamp,
  isAdminExampleIncident,
  isOperationalIncident,
  isResidentSubmission,
  matchesAdminSourceFilter,
} from '../src/lib/adminIncidentPolicy.js';

const resident = { data_source: 'community' as const, authorUid: 'user-123', anonymous: true };
const legacyResident = { data_source: undefined, authorUid: undefined, anonymous: true };
const example = { data_source: 'demo' as const, authorUid: 'demo', anonymous: true };
const legacyExample = { data_source: 'community' as const, authorUid: 'seed', anonymous: true };
const hiddenResident = { ...resident, visibility: 'deleted' as const };

describe('admin incident retention policy', () => {
  it('protects current and legacy resident submissions from permanent deletion', () => {
    assert.equal(isResidentSubmission(resident), true);
    assert.equal(isResidentSubmission(legacyResident), true);
    assert.equal(canPermanentlyDeleteIncident(resident), false);
    assert.equal(canPermanentlyDeleteIncident(legacyResident), false);
  });

  it('allows synthetic and official records to be permanently removed', () => {
    assert.equal(canPermanentlyDeleteIncident(example), true);
    assert.equal(canPermanentlyDeleteIncident(legacyExample), true);
    assert.equal(canPermanentlyDeleteIncident({ data_source: 'official', authorUid: 'system' }), true);
  });

  it('separates reproducible API records from permanent resident history', () => {
    assert.equal(isOperationalIncident(resident), false);
    assert.equal(isOperationalIncident(example), false);
    assert.equal(isOperationalIncident({ data_source: 'official', authorUid: 'system' }), true);
    assert.equal(isOperationalIncident({ data_source: undefined, authorUid: 'system' }), true);
    assert.equal(matchesAdminSourceFilter({ data_source: undefined, authorUid: 'system' }, 'official'), true);
  });
});

describe('admin source tabs', () => {
  it('shows anonymous examples only in Examples', () => {
    for (const row of [example, legacyExample]) {
      assert.equal(isAdminExampleIncident(row), true);
      assert.equal(matchesAdminSourceFilter(row, 'example'), true);
      assert.equal(matchesAdminSourceFilter(row, 'all'), false);
      assert.equal(matchesAdminSourceFilter(row, 'community'), false);
      assert.equal(matchesAdminSourceFilter(row, 'anonymous'), false);
    }
  });

  it('keeps real anonymous submissions in All, Community and Anonymous', () => {
    for (const filter of ['all', 'community', 'anonymous'] as const) {
      assert.equal(matchesAdminSourceFilter(resident, filter), true);
    }
    assert.equal(matchesAdminSourceFilter(resident, 'example'), false);
  });

  it('keeps hidden resident submissions in the archive and hidden filter', () => {
    assert.equal(matchesAdminSourceFilter(hiddenResident, 'all'), true);
    assert.equal(matchesAdminSourceFilter(hiddenResident, 'community'), true);
    assert.equal(matchesAdminSourceFilter(hiddenResident, 'hidden'), true);
    assert.equal(matchesAdminSourceFilter(resident, 'hidden'), false);
  });
});

describe('legacy report history timestamps', () => {
  it('normalizes Firestore and legacy timestamp fields', () => {
    assert.equal(coerceAdminIncidentTimestamp({ seconds: 123 }), 123_000);
    assert.equal(coerceAdminIncidentTimestamp({ toMillis: () => 456 }), 456);
    assert.equal(adminIncidentTimestamp({ createdAt: { seconds: 789 } }), 789_000);
    assert.equal(adminIncidentTimestamp({ timestamp: 111, createdAt: 222 }), 111);
  });
});
