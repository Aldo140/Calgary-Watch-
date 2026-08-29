/**
 * Reading alert preferences off a stored profile.
 *
 * The profile stores flat, optional fields (a signed-in user doc is a loose
 * bag); selectAlerts wants a normalized AlertPreferences. This is the pure
 * adapter between the two, so a half-filled or legacy profile still yields a
 * sane, safe preference set (emergencies always on, a home zone derived from
 * the saved area).
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readAlertPreferences, type AlertProfileFields } from '../src/lib/alertProfile.ts';

describe('readAlertPreferences', () => {
  it('derives a home zone from the saved neighbourhood', () => {
    const prefs = readAlertPreferences({ alertsEnabled: true, inferredNeighborhood: 'Inglewood' });
    assert.equal(prefs.zones.length, 1);
    assert.equal(prefs.zones[0].neighborhood, 'Inglewood');
    assert.equal(prefs.emergencyAlways, true);
  });

  it('prefers an explicit neighborhood over the inferred one', () => {
    const prefs = readAlertPreferences({ neighborhood: 'Beltline', inferredNeighborhood: 'Inglewood' });
    assert.equal(prefs.zones[0].neighborhood, 'Beltline');
  });

  it('carries additional saved zones after the home zone', () => {
    const prefs = readAlertPreferences({
      inferredNeighborhood: 'Inglewood',
      alertZones: [{ id: 'work', label: 'Work', neighborhood: 'Downtown Calgary', radiusM: 0 }],
    });
    assert.deepEqual(prefs.zones.map((z) => z.label), ['Home', 'Work']);
  });

  it('reads a quiet-hours window only when both bounds are set', () => {
    assert.deepEqual(
      readAlertPreferences({ alertQuietStartHour: 22, alertQuietEndHour: 7 }).quietHours,
      { startHour: 22, endHour: 7 },
    );
    assert.equal(readAlertPreferences({ alertQuietStartHour: 22 }).quietHours, null);
    assert.equal(readAlertPreferences({}).quietHours, null);
  });

  it('defaults categories to empty (all) and normalizes a bad value', () => {
    assert.deepEqual(readAlertPreferences({}).categories, []);
    assert.deepEqual(readAlertPreferences({ alertCategories: ['crime'] }).categories, ['crime']);
    assert.deepEqual(readAlertPreferences({ alertCategories: 'nope' as unknown as [] }).categories, []);
  });

  it('reports whether alerts are enabled', () => {
    assert.equal(readAlertPreferences({ alertsEnabled: true }).enabled, true);
    assert.equal(readAlertPreferences({}).enabled, false);
  });
});
