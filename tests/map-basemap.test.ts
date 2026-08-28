import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { StyleSpecification } from 'maplibre-gl';
import {
  createCalgaryWatchPositronStyle,
  OPENFREEMAP_POSITRON_STYLE_URL,
} from '../src/lib/mapBasemap';

const fixture = {
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#aaa' } },
    { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', paint: { 'fill-color': '#aaa' } },
    { id: 'label_other', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-size': 9 }, paint: { 'text-color': '#000' } },
    { id: 'poi-restaurant', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi' },
  ],
} as StyleSpecification;

test('uses the keyless OpenFreeMap Positron endpoint', () => {
  assert.equal(OPENFREEMAP_POSITRON_STYLE_URL, 'https://tiles.openfreemap.org/styles/positron');
  assert.doesNotMatch(OPENFREEMAP_POSITRON_STYLE_URL, /key|token/i);
});

test('customizes Positron for incident contrast and local orientation', () => {
  const result = createCalgaryWatchPositronStyle(fixture);
  const layer = (id: string) => result.layers.find((candidate) => candidate.id === id)! as any;

  assert.equal(layer('background').paint['background-color'], '#F3F5F2');
  assert.equal(layer('water').paint['fill-color'], '#C8DDE8');
  assert.equal(layer('park').paint['fill-color'], '#DDE9DD');
  assert.deepEqual(layer('label_other').layout['text-size'], ['interpolate', ['linear'], ['zoom'], 9, 10, 12, 12, 15, 13]);
  assert.equal(result.layers.some(({ id }) => id === 'poi-restaurant'), false);
  assert.match((result.sources.openmaptiles as any).attribution, /OpenStreetMap/);
  assert.equal((fixture.layers[0] as any).paint['background-color'], '#fff', 'provider style is not mutated');
});

test('Map keeps a no-key raster fallback and Firebase permits only the new tile host', () => {
  const mapSource = readFileSync(new URL('../src/components/Map.tsx', import.meta.url), 'utf8');
  const firebase = readFileSync(new URL('../firebase.json', import.meta.url), 'utf8');
  const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

  assert.match(mapSource, /tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(mapSource, /maplibre-gl-worker\.mjs\?worker&url/);
  assert.match(mapSource, /setWorkerUrl\(maplibreWorkerUrl\)/);
  assert.match(mapSource, /if \(resourceFailures >= 3\) restoreFallback\(\)/);
  assert.match(mapSource, /if \(!promoted\) restoreFallback\(\)/);
  assert.match(firebase, /connect-src[^;]*https:\/\/tiles\.openfreemap\.org/);
  assert.match(firebase, /worker-src 'self' blob:/);
  assert.match(vite, /exclude: \['maplibre-gl'\]/);
});
