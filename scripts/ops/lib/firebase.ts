import { randomUUID } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

export const COLLECTIONS = {
  posts: 'ops_queue',
  leads: 'partner_leads',
  suppression: 'outreach_suppression',
  health: 'ops_health',
} as const;

function app() {
  if (!getApps().length) {
    initializeApp({
      credential: process.env.FIREBASE_SERVICE_ACCOUNT ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) : applicationDefault(),
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0683855942.firebasestorage.app',
    });
  }
  return getApps()[0]!;
}

/** Same database selection as the discovery pipeline (scripts/discovery/firebase.ts). */
export function opsDb(): Firestore {
  app();
  return getFirestore(process.env.VITE_FIRESTORE_DATABASE_ID || '(default)');
}

/**
 * Upload a rendered post. Instagram fetches the image by URL, so it gets a
 * Firebase download token: readable by whoever has the link, not listable.
 */
export async function uploadImage(path: string, png: Buffer): Promise<string> {
  const bucket = getStorage(app()).bucket();
  const token = randomUUID();
  await bucket.file(path).save(png, {
    contentType: 'image/png',
    resumable: false,
    metadata: { cacheControl: 'public, max-age=31536000', metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

export const hasFirebase = () => Boolean(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS);
