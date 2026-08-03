/**
 * Calgary Watch — delete the example (demo) reports
 *
 * Run via the "Purge Example Reports" workflow, or locally:
 *   FIREBASE_SERVICE_ACCOUNT='{...}' npx tsx scripts/seed/purge-examples.ts [--dry-run]
 *
 * Removes the seeded example reports and leaves the map to real data: City of
 * Calgary 311, 511 Alberta, and genuine community submissions.
 *
 * Two conditions must BOTH hold before anything is deleted:
 *   1. data_source is 'demo'
 *   2. authorUid is one of the literal strings the seed scripts wrote
 *
 * The second condition exists because a previous cleanup matched on the author
 * email 'anonymous@calgarywatch.app', which is not unique to the seeder —
 * MapPage uses it for every genuine anonymous submission — and 15 real
 * residents' reports were wrongly relabelled as a result. A real submission
 * carries the signed-in user's Firebase UID, so requiring a known seeder uid
 * makes that failure impossible here.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

/** The only authorUid values the seed scripts ever wrote. */
const SEED_AUTHOR_UIDS = new Set(['seed', 'community', 'demo']);

const DRY_RUN = process.argv.includes('--dry-run');

function initFirebase(): Firestore {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(json)) });
  return getFirestore();
}

async function run(): Promise<void> {
  console.log(`[purge-examples] Starting${DRY_RUN ? ' (dry run)' : ''} — ${new Date().toISOString()}`);
  const db = initFirebase();

  const snapshot = await db.collection('incidents').where('data_source', '==', 'demo').get();

  const deletable = snapshot.docs.filter((d) =>
    SEED_AUTHOR_UIDS.has(String(d.get('authorUid') ?? '')),
  );
  const protectedDocs = snapshot.size - deletable.length;

  console.log(`[purge-examples] ${snapshot.size} demo-tagged; ${deletable.length} seeder-authored.`);
  if (protectedDocs > 0) {
    console.warn(
      `[purge-examples] ${protectedDocs} demo-tagged doc(s) have a real author uid and were NOT touched. ` +
        'Run restore-mislabelled.ts — those are real reports.',
    );
  }
  if (DRY_RUN || !deletable.length) {
    console.log(`[purge-examples] ${DRY_RUN ? 'Would delete' : 'Deleted'} ${DRY_RUN ? deletable.length : 0}.`);
    return;
  }

  for (let i = 0; i < deletable.length; i += 400) {
    const batch = db.batch();
    for (const doc of deletable.slice(i, i + 400)) batch.delete(doc.ref);
    await batch.commit();
  }

  console.log(`[purge-examples] Deleted ${deletable.length} example report(s).`);
}

run().catch((err) => {
  console.error('[purge-examples] Error:', err);
  process.exit(1);
});
