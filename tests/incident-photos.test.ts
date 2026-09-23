/**
 * Contract tests for the incident photo path.
 *
 * These exist because "I submitted pictures but they don't show up" was caused
 * by three silent gaps, none of which broke a build or a test:
 *   - the map popup never rendered image_url at all,
 *   - a failed upload aborted the entire report rather than the attachment,
 *   - the emergency path had no photo support and dropped image_url.
 *
 * Like tests/rules-contract.test.ts these are STRUCTURAL checks over source
 * text. They cannot prove a photo renders; they make a silent *removal* of the
 * photo path loud, which is the failure mode that actually happened.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const mapComponent = read('src/components/Map.tsx');
const mapPage = read('src/pages/MapPage.tsx');
const incidentForm = read('src/components/IncidentForm.tsx');
const emergencyModal = read('src/components/EmergencyModal.tsx');
const detailPanel = read('src/components/IncidentDetailPanel.tsx');
const sidebar = read('src/components/Sidebar.tsx');
const storageLib = read('src/lib/storage.ts');
const storageRules = read('storage.rules');
const firestoreRules = read('firestore.rules');

describe('incident photos are displayed', () => {
  it('the map popup renders the photo', () => {
    // The popup is built with raw DOM calls, so a missing photo is invisible
    // rather than a type error. This is the surface most people tap.
    const popup = mapComponent.slice(mapComponent.indexOf('showPopup:'));
    assert.ok(popup.includes('incident.image_url'), 'map popup must render incident.image_url');
  });

  it('the detail panel and sidebar render the photo', () => {
    assert.ok(detailPanel.includes('incident.image_url'), 'detail panel must render the photo');
    assert.ok(sidebar.includes('incident.image_url'), 'sidebar must render the photo');
  });
});

describe('incident photos are persisted', () => {
  it('both submit paths write image_url onto the incident', () => {
    // Two separate handlers create incidents. The emergency one silently
    // dropped the field, so a photo attached there never reached Firestore.
    const standard = mapPage.slice(mapPage.indexOf('handleIncidentSubmit'), mapPage.indexOf('handleEmergencySubmit'));
    const emergency = mapPage.slice(mapPage.indexOf('handleEmergencySubmit'));
    assert.ok(/image_url/.test(standard), 'handleIncidentSubmit must persist image_url');
    assert.ok(/image_url/.test(emergency), 'handleEmergencySubmit must persist image_url');
  });

  it('firestore rules still accept image_url on create', () => {
    const create = firestoreRules.slice(firestoreRules.indexOf('match /incidents/'));
    assert.ok(create.includes("'image_url'"), 'image_url must stay in the incident create allowlist');
  });
});

describe('a failed photo never costs the reporter their report', () => {
  it('the upload failure is caught separately from the submission', () => {
    // Previously the upload ran inside the same try as onSubmit(), so any
    // upload error threw past the submission entirely.
    assert.match(incidentForm, /catch\s*\(uploadError\)/, 'photo upload needs its own catch');
    assert.ok(incidentForm.includes('skipPhoto'), 'a way past a failed photo must exist');
    assert.ok(incidentForm.includes('photoUploadFailed'), 'the failed-photo state drives that affordance');
  });

  it('an emergency report still sends when its photo fails', () => {
    const submit = emergencyModal.slice(emergencyModal.indexOf('const handleSubmit'));
    const upload = submit.indexOf('uploadIncidentImage');
    const send = submit.indexOf('onSubmit({');
    assert.ok(upload !== -1 && send !== -1, 'emergency submit must support photos');
    assert.ok(upload < send, 'the upload must be attempted before the report is sent');
    assert.match(submit.slice(upload, send), /catch/, 'an SOS must not be blocked by a failed upload');
  });
});

describe('photo format handling', () => {
  it('converts what the browser can decode instead of rejecting it', () => {
    // iPhone photos are HEIC, which the Storage rule rejects and which Chrome
    // and Firefox cannot render; Safari can decode it, so it is converted.
    assert.ok(storageLib.includes('prepareIncidentImage'), 'a conversion step must exist');
    assert.ok(storageLib.includes("'image/jpeg'"), 'conversion target must be a web-safe format');
    assert.match(storageLib, /createImageBitmap/, 'conversion decodes via the browser');
  });

  it('the client allowlist and the storage rule agree on accepted types', () => {
    const allowed = /const ALLOWED_TYPES = \[([^\]]+)\]/.exec(storageLib);
    assert.ok(allowed, 'ALLOWED_TYPES not found');
    const types = [...allowed[1].matchAll(/'image\/([a-z]+)'/g)].map((m) => m[1]).sort();
    const rule = /contentType\.matches\('image\/\(([^)]+)\)'\)/.exec(storageRules);
    assert.ok(rule, 'storage.rules contentType matcher not found');
    const ruleTypes = rule[1].split('|').sort();
    assert.deepEqual(types, ruleTypes, 'a type the client uploads must be a type the bucket accepts');
  });

  it('uploads stay within the size ceiling the storage rule enforces', () => {
    const clientMax = /const MAX_BYTES = (\d+) \* 1024 \* 1024/.exec(storageLib);
    const ruleMax = /request\.resource\.size <= (\d+) \* 1024 \* 1024/.exec(storageRules);
    assert.ok(clientMax && ruleMax, 'size ceilings not found on both sides');
    assert.equal(clientMax[1], ruleMax[1], 'client and bucket size ceilings must match');
  });
});
