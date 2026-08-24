/**
 * Calgary Watch — ENMAX Power Outage Ingest
 *
 * Run via GitHub Actions on a ~5 minute schedule:
 *   npx tsx scripts/ingest/power-outages.ts
 *
 * Required environment variables:
 *   FIREBASE_SERVICE_ACCOUNT  — JSON string of a Firebase service-account key
 *
 * The script fetches the ENMAX feed once, normalizes it, and publishes a single
 * snapshot document to Firestore. Every visitor reads that document, so ENMAX
 * receives exactly one request per run no matter how much traffic the map gets,
 * and the browser never talks to ENMAX directly.
 *
 * Failure policy: if ENMAX is unreachable or returns an unexpected shape, the
 * script exits WITHOUT writing. The previous snapshot stays in place and the
 * map keeps showing the last known outages, flagged as stale by the client once
 * the data ages. A bad fetch must never be published as "zero outages".
 *
 * This deliberately does NOT touch the `incidents` collection — ENMAX data is an
 * external live layer, not a community report.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import {
  ENMAX_PORTAL_URL,
  MAX_OUTAGES_PER_SNAPSHOT,
  OUTAGE_COLLECTION,
  OUTAGE_DOC_ID,
} from './enmax/config.js';
import { fetchEnmaxOutages } from './enmax/fetch.js';
import { DATA_SOURCE_BY_ID } from '../../src/config/dataSources.js';

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

async function run(): Promise<void> {
  console.log(`[outages] Starting — ${new Date().toISOString()}`);
  const db = initFirebase();
  const startedAt = Date.now();
  const healthRef = db.collection('ingestion_health').doc('enmax_outages');

  let outages;
  try {
    outages = await fetchEnmaxOutages();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    await healthRef.set({
      sourceId: 'enmax_outages',
      name: DATA_SOURCE_BY_ID.get('enmax_outages')?.name ?? 'ENMAX power outages',
      status: 'error',
      checkedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      recordCount: null,
      error: message,
      runId: process.env.GITHUB_RUN_ID ?? 'local',
    }, { merge: true });
    // Log the real reason for operators, then leave the existing snapshot alone.
    console.error('[outages] ENMAX fetch failed, keeping previous snapshot:', error);
    process.exitCode = 1;
    return;
  }

  if (outages.length > MAX_OUTAGES_PER_SNAPSHOT) {
    console.warn(
      `[outages] ENMAX returned ${outages.length} records; truncating to ${MAX_OUTAGES_PER_SNAPSHOT}.`,
    );
    outages = outages.slice(0, MAX_OUTAGES_PER_SNAPSHOT);
  }

  const checkedAt = Date.now();
  const batch = db.batch();
  batch.set(db.collection(OUTAGE_COLLECTION).doc(OUTAGE_DOC_ID), {
      outages,
      count: outages.length,
      // Plain epoch ms so the client can age the snapshot without a Timestamp import.
      updatedAt: checkedAt,
      source: 'ENMAX',
      sourceUrl: ENMAX_PORTAL_URL,
  });
  batch.set(healthRef, {
    sourceId: 'enmax_outages',
    name: DATA_SOURCE_BY_ID.get('enmax_outages')?.name ?? 'ENMAX power outages',
    status: 'ok',
    checkedAt,
    lastSuccessAt: checkedAt,
    durationMs: checkedAt - startedAt,
    recordCount: outages.length,
    error: null,
    runId: process.env.GITHUB_RUN_ID ?? 'local',
  }, { merge: true });
  await batch.commit();

  console.log(`[outages] Published ${outages.length} outage(s).`);
}

run().catch((error) => {
  console.error('[outages] Fatal:', error);
  process.exit(1);
});
