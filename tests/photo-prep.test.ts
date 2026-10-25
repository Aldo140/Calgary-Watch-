import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyPhotoFile,
  fitWithin,
  formatBytes,
  isOwnIncidentPhotoUrl,
  photoFileName,
  pixelBlockSize,
  shotListFor,
  PHOTO_SHOT_LIST,
} from '../src/lib/photoPrep.ts';

const MB = 1024 * 1024;

describe('classifyPhotoFile', () => {
  it('accepts ordinary and oddly typed phone photos', () => {
    assert.equal(classifyPhotoFile({ name: 'IMG_1.jpg', type: 'image/jpeg', size: 4 * MB }), 'ok');
    assert.equal(classifyPhotoFile({ name: 'shot.png', type: 'image/png', size: 900 }), 'ok');
    assert.equal(classifyPhotoFile({ name: 'pano.jpg', type: 'image/jpeg', size: 30 * MB }), 'ok');
    // Some Android galleries send no MIME type at all.
    assert.equal(classifyPhotoFile({ name: 'IMG_2.JPG', type: '', size: 2 * MB }), 'ok');
  });

  it('names each kind of file it cannot post', () => {
    assert.equal(classifyPhotoFile({ name: 'IMG_3.HEIC', type: '', size: 2 * MB }), 'heic');
    assert.equal(classifyPhotoFile({ name: 'a.heif', type: 'image/heif', size: 2 * MB }), 'heic');
    assert.equal(classifyPhotoFile({ name: 'logo.svg', type: 'image/svg+xml', size: 2000 }), 'svg');
    assert.equal(classifyPhotoFile({ name: 'notes.pdf', type: 'application/pdf', size: 2000 }), 'not-image');
    assert.equal(classifyPhotoFile({ name: 'clip.mov', type: 'video/quicktime', size: 2000 }), 'not-image');
    assert.equal(classifyPhotoFile({ name: 'x.jpg', type: 'image/jpeg', size: 0 }), 'empty');
    assert.equal(classifyPhotoFile({ name: 'raw.jpg', type: 'image/jpeg', size: 41 * MB }), 'too-big');
  });
});

describe('fitWithin', () => {
  it('shrinks the long side to the cap and keeps the ratio', () => {
    assert.deepEqual(fitWithin(4032, 3024), { width: 1600, height: 1200 });
    assert.deepEqual(fitWithin(3024, 4032), { width: 1200, height: 1600 });
  });
  it('never upscales a small photo', () => {
    assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  });
});

describe('blur strength', () => {
  it('leaves about seven blocks across a patch, never finer than 6px', () => {
    assert.equal(pixelBlockSize(280), 40);
    assert.equal(pixelBlockSize(20), 6);
  });
});

describe('formatBytes and photoFileName', () => {
  it('formats sizes the way the preview shows them', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(312 * 1024), '312 KB');
    assert.equal(formatBytes(4.2 * MB), '4.2 MB');
    assert.equal(formatBytes(12 * MB), '12 MB');
  });
  it('always names the upload .jpg', () => {
    assert.equal(photoFileName('IMG_0042.HEIC'), 'IMG_0042.jpg');
    assert.equal(photoFileName('my photo (1).png'), 'my-photo-1-.jpg');
    assert.equal(photoFileName('.png'), 'photo.jpg');
  });
});

describe('isOwnIncidentPhotoUrl', () => {
  const url = (path: string) => `https://firebasestorage.googleapis.com/v0/b/calgary-map-e70bb.firebasestorage.app/o/${path}?alt=media&token=t`;
  it('accepts a download URL in the reporter\'s own folder', () => {
    assert.equal(isOwnIncidentPhotoUrl(url('incidents%2Fu1%2F1729.jpeg'), 'u1'), true);
  });
  it('refuses other folders, other users and other hosts', () => {
    assert.equal(isOwnIncidentPhotoUrl(url('incidents%2Fu2%2F1729.jpeg'), 'u1'), false);
    assert.equal(isOwnIncidentPhotoUrl(url('incidents%2Fu10%2F1729.jpeg'), 'u1'), false);
    assert.equal(isOwnIncidentPhotoUrl(url('listings%2Fu1%2F1729.jpeg'), 'u1'), false);
    assert.equal(isOwnIncidentPhotoUrl('https://example.org/pixel.gif', 'u1'), false);
  });
});

describe('shot lists', () => {
  it('has three short, specific shots for every report category', () => {
    for (const [category, shots] of Object.entries(PHOTO_SHOT_LIST)) {
      assert.equal(shots.length, 3, category);
      for (const s of shots) assert.ok(s.length <= 42, `${category}: "${s}" is too long for a 320px phone`);
    }
    assert.deepEqual(shotListFor('unknown'), PHOTO_SHOT_LIST.crime);
  });
});
