/**
 * Sets CORS on the Firebase Storage bucket via the Admin SDK.
 * Run once: FIREBASE_SERVICE_ACCOUNT='<json>' npx tsx scripts/set-storage-cors.ts
 */
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const SA_JSON = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!SA_JSON) {
  console.error('Set FIREBASE_SERVICE_ACCOUNT env var to your service account JSON string.');
  process.exit(1);
}

const sa = JSON.parse(SA_JSON) as { project_id: string; client_email: string; private_key: string };

const CORS = [
  {
    origin: ['https://calgarywatch.ca', 'http://localhost:5173', 'http://localhost:4173'],
    method: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
    responseHeader: ['Content-Type', 'Authorization', 'Content-Length', 'User-Agent', 'x-goog-resumable'],
    maxAgeSeconds: 3600,
  },
];

// List all available buckets first
const listApp = initializeApp({ credential: cert(sa) }, 'list');
const storage = getStorage(listApp);

let buckets: { name: string }[] = [];
try {
  const [b] = await storage.getBuckets();
  buckets = b;
  console.log('Available buckets:');
  for (const bucket of buckets) console.log(' -', bucket.name);
} catch (err) {
  console.error('Could not list buckets:', err instanceof Error ? err.message : err);
}
await deleteApp(listApp);

// Try to set CORS on each candidate
const candidates = buckets.length > 0
  ? buckets.map(b => b.name)
  : [`${sa.project_id}.firebasestorage.app`, `${sa.project_id}.appspot.com`];

let ok = false;
for (const name of candidates) {
  try {
    console.log(`\nTrying gs://${name} ...`);
    const app = initializeApp({ credential: cert(sa), storageBucket: name }, name);
    const bucket = getStorage(app).bucket();
    await bucket.setCorsConfiguration(CORS);
    console.log(`✅ CORS set on gs://${name}`);
    await deleteApp(app);
    ok = true;
    break;
  } catch (err) {
    console.log('  ✗', err instanceof Error ? err.message : err);
  }
}

if (!ok) {
  console.error('\n❌ Could not set CORS. The service account may need Storage Admin role.');
  console.error('Go to: https://console.cloud.google.com/iam-admin/iam?project=' + sa.project_id);
  console.error('Find the service account and add the "Storage Admin" role.');
  process.exit(1);
}
