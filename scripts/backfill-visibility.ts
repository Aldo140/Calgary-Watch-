/**
 * Calgary Watch — visibility backfill
 *
 * Run ONCE, before deploying the rules and client that filter on `visibility`.
 *
 *   npm run backfill:visibility                 # dry run, uses your firebase login
 *   npm run backfill:visibility -- --commit     # writes
 *
 * Credentials: uses Application Default Credentials (what `firebase login`
 * and `gcloud auth application-default login` set up), or
 * FIREBASE_SERVICE_ACCOUNT if you prefer to pass one explicitly.
 *
 * ── Why this must run first ────────────────────────────────────────────────
 * Takedown is enforced as a query constraint (`where('visibility','==','public')`)
 * because Firestore rules filter queries, not rows. Firestore equality queries
 * do not match documents that lack the field, and community reports have never
 * carried `flagged` or `deleted` at all — the create allowlist did not permit
 * them. Deploying the new query against un-backfilled data returns zero
 * incidents and the public map goes blank.
 *
 * Deploy order:
 *   1. this backfill            (adds `visibility` to every document)
 *   2. firebase deploy --only firestore:indexes   (wait for indexes to build)
 *   3. firebase deploy --only firestore:rules
 *   4. deploy the client
 *
 * Defaults to a dry run. Pass --commit to write.
 */

import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const COMMIT = process.argv.includes('--commit');
const BATCH_SIZE = 400;

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID ?? 'calgary-map-e70bb';

function initFirebase(): Firestore {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!getApps().length) {
    // Falls back to Application Default Credentials so this can be run
    // straight after `firebase login`, without exporting a service-account key.
    initializeApp({
      credential: json ? cert(JSON.parse(json)) : applicationDefault(),
      projectId: PROJECT_ID,
    });
  }
  return getFirestore();
}

/** Mirrors incidentVisibility() in src/types/index.ts. */
function resolveVisibility(data: FirebaseFirestore.DocumentData): 'public' | 'flagged' | 'deleted' {
  if (data.visibility === 'public' || data.visibility === 'flagged' || data.visibility === 'deleted') {
    return data.visibility;
  }
  if (data.deleted === true) return 'deleted';
  if (data.flagged === true) return 'flagged';
  return 'public';
}

async function run(): Promise<void> {
  const db = initFirebase();
  console.log(`[backfill] ${COMMIT ? 'COMMIT' : 'DRY RUN'} — reading incidents…`);

  const snapshot = await db.collection('incidents').get();
  console.log(`[backfill] ${snapshot.size} document(s) scanned.`);

  const pending = snapshot.docs.filter((doc) => {
    const d = doc.data();
    const hasVisibility =
      d.visibility === 'public' || d.visibility === 'flagged' || d.visibility === 'deleted';
    const hasFlagFields = Array.isArray(d.flagged_by) && typeof d.flag_count === 'number';
    return !hasVisibility || !hasFlagFields;
  });

  const tally: Record<string, number> = { public: 0, flagged: 0, deleted: 0 };
  for (const doc of pending) tally[resolveVisibility(doc.data())]++;
  console.log(
    `[backfill] ${pending.length} need updating — ` +
      `public: ${tally.public}, flagged: ${tally.flagged}, deleted: ${tally.deleted}`,
  );

  if (!COMMIT) {
    console.log('[backfill] Dry run complete. Re-run with --commit to write.');
    return;
  }

  let written = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const doc of pending.slice(i, i + BATCH_SIZE)) {
      const d = doc.data();
      // `flagged_by` was previously a single uid string; the threshold rules
      // require a list, so normalise as we go.
      const priorFlaggers = Array.isArray(d.flagged_by)
        ? d.flagged_by
        : typeof d.flagged_by === 'string' && d.flagged_by
          ? [d.flagged_by]
          : [];
      batch.set(
        doc.ref,
        {
          visibility: resolveVisibility(d),
          flagged_by: priorFlaggers,
          flag_count: priorFlaggers.length,
        },
        { merge: true },
      );
    }
    await batch.commit();
    written += Math.min(BATCH_SIZE, pending.length - i);
    console.log(`[backfill] ${written}/${pending.length} written…`);
  }

  console.log(`[backfill] Done — ${written} document(s) updated.`);
}

run().catch((err) => {
  console.error('[backfill] Fatal error:', err);
  process.exit(1);
});
