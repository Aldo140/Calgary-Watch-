/**
 * Calgary Watch — Live Data Ingestion Pipeline
 *
 * Run via GitHub Actions on a schedule:
 *   npx tsx scripts/ingest/index.ts
 *
 * Required environment variables:
 *   FIREBASE_SERVICE_ACCOUNT  — JSON string of a Firebase service-account key
 *   VITE_FIREBASE_PROJECT_ID  — Firebase project ID (same secret used for builds)
 *
 * The script:
 *  1. Fetches data from each source
 *  2. Deduplicates against Firestore using the `dedup_key` field
 *  3. Creates new incidents or updates the `expires_at` of existing ones
 *  4. Deletes incidents whose `expires_at` has passed (house-keeping)
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { fetchEnvironmentCanadaAlerts } from './sources/environment-canada.js';
import { fetch511AlbertaEvents } from './sources/511-alberta.js';
import { fetchAlbertaEmergencyAlerts } from './sources/alberta-emergency-alert.js';
import { fetchRedditCalgary } from './sources/reddit.js';
import { fetchNewsFeedsCalgary } from './sources/rss.js';
import { fetchEnvironmentCanadaEnhanced } from './sources/environment-canada-enhanced.js';
import { fetchCalgaryPoliceData } from './sources/calgary-police.js';
import { fetchCalgaryInfrastructureAlerts } from './sources/calgary-infrastructure.js';
import type { NormalizedIncident } from './types.js';

// ---------------------------------------------------------------------------
// Firebase Admin init
// ---------------------------------------------------------------------------

function initFirebase(): Firestore {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
  }

  const serviceAccount = JSON.parse(serviceAccountJson);

  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
  }

  return getFirestore();
}

// ---------------------------------------------------------------------------
// Deduplication + pruning (single Firestore read)
// ---------------------------------------------------------------------------

/**
 * Single-pass over all ingested incidents:
 *  - Soft-deletes any doc whose expires_at is in the past
 *  - Returns a dedup_key → doc-ID map for all still-active docs
 *
 * This replaces the former separate loadExistingKeys + pruneExpiredIncidents
 * calls, halving the number of Firestore reads per ingest run.
 */
async function loadAndPrune(
  db: Firestore
): Promise<{ existing: Map<string, string>; pruned: number }> {
  const now = Date.now();
  const snapshot = await db
    .collection('incidents')
    .where('dedup_key', '!=', null)
    .get();

  const existing = new Map<string, string>();
  const batch = db.batch();
  let pruned = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.deleted) continue;

    const expiresAt = data.expires_at as number | undefined;
    if (expiresAt && expiresAt < now) {
      batch.delete(doc.ref);
      pruned++;
    } else {
      const key = data.dedup_key as string | undefined;
      if (key) existing.set(key, doc.id);
    }
  }

  if (pruned > 0) await batch.commit();
  return { existing, pruned };
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

async function upsertIncident(
  db: Firestore,
  incident: NormalizedIncident,
  existingId: string | undefined
): Promise<'created' | 'updated' | 'skipped'> {
  const now = FieldValue.serverTimestamp();

  if (existingId) {
    // Update only the expiry — don't overwrite fields the admin may have edited.
    await db.collection('incidents').doc(existingId).update({
      expires_at: incident.expires_at,
      updatedAt: now,
    });
    return 'updated';
  }

  // Create new incident.
  await db.collection('incidents').add({
    ...incident,
    timestamp: Date.now(),
    createdAt: now,
    verified_status: incident.verified_status,
    report_count: 1,
    deleted: false,
    authorUid: 'system',
  });
  return 'created';
}


// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  console.log(`[ingest] Starting — ${new Date().toISOString()}`);

  const db = initFirebase();

  // 2. Fetch all sources in parallel (failures are isolated).
  const [ecAlerts, albertaTraffic, albertaEmergencyAlerts, reddit, newsFeeds, ecEnhanced, cpsData, infrastructure] = await Promise.allSettled([
    fetchEnvironmentCanadaAlerts(),
    fetch511AlbertaEvents(),
    fetchAlbertaEmergencyAlerts(),
    fetchRedditCalgary(),
    fetchNewsFeedsCalgary(),
    fetchEnvironmentCanadaEnhanced(),
    fetchCalgaryPoliceData(),
    fetchCalgaryInfrastructureAlerts(),
  ]);

  const allIncidents: NormalizedIncident[] = [];

  if (ecAlerts.status === 'fulfilled') {
    console.log(`[ingest] Environment Canada: ${ecAlerts.value.length} alert(s).`);
    allIncidents.push(...ecAlerts.value);
  } else {
    console.error('[ingest] Environment Canada failed:', ecAlerts.reason);
  }

  if (albertaTraffic.status === 'fulfilled') {
    console.log(`[ingest] 511 Alberta: ${albertaTraffic.value.length} event(s).`);
    allIncidents.push(...albertaTraffic.value);
  } else {
    console.error('[ingest] 511 Alberta failed:', albertaTraffic.reason);
  }

  if (albertaEmergencyAlerts.status === 'fulfilled') {
    console.log(`[ingest] Alberta Emergency Alert: ${albertaEmergencyAlerts.value.length} alert(s).`);
    allIncidents.push(...albertaEmergencyAlerts.value);
  } else {
    console.error('[ingest] Alberta Emergency Alert failed:', albertaEmergencyAlerts.reason);
  }

  if (reddit.status === 'fulfilled') {
    console.log(`[ingest] Reddit r/Calgary: ${reddit.value.length} post(s).`);
    allIncidents.push(...reddit.value);
  } else {
    console.error('[ingest] Reddit failed:', reddit.reason);
  }

  if (newsFeeds.status === 'fulfilled') {
    console.log(`[ingest] News RSS feeds: ${newsFeeds.value.length} article(s).`);
    allIncidents.push(...newsFeeds.value);
  } else {
    console.error('[ingest] News RSS failed:', newsFeeds.reason);
  }

  if (ecEnhanced.status === 'fulfilled') {
    console.log(`[ingest] Environment Canada Enhanced: ${ecEnhanced.value.length} alert(s).`);
    allIncidents.push(...ecEnhanced.value);
  } else {
    console.error('[ingest] Environment Canada Enhanced failed:', ecEnhanced.reason);
  }

  if (cpsData.status === 'fulfilled') {
    console.log(`[ingest] Calgary Police Service: ${cpsData.value.length} incident(s).`);
    allIncidents.push(...cpsData.value);
  } else {
    console.error('[ingest] Calgary Police Service failed:', cpsData.reason);
  }

  if (infrastructure.status === 'fulfilled') {
    console.log(`[ingest] Calgary Infrastructure: ${infrastructure.value.length} alert(s).`);
    allIncidents.push(...infrastructure.value);
  } else {
    console.error('[ingest] Calgary Infrastructure failed:', infrastructure.reason);
  }

  if (allIncidents.length === 0) {
    console.log('[ingest] No incidents to process. Done.');
    return;
  }

  // 3. Load existing dedup keys and prune expired incidents in a single read.
  const { existing, pruned } = await loadAndPrune(db);
  console.log(`[ingest] ${existing.size} active key(s); pruned ${pruned} expired incident(s).`);

  // 4. Upsert in series (avoids Firestore write-rate bursts).
  let created = 0;
  let updated = 0;

  for (const incident of allIncidents) {
    const existingId = existing.get(incident.dedup_key);
    const result = await upsertIncident(db, incident, existingId);
    if (result === 'created') created++;
    if (result === 'updated') updated++;
  }

  console.log(`[ingest] Done — created: ${created}, updated: ${updated}.`);
}

run().catch((err) => {
  console.error('[ingest] Fatal error:', err);
  process.exit(1);
});
