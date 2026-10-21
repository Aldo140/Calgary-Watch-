import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { authErrorMessage, continueUriRefused, emailProblem, inboxLink, passwordProblem, returnLink, suggestEmail } from '../src/lib/auth';

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
  it('refreshes the ID token after verification so rules see email_verified', () => {
    assert.match(readFileSync('src/lib/auth.ts', 'utf8'), /claims\.email_verified !== true\) await user\.getIdToken\(true\)/);
    assert.match(readFileSync('src/components/FirebaseProvider.tsx', 'utf8'), /await reload\(auth\.currentUser\);[\s\S]{0,120}await syncVerifiedToken\(refreshed\)/);
    for (const file of ['src/lib/claimsApi.ts', 'src/lib/marketsApi.ts', 'src/lib/discoveryApi.ts']) assert.match(readFileSync(file, 'utf8'), /await syncVerifiedToken\(/, file);
  });
  it('brings people back to the page they were on from verification and reset emails', () => {
    assert.deepEqual(returnLink('https://calgarywatch.ca/claim/barn?x=1#form'), { url: 'https://calgarywatch.ca/claim/barn?x=1' });
    assert.deepEqual(returnLink('http://localhost:3000/plans'), { url: 'http://localhost:3000/plans' });
    assert.equal(returnLink('http://example.com/'), undefined);
    assert.equal(returnLink('not a url'), undefined);
    assert.ok(continueUriRefused(Object.assign(new Error(), { code: 'auth/unauthorized-continue-uri' })));
    assert.ok(!continueUriRefused(Object.assign(new Error(), { code: 'auth/too-many-requests' })));
  });
  it('explains a disabled provider, a blocked popup and a disabled account', () => {
    for (const code of ['auth/operation-not-allowed', 'auth/popup-blocked', 'auth/user-disabled', 'auth/account-exists-with-different-credential']) {
      const message = authErrorMessage(Object.assign(new Error(), { code }));
      assert.doesNotMatch(message, /didn’t work|auth\//, code);
    }
  });
  it('sends existing accounts from sign up to sign in and checks verification when the tab returns', () => {
    const dialog = readFileSync('src/components/auth/AuthDialog.tsx', 'utf8');
    assert.match(dialog, /auth\/email-already-in-use'\) \{ switchMode\('signin'\)/);
    assert.match(dialog, /visibilitychange/);
    assert.match(dialog, /request\.mode \?\? \(remembered \? 'signin' : 'signup'\)/);
  });
  it('holds unverified claims and vendor applications, and sends them once verified', () => {
    const claim = readFileSync('src/pages/ClaimListingPage.tsx', 'utf8');
    assert.match(claim, /signIn\(\{ mode: 'signup', email: draft\.workEmail,/);
    assert.match(claim, /pending\.current && user\?\.emailVerified && claims/);
    const vendor = readFileSync('src/pages/VendorApplyPage.tsx', 'utf8');
    assert.match(vendor, /<VerifyEmailNotice action="send your application"/);
    assert.match(vendor, /pending\.current && user\?\.emailVerified/);
    const submit = readFileSync('src/pages/SubmitDiscoveryPage.tsx', 'utf8');
    assert.match(submit, /<VerifyEmailNotice action="send a listing"/);
    assert.match(submit, /if \(!user\.emailVerified\)/);
  });
  it('catches mistyped email domains before an unverifiable account exists', () => {
    assert.equal(suggestEmail('alison@gmial.com'), 'alison@gmail.com');
    assert.equal(suggestEmail('Jo@Hotmial.com'), 'jo@hotmail.com');
    assert.equal(suggestEmail('a@gmail.co'), 'a@gmail.com');
    assert.equal(suggestEmail('a@yaho.ca'), 'a@yahoo.ca');
    for (const fine of ['a@gmail.com', 'info@thebarnartisanmarket.ca', 'a@shaw.ca', 'a@acme.co', 'nope']) assert.equal(suggestEmail(fine), '', fine);
  });
  it('opens the right webmail from the verify screen, and nothing for custom domains', () => {
    assert.equal(inboxLink('a@gmail.com')?.label, 'Open Gmail');
    assert.equal(inboxLink('a@hotmail.ca')?.label, 'Open Outlook');
    assert.equal(inboxLink('a@icloud.com')?.label, 'Open iCloud Mail');
    assert.equal(inboxLink('info@thebarnartisanmarket.ca'), null);
  });
  it('remembers the last sign-in method and gives every entry point its own reason', () => {
    assert.match(readFileSync('src/components/FirebaseProvider.tsx', 'utf8'), /rememberSignIn\(currentUser\.providerData\.some/);
    assert.match(readFileSync('src/components/auth/AuthDialog.tsx', 'utf8'), /Last used/);
    for (const [file, title] of [['src/components/plans/GoingButton.tsx', 'Save it to your plans.'], ['src/pages/PlansPage.tsx', 'Last step: save it.'], ['src/pages/ClaimListingPage.tsx', 'title: `Claim ${entity.title}.`'], ['src/pages/VendorApplyPage.tsx', 'title: `Apply to ${market.title}.`'], ['src/pages/MarketHQPage.tsx', 'Open Market HQ.']]) assert.ok(readFileSync(file, 'utf8').includes(title), file);
  });
  it('keeps verification enforced in the client and Firestore rules', () => {
    assert.match(readFileSync('src/lib/claimsApi.ts','utf8'), /!user\.emailVerified/);
    assert.match(readFileSync('firestore.rules','utf8'), /request\.auth\.token\.email_verified == true/);
    const page=readFileSync('src/pages/ClaimListingPage.tsx','utf8');
    assert.match(page,/Verify your email before submitting this claim/);
    assert.match(page,/claim-draft:/);
  });
});
