import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { authErrorMessage, emailProblem, passwordProblem } from '../src/lib/auth';

describe('email authentication', () => {
  it('validates the signup fields without imposing extra password rules', () => {
    assert.match(emailProblem(''), /Enter/);
    assert.match(emailProblem('wrong'), /valid/);
    assert.equal(emailProblem('info@thebarnartisanmarket.ca'), '');
    assert.match(passwordProblem('12345'), /6 characters/);
    assert.equal(passwordProblem('123456'), '');
  });
  it('turns Firebase errors into safe, useful messages', () => {
    assert.match(authErrorMessage(Object.assign(new Error(), { code: 'auth/invalid-credential' })), /email or password/);
    assert.match(authErrorMessage(Object.assign(new Error(), { code: 'auth/email-already-in-use' })), /existing method/);
    assert.doesNotMatch(authErrorMessage(Object.assign(new Error(), { code: 'auth/too-many-requests' })), /auth\//);
  });
  it('wires every required Firebase auth operation and keeps Google fallback', () => {
    const provider = readFileSync('src/components/FirebaseProvider.tsx', 'utf8');
    for (const api of ['createUserWithEmailAndPassword','signInWithEmailAndPassword','sendEmailVerification','sendPasswordResetEmail','updateProfile','reload','signInWithPopup','signInWithRedirect','browserLocalPersistence']) assert.match(provider, new RegExp(api));
  });
  it('keeps verification enforced in the client and Firestore rules', () => {
    assert.match(readFileSync('src/lib/claimsApi.ts','utf8'), /!user\.emailVerified/);
    assert.match(readFileSync('firestore.rules','utf8'), /request\.auth\.token\.email_verified == true/);
    const page=readFileSync('src/pages/ClaimListingPage.tsx','utf8');
    assert.match(page,/Verify your email before submitting this claim/);
    assert.match(page,/claim-draft:/);
  });
});
