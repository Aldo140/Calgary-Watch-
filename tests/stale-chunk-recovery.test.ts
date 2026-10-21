import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorKind, isChunkLoadError } from '../src/lib/chunkRecovery';
import { isNewerBuild } from '../src/lib/appVersion';
import { assetRefs, planRetention } from '../scripts/deploy/keep-previous-assets.mjs';

test('recognises a stale chunk in every browser', () => {
  for (const message of [
    'Failed to fetch dynamically imported module: https://calgarywatch.ca/assets/CommunityPage-CevNwgIP.js',
    'error loading dynamically imported module: https://calgarywatch.ca/assets/MapPage-x.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/AboutPage-PO4M5XQG.css',
    "Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of \"text/html\".",
  ]) assert.equal(isChunkLoadError(new Error(message)), true, message);
  assert.equal(isChunkLoadError({ name: 'ChunkLoadError', message: '' }), true);
  assert.equal(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')")), false);
  assert.equal(isChunkLoadError(null), false);
});

test('error screen picks offline before update before crash', () => {
  const chunk = new Error('Failed to fetch dynamically imported module: /assets/a.js');
  assert.equal(errorKind(chunk, true), 'offline');
  assert.equal(errorKind(chunk, false), 'chunk');
  assert.equal(errorKind(new Error('boom'), false), 'crash');
});

test('a tab only swaps builds for a real, different published build', () => {
  assert.equal(isNewerBuild('abc1234-x', 'abc1234-y'), true);
  assert.equal(isNewerBuild('abc1234-y', 'abc1234-y'), false);
  assert.equal(isNewerBuild(undefined, 'abc1234-y'), false);
  assert.equal(isNewerBuild('abc1234-x', 'dev'), false);
});

test('finds lazy page files named inside the entry script', () => {
  const refs = assetRefs('<script type="module" src="/assets/index-DW2BYsO6.js"></script> const m={CommunityPage:()=>import("./CommunityPage-x.js")};n(()=>import("assets/MapPage-Ab_9.js"),["assets/MapPage-Ab_9.css"])');
  assert.deepEqual([...refs].sort(), ['assets/CommunityPage-x.js', 'assets/MapPage-Ab_9.css', 'assets/MapPage-Ab_9.js', 'assets/index-DW2BYsO6.js']);
});

test('keeps the live build and a week of earlier files, nothing older', () => {
  const now = Date.UTC(2026, 9, 21);
  const day = 86_400_000;
  const keep: Map<string, number> = planRetention({
    now,
    current: new Set(['assets/index-new.js', 'assets/shared.js']),
    liveCrawl: new Set(['assets/index-old.js', 'assets/shared.js']),
    liveManifest: { files: [
      { file: 'assets/index-old.js', retiredAt: null },
      { file: 'assets/Page-3days.js', retiredAt: now - 3 * day },
      { file: 'assets/Page-9days.js', retiredAt: now - 9 * day },
      { file: 'assets/shared.js', retiredAt: null },
    ] },
  });
  assert.deepEqual([...keep.keys()].sort(), ['assets/Page-3days.js', 'assets/index-old.js']);
  assert.equal(keep.get('assets/index-old.js'), now);
  assert.equal(keep.get('assets/Page-3days.js'), now - 3 * day);
});
