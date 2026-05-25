/**
 * One-time backfill: writes createdAt to every Firestore user doc that's missing it,
 * using the accurate creationTime from Firebase Auth metadata.
 *
 * Run (Firebase CLI already logged in):
 *   npx tsx scripts/backfill-created-at.ts
 *
 * Or with a service account:
 *   FIREBASE_SERVICE_ACCOUNT='<json>' npx tsx scripts/backfill-created-at.ts
 */
import { initializeApp, cert, applicationDefault, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'calgary-map-e70bb';

const SA_JSON = process.env.FIREBASE_SERVICE_ACCOUNT;
const credential = SA_JSON
  ? cert(JSON.parse(SA_JSON) as { project_id: string; client_email: string; private_key: string })
  : applicationDefault();

const app = initializeApp({ credential, projectId: PROJECT_ID });
const auth = getAuth(app);
const db = getFirestore(app);

let checked = 0;
let backfilled = 0;
let skipped = 0;
let pageToken: string | undefined;

console.log('Backfilling createdAt for existing users...\n');

do {
  const listResult = await auth.listUsers(1000, pageToken);

  for (const user of listResult.users) {
    checked++;
    const ref = db.collection('users').doc(user.uid);
    const snap = await ref.get();

    if (!snap.exists || snap.data()?.createdAt) {
      skipped++;
      continue;
    }

    const createdAt = user.metadata.creationTime
      ? new Date(user.metadata.creationTime).getTime()
      : Date.now();

    await ref.update({ createdAt });
    backfilled++;
    console.log(`  ✅ ${user.email || user.uid} → ${new Date(createdAt).toLocaleString('en-CA')}`);
  }

  pageToken = listResult.pageToken;
} while (pageToken);

console.log(`\nDone. Checked ${checked} users — ${backfilled} backfilled, ${skipped} already had createdAt.`);
await deleteApp(app);
