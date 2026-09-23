/**
 * Publish the repository's Firestore and Storage rules through the Firebase
 * Rules API.
 *
 * The Firebase CLI performs a Service Usage preflight that needs
 * serviceusage.services.get even when Firestore is already enabled. Our
 * least-privilege deploy account can publish rules but cannot inspect service
 * configuration, so the rules-only workflow uses the Admin SDK's supported
 * create-ruleset-and-release operation instead. Keeping both rule products
 * together matters: a report photo is uploaded to Storage before its incident
 * document is written to Firestore.
 */

import { readFile } from 'node:fs/promises';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required.');

const firestoreSource = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const storageSource = await readFile(new URL('../storage.rules', import.meta.url), 'utf8');
if (!firestoreSource.includes('service cloud.firestore')) {
  throw new Error('firestore.rules does not contain a Cloud Firestore service declaration.');
}
if (!storageSource.includes('service firebase.storage')) {
  throw new Error('storage.rules does not contain a Cloud Storage service declaration.');
}

const app = initializeApp({
  credential: applicationDefault(),
  projectId,
});

const rules = getSecurityRules(app);
const firestoreRuleset = await rules.releaseFirestoreRulesetFromSource(firestoreSource);
const storageRuleset = await rules.releaseStorageRulesetFromSource(storageSource);
console.log(`Published Firestore ruleset ${firestoreRuleset.name}.`);
console.log(`Published Storage ruleset ${storageRuleset.name}.`);
