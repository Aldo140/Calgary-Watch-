/**
 * Calgary Watch — one-off purge of synthetic incidents
 *
 * Run via the "Purge Synthetic Incidents" workflow, or locally:
 *   FIREBASE_SERVICE_ACCOUNT='{...}' npx tsx scripts/ingest/purge-synthetic.ts
 *
 * Context: two ingest sources (calgary-police.ts, calgary-infrastructure.ts)
 * contained no network calls at all — they emitted hardcoded, invented
 * incidents such as "[SW] High-risk area notification — CPS advisory: ..."
 * and wrote them with data_source: 'official' and
 * verified_status: 'community_confirmed', attributed to the Calgary Police
 * Service. On a public safety map that is fabricated official information
 * about a real organisation, so the generators were deleted.
 *
 * This removes the records they already published. Matching is by
 * source_type, which only those two generators ever produced, so no genuine
 * open-data or community record can be caught by it.
 *
 * Pass --dry-run to count without deleting.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore, Query } from 'firebase-admin/firestore';

/** Only ever emitted by the two deleted synthetic generators. */
const SYNTHETIC_SOURCE_TYPES = ['calgary_police_crime', 'calgary_infrastructure'];

/** Belt and braces: these source_name values were unique to the same generators. */
const SYNTHETIC_SOURCE_NAMES = [
  'Calgary Police Service',
  'Calgary Community Alerts',
  'Calgary Streets Data',
];

const DRY_RUN = process.argv.includes('--dry-run');

function initFirebase(): Firestore {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
  }
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  }
  return getFirestore();
}

/** Delete every document a query matches, in batches under the 500-write limit. */
async function deleteMatching(db: Firestore, query: Query, label: string): Promise<number> {
  const snapshot = await query.get();
  if (snapshot.empty) {
    console.log(`[purge] ${label}: 0 matches.`);
    return 0;
  }

  console.log(`[purge] ${label}: ${snapshot.size} match(es).`);
  for (const doc of snapshot.docs) {
    console.log(`         - ${doc.get('title') ?? doc.id}`);
  }

  if (DRY_RUN) return snapshot.size;

  let deleted = 0;
  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + 400)) batch.delete(doc.ref);
    await batch.commit();
    deleted += Math.min(400, docs.length - i);
  }
  return deleted;
}

async function run(): Promise<void> {
  console.log(`[purge] Starting${DRY_RUN ? ' (dry run)' : ''} — ${new Date().toISOString()}`);
  const db = initFirebase();
  let total = 0;

  for (const sourceType of SYNTHETIC_SOURCE_TYPES) {
    total += await deleteMatching(
      db,
      db.collection('incidents').where('source_type', '==', sourceType),
      `source_type=${sourceType}`,
    );
  }

  for (const sourceName of SYNTHETIC_SOURCE_NAMES) {
    total += await deleteMatching(
      db,
      db.collection('incidents').where('source_name', '==', sourceName),
      `source_name=${sourceName}`,
    );
  }

  console.log(`[purge] ${DRY_RUN ? 'Would delete' : 'Deleted'} ${total} document(s).`);
}

run().catch((error) => {
  console.error('[purge] Fatal:', error);
  process.exit(1);
});
