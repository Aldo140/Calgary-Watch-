/**
 * Calgary Watch — repair future-dated incident timestamps.
 *
 *   npx tsx scripts/repair-future-timestamps.ts            # dry run
 *   npx tsx scripts/repair-future-timestamps.ts --commit   # writes
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 * 511 Alberta publishes *planned* road work, so an event carries a StartDate
 * days ahead of the ingest run. Until `clampToNow` was added to the 511 source,
 * those planned times were written straight to `timestamp`.
 *
 * The public feed loads `orderBy('timestamp','desc')` with a page limit, so a
 * record dated next week sits permanently at the top of the first page. Enough
 * of them and genuine community reports never make it into the loaded window
 * at all — they appear neither as map pins nor in the feed, which is exactly
 * the symptom this repairs.
 *
 * Fixing the source stops new bad rows; this fixes the rows already stored.
 * Timestamps are clamped to the moment the record was last written rather than
 * to "now", so a record keeps a truthful position in the ordering.
 */

import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const DRY_RUN_REQUESTED = process.argv.includes('--dry-run');
const COMMIT = process.argv.includes('--commit') && !DRY_RUN_REQUESTED;
const BATCH_SIZE = 400;
const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID ?? 'calgary-map-e70bb';

function initFirebase(): Firestore {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!getApps().length) {
    initializeApp({
      credential: json ? cert(JSON.parse(json)) : applicationDefault(),
      projectId: PROJECT_ID,
    });
  }
  return getFirestore();
}

/** Firestore stores these as a number, a Timestamp, or {seconds}. */
function coerceMillis(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const t = value as { toMillis?: () => number; seconds?: number };
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t.seconds === 'number') return t.seconds * 1000;
  }
  return null;
}

async function run(): Promise<void> {
  const db = initFirebase();
  const now = Date.now();
  console.log(`[repair] ${COMMIT ? 'COMMIT' : 'DRY RUN'} — scanning incidents…`);

  const snapshot = await db.collection('incidents').get();
  const offenders = snapshot.docs
    .map((doc) => {
      const d = doc.data();
      const ts = coerceMillis(d.timestamp);
      if (ts === null || ts <= now) return null;
      // Prefer the write time: it is when we actually learned of the record.
      const corrected = coerceMillis(d.updatedAt) ?? now;
      return { doc, ts, corrected: Math.min(corrected, now), title: String(d.title ?? '') };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  console.log(`[repair] ${snapshot.size} scanned, ${offenders.length} dated in the future.`);
  for (const o of offenders.slice(0, 10)) {
    console.log(`   +${((o.ts - now) / 86_400_000).toFixed(2)}d  ${o.title.slice(0, 48)}`);
  }
  if (offenders.length > 10) console.log(`   … and ${offenders.length - 10} more`);

  if (!COMMIT) {
    console.log('[repair] Dry run complete. Re-run with --commit to write.');
    return;
  }

  let written = 0;
  for (let i = 0; i < offenders.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const o of offenders.slice(i, i + BATCH_SIZE)) {
      batch.set(o.doc.ref, { timestamp: o.corrected }, { merge: true });
    }
    await batch.commit();
    written += Math.min(BATCH_SIZE, offenders.length - i);
    console.log(`[repair] ${written}/${offenders.length} written…`);
  }
  console.log(`[repair] Done — ${written} timestamp(s) corrected.`);
}

run().catch((err) => {
  console.error('[repair] Fatal error:', err);
  process.exit(1);
});
