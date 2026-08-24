import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { fetchEnvironmentCanadaAlerts } from '../scripts/ingest/sources/environment-canada.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Environment Canada weather source', () => {
  it('uses the current OGC API and preserves official publication time', async () => {
    let requestedUrl = '';
    globalThis.fetch = (async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        type: 'FeatureCollection',
        features: [{
          id: 'official-alert-1',
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-114.0719, 51.0447] },
          properties: {
            alert_name_en: 'severe thunderstorm warning',
            alert_type: 'warning',
            alert_text_en: 'Large hail and strong wind gusts are possible.',
            feature_name_en: 'City of Calgary',
            publication_datetime: '2026-08-23T20:15:00.000Z',
            expiration_datetime: '2099-08-24T02:00:00.000Z',
            status_en: 'issued',
          },
        }],
      }), { headers: { 'content-type': 'application/geo+json' } });
    }) as typeof fetch;

    const incidents = await fetchEnvironmentCanadaAlerts();

    assert.match(requestedUrl, /^https:\/\/api\.weather\.gc\.ca\/collections\/weather-alerts\/items/);
    assert.match(decodeURIComponent(requestedUrl), /properties\.status_en<>'ended'/);
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0].timestamp, Date.parse('2026-08-23T20:15:00.000Z'));
    assert.equal(incidents[0].neighborhood, 'City of Calgary');
    assert.equal(incidents[0].source_name, 'Environment Canada');
  });

  it('rejects XML error documents even when the server responds HTTP 200', async () => {
    globalThis.fetch = (async () => new Response('<ExceptionReport />', {
      headers: { 'content-type': 'text/xml' },
    })) as typeof fetch;

    await assert.rejects(fetchEnvironmentCanadaAlerts(), /returned text\/xml/);
  });
});
