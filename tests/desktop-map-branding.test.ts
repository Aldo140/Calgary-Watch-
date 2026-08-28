import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sidebar = readFileSync(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8');
const mapPage = readFileSync(new URL('../src/pages/MapPage.tsx', import.meta.url), 'utf8');
const mobileSheet = readFileSync(new URL('../src/components/MobileMapSheet.tsx', import.meta.url), 'utf8');

test('desktop map chrome uses one shared small-format brand mark', () => {
  assert.match(sidebar, /<DesktopMapBrandMark tone="dark" \/>/);
  assert.match(mapPage, /<DesktopMapBrandMark compact \/>/);
  assert.doesNotMatch(sidebar, /src="\/icon\.svg"/);
  assert.doesNotMatch(mapPage, /calgary-watch-plane-mark\.webp/);
});

test('the desktop branding repair does not enter the mobile sheet', () => {
  assert.doesNotMatch(mobileSheet, /DesktopMapBrandMark/);
});
