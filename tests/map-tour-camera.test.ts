import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const tour = readFileSync('src/components/MapTour.tsx', 'utf8');
const layers = readFileSync('src/components/LayerToggle.tsx', 'utf8');
const page = readFileSync('src/pages/MapPage.tsx', 'utf8');
const viewer = readFileSync('src/components/CameraViewer.tsx', 'utf8');

describe('traffic camera tutorial', () => {
  it('walks through the real layer button, camera toggle and image viewer on both layouts', () => {
    assert.equal((tour.match(/target: 'traffic-cameras'/g) ?? []).length, 2);
    assert.equal((tour.match(/target: 'camera-viewer'/g) ?? []).length, 2);
    assert.match(layers, /data-tour=\{tourTarget\}/);
    assert.match(layers, /data-tour="layers"/);
    assert.match(viewer, /data-tour="camera-viewer"/);
  });

  it('reveals nested controls and loads an actual City camera for the viewer step', () => {
    assert.match(layers, /tourTarget === 'traffic-cameras'[\s\S]*setMenuOpen\(true\)/);
    assert.match(page, /target === 'traffic-cameras' \|\| target === 'camera-viewer'/);
    assert.match(page, /setViewerCamera\(camera\)/);
    assert.match(page, /flyTo\(camera\.lat, camera\.lng, 16\)/);
  });

  it('keeps the camera frame visible on phones and respects reduced motion', () => {
    assert.match(tour, /vw < 1024/);
    assert.match(tour, /viewer is a bottom sheet on phones/i);
    assert.match(tour, /useReducedMotion/);
    assert.match(tour, /motion-safe:animate-pulse/);
    assert.match(viewer, /guidedPreview/);
  });

  it('keeps the full lesson sequence in a compact card', () => {
    assert.match(tour, /const cardW = Math\.min\(328, vw - 24\)/);
    assert.match(tour, /Step \{index \+ 1\} of \{steps\.length\}/);
    assert.match(tour, /className="absolute p-4/);
    assert.doesNotMatch(tour, /publicAsset/);
  });
});
