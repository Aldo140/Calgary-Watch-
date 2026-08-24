/**
 * Publish the repository's Firestore rules through the Firebase Rules API.
 *
 * The Firebase CLI performs a Service Usage preflight that needs
 * serviceusage.services.get even when Firestore is already enabled. Our
 * least-privilege deploy account can publish rules but cannot inspect service
 * configuration, so the rules-only workflow uses the Admin SDK's supported
 * create-ruleset-and-release operation instead.
 */

import { readFile } from 'node:fs/promises';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required.');

const source = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
if (!source.includes('service cloud.firestore')) {
  throw new Error('firestore.rules does not contain a Cloud Firestore service declaration.');
}

const app = initializeApp({
  credential: applicationDefault(),
  projectId,
});

const ruleset = await getSecurityRules(app).releaseFirestoreRulesetFromSource(source);
console.log(`Published Firestore ruleset ${ruleset.name}.`);
