/**
 * Calgary Watch — delete every incident from one source
 *
 * Run via the "Prune Source" workflow, or locally:
 *   FIREBASE_SERVICE_ACCOUNT='{...}' npx tsx scripts/ingest/prune-source.ts "City of Calgary 311" [--dry-run]
 *
 * Why this exists: ingest sources apply per-category caps, but the collection
 * keeps whatever earlier runs wrote. When a source's rules change — a new cap,
 * a corrected timestamp, a different category mapping — the older documents
 * linger with their old values and can outrank the corrected ones.
 *
 * Deleting a source's documents and letting the next ingest repopulate them is
 * the clean way to re-sync. Only ever targets official ingested data, which is
 * reproducible by definition; community reports are never matched.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

const DRY_RUN = process.argv.includes('--dry-run');
const SOURCE_NAME = process.argv.slice(2).find((a) => !a.startsWith('--'));

function initFirebase(): Firestore {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(json)) });
  return getFirestore();
}

async function run(): Promise<void> {
  if (!SOURCE_NAME) {
    console.error('[prune] Usage: prune-source.ts "<source_name>" [--dry-run]');
    process.exit(1);
  }

  console.log(`[prune] Source "${SOURCE_NAME}"${DRY_RUN ? ' (dry run)' : ''}`);
  const db = initFirebase();

  const snapshot = await db
    .collection('incidents')
    .where('source_name', '==', SOURCE_NAME)
    .get();

  // Refuse to touch anything that is not official ingested data.
  const docs = snapshot.docs.filter((d) => d.get('data_source') === 'official');
  const skipped = snapshot.size - docs.length;

  console.log(`[prune] ${snapshot.size} match(es), ${docs.length} official, ${skipped} skipped as non-official.`);
  if (DRY_RUN || !docs.length) {
    console.log(`[prune] ${DRY_RUN ? 'Would delete' : 'Deleted'} ${DRY_RUN ? docs.length : 0} document(s).`);
    return;
  }

  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + 400)) batch.delete(doc.ref);
    await batch.commit();
  }

  console.log(`[prune] Deleted ${docs.length} document(s). The next ingest will repopulate.`);
}

run().catch((err) => {
  console.error('[prune] Error:', err);
  process.exit(1);
});
