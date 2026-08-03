/**
 * Calgary Watch — relabel previously seeded reports as examples
 *
 * Run via the "Relabel Seeded Reports" workflow, or locally:
 *   FIREBASE_SERVICE_ACCOUNT='{...}' npx tsx scripts/seed/relabel-demo.ts [--dry-run]
 *
 * Context: the seed scripts used to publish reports as data_source:'community'
 * under invented neighbour names ("Megan T.", "Sandra K."), which made them
 * indistinguishable from real submissions. They now publish as
 * data_source:'demo', which every surface badges as an example and every count
 * and score skips.
 *
 * This brings the already-published ones in line. Matching is on the two
 * machine-generated author identities the seeders wrote — a real submission
 * carries the signed-in user's uid and email, so it cannot be caught here.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore, Query } from 'firebase-admin/firestore';

/** Only ever written by scripts/seed/*. Never by a real submission. */
const SEED_AUTHOR_UIDS = ['seed', 'community'];
const SEED_EMAILS = ['seed@calgarywatch.app', 'anonymous@calgarywatch.app'];

const DRY_RUN = process.argv.includes('--dry-run');

function initFirebase(): Firestore {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(json)) });
  return getFirestore();
}

async function relabel(db: Firestore, query: Query, label: string): Promise<number> {
  const snapshot = await query.get();
  const pending = snapshot.docs.filter((d) => d.get('data_source') !== 'demo');

  console.log(`[relabel] ${label}: ${snapshot.size} match(es), ${pending.length} need relabelling.`);
  for (const doc of pending) {
    console.log(`           - ${doc.get('title') ?? doc.id}  (by ${doc.get('name') ?? 'unknown'})`);
  }
  if (DRY_RUN || !pending.length) return pending.length;

  for (let i = 0; i < pending.length; i += 400) {
    const batch = db.batch();
    for (const doc of pending.slice(i, i + 400)) {
      batch.update(doc.ref, {
        data_source: 'demo',
        // Stop attributing invented reports to invented residents.
        name: 'Calgary Watch',
        source_name: 'Calgary Watch example',
        anonymous: false,
      });
    }
    await batch.commit();
  }
  return pending.length;
}

async function run(): Promise<void> {
  console.log(`[relabel] Starting${DRY_RUN ? ' (dry run)' : ''} — ${new Date().toISOString()}`);
  const db = initFirebase();
  let total = 0;

  for (const uid of SEED_AUTHOR_UIDS) {
    total += await relabel(
      db,
      db.collection('incidents').where('authorUid', '==', uid),
      `authorUid=${uid}`,
    );
  }
  for (const email of SEED_EMAILS) {
    total += await relabel(
      db,
      db.collection('incidents').where('email', '==', email),
      `email=${email}`,
    );
  }

  console.log(`[relabel] ${DRY_RUN ? 'Would relabel' : 'Relabelled'} ${total} document(s).`);
}

run().catch((err) => {
  console.error('[relabel] Error:', err);
  process.exit(1);
});
