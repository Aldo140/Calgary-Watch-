import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFirebaseAuthDomain } from '../src/lib/firebaseAuthDomain';

const configuredDomain = 'calgary-map-e70bb.firebaseapp.com';

test('uses the CalgaryWatch domain on the live production site', () => {
  assert.equal(resolveFirebaseAuthDomain(configuredDomain, 'calgarywatch.ca', true), 'calgarywatch.ca');
});

test('retains the configured domain for development and preview channels', () => {
  assert.equal(resolveFirebaseAuthDomain(configuredDomain, 'localhost', false), configuredDomain);
  assert.equal(
    resolveFirebaseAuthDomain(configuredDomain, 'calgary-map-e70bb--preview.web.app', true),
    configuredDomain
  );
});
