import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classify311Service } from '../src/lib/three11';

describe('live 311 classification on the map', () => {
  it('keeps fire-code questions off the map instead of flagging them as emergencies', () => {
    assert.equal(classify311Service('CFD - Fire Code and General Inquiries - FHB'), null);
    assert.equal(classify311Service('Corporate - General Inquiries'), null);
    assert.equal(classify311Service('Bylaw - General Enquiry'), null);
  });

  it('never classes any 311 request as an emergency', () => {
    for (const name of ['CFD - Fire Hazard Concern', 'Roads - Hazard', 'Emergency Management - Concern', 'Parks - Dangerous Tree Limb', 'CFD - Fire Safety Concerns']) {
      assert.notEqual(classify311Service(name), 'emergency', name);
    }
    assert.equal(classify311Service('CFD - Fire Safety Concerns'), 'infrastructure');
  });

  it('keeps the existing crime, weather and skip behaviour', () => {
    assert.equal(classify311Service('Bylaw - Disturbance and Behavioural Concerns'), 'crime');
    assert.equal(classify311Service('Corporate - Graffiti Concerns'), 'crime');
    assert.equal(classify311Service('Roads - Snow and Ice Control'), 'weather');
    assert.equal(classify311Service('Roads - Pothole Maintenance'), null); // traffic comes from 511
    assert.equal(classify311Service('WRS - Missed Collection'), null);
    assert.equal(classify311Service(undefined), null);
  });

  it('no longer reads "ice" inside words like "service" or "police" as weather', () => {
    assert.equal(classify311Service('CT - Customer Service Concern'), 'infrastructure');
  });
});
