/** Run with Firebase emulators:exec (firestore + storage); never connects to a production project. */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectFirestoreEmulator, doc, getFirestore, setDoc, terminate } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, ref, uploadBytes } from 'firebase/storage';

const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
const stHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if (!fsHost || !/^127\.0\.0\.1:|^localhost:/.test(fsHost)) throw Error('Run inside the local Firestore emulator; remote projects are forbidden.');
if (!stHost || !/^127\.0\.0\.1:|^localhost:/.test(stHost)) throw Error('Run inside the local Storage emulator; remote buckets are forbidden.');
const projectId = 'demo-calgary-photos';
const bucket = `${projectId}.appspot.com`;
const apps: FirebaseApp[] = [];
let seq = 0;

function client(uid: string | null) {
  const app = initializeApp({ projectId, apiKey: 'emulator-only', storageBucket: bucket }, `photos-${++seq}`);
  apps.push(app);
  const token = uid ? { mockUserToken: { sub: uid, user_id: uid, email: `${uid}@example.org`, email_verified: true } } : {};
  const db = getFirestore(app);
  const [fh, fp] = fsHost!.split(':');
  connectFirestoreEmulator(db, fh, Number(fp), token);
  const storage = getStorage(app);
  const [sh, sp] = stHost!.split(':');
  connectStorageEmulator(storage, sh, Number(sp), token);
  return { db, storage };
}
after(async () => { await Promise.all(apps.map(async (app) => { await terminate(getFirestore(app)); await deleteApp(app); })); });

const jpeg = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });

test('a signed-in reporter can upload a JPEG to their own folder', async () => {
  const { storage } = client('u1');
  await uploadBytes(ref(storage, 'incidents/u1/1.jpeg'), jpeg(2048), { contentType: 'image/jpeg' });
});

test('signed out, another folder, oversized and non-image uploads are refused', async () => {
  await assert.rejects(uploadBytes(ref(client(null).storage, 'incidents/u1/2.jpeg'), jpeg(2048), { contentType: 'image/jpeg' }), /unauthorized|permission/i);
  const { storage } = client('u1');
  await assert.rejects(uploadBytes(ref(storage, 'incidents/u2/3.jpeg'), jpeg(2048), { contentType: 'image/jpeg' }), /unauthorized|permission/i);
  await assert.rejects(uploadBytes(ref(storage, 'incidents/u1/4.jpeg'), jpeg(5 * 1024 * 1024 + 1), { contentType: 'image/jpeg' }), /unauthorized|permission/i);
  await assert.rejects(uploadBytes(ref(storage, 'incidents/u1/5.svg'), new Blob(['<svg/>'], { type: 'image/svg+xml' }), { contentType: 'image/svg+xml' }), /unauthorized|permission/i);
  await assert.rejects(uploadBytes(ref(storage, 'incidents/u1/6.heic'), new Blob(['x'], { type: 'image/heic' }), { contentType: 'image/heic' }), /unauthorized|permission/i);
});

function incident(uid: string, extra: Record<string, unknown> = {}) {
  return {
    title: 'Bike stolen from parkade', description: 'Lock cut overnight, blue Norco.', category: 'crime', neighborhood: 'Beltline',
    lat: 51.04, lng: -114.07, timestamp: Date.now(), name: 'Dana', source_name: 'Dana', anonymous: false,
    verified_status: 'unverified', report_count: 1, authorUid: uid, visibility: 'public', flag_count: 0, flagged_by: [], ...extra,
  };
}
const own = (uid: string) => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/incidents%2F${uid}%2F1729.jpeg?alt=media&token=abc-123`;

test('a report may carry a photo URL from its own folder, or none', async () => {
  const { db } = client('u1');
  await setDoc(doc(db, 'incidents', 'p1'), incident('u1'));
  await setDoc(doc(db, 'incidents', 'p2'), incident('u1', { image_url: own('u1') }));
});

test('a report cannot point its photo anywhere else', async () => {
  const { db } = client('u1');
  for (const image_url of [
    'https://example.org/pixel.gif',
    own('u2'),
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/listings%2Fu1%2F1.jpeg?alt=media`,
    `https://firebasestorage.googleapis.com.evil.example/v0/b/${bucket}/o/incidents%2Fu1%2F1.jpeg`,
    `http://firebasestorage.googleapis.com/v0/b/${bucket}/o/incidents%2Fu1%2F1.jpeg`,
    42,
  ]) {
    await assert.rejects(setDoc(doc(db, 'incidents', crypto.randomUUID()), incident('u1', { image_url })), /permission/i, String(image_url));
  }
});
