/**
 * Calgary Watch — restore community reports wrongly labelled as examples
 *
 * Run via the "Restore Mislabelled Reports" workflow, or locally:
 *   FIREBASE_SERVICE_ACCOUNT='{...}' npx tsx scripts/seed/restore-mislabelled.ts [--dry-run]
 *
 * What went wrong: relabel-demo.ts matched seeded content partly by author
 * email, including 'anonymous@calgarywatch.app'. That address is not unique to
 * the seeder — MapPage uses it for every genuine anonymous submission. So real
 * residents' reports were relabelled data_source:'demo', badged "Example" in
 * the UI, and had their author overwritten with "Calgary Watch".
 *
 * Seeded content is identifiable by authorUid alone: the seeders wrote the
 * literal strings 'seed' and 'community', while a real submission carries the
 * signed-in user's Firebase UID. Anything tagged demo with a real UID was
 * caught by mistake and is restored here.
 *
 * The original display name cannot be recovered, but every affected report was
 * an anonymous submission by definition of the address that matched, so
 * 'Anonymous' is the correct value.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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
  console.log(`[restore] Starting${DRY_RUN ? ' (dry run)' : ''} — ${new Date().toISOString()}`);
  const db = initFirebase();

  const snapshot = await db
    .collection('incidents')
    .where('data_source', '==', 'demo')
    .get();

  // A real Firebase UID means this was never seeded content.
  const wrong = snapshot.docs.filter((d) => !SEED_AUTHOR_UIDS.has(String(d.get('authorUid') ?? '')));

  console.log(`[restore] ${snapshot.size} demo-tagged, ${wrong.length} wrongly caught.`);
  for (const doc of wrong) {
    console.log(`           - ${doc.get('title') ?? doc.id}  (uid ${doc.get('authorUid')})`);
  }
  if (DRY_RUN || !wrong.length) {
    console.log(`[restore] ${DRY_RUN ? 'Would restore' : 'Restored'} ${DRY_RUN ? wrong.length : 0}.`);
    return;
  }

  for (let i = 0; i < wrong.length; i += 400) {
    const batch = db.batch();
    for (const doc of wrong.slice(i, i + 400)) {
      batch.update(doc.ref, {
        data_source: 'community',
        name: 'Anonymous',
        anonymous: true,
        source_name: FieldValue.delete(),
      });
    }
    await batch.commit();
  }

  console.log(`[restore] Restored ${wrong.length} community report(s).`);
}

run().catch((err) => {
  console.error('[restore] Error:', err);
  process.exit(1);
});
