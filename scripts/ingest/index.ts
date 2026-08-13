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
import { fetchCalgary311Crime } from './sources/calgary-311.js';
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
// Deduplication + pruning
// ---------------------------------------------------------------------------

/**
 * Convert a dedup_key into a valid Firestore document ID.
 * Firestore IDs must not contain '/' and should stay under 1500 bytes.
 */
function dedupKeyToDocId(key: string): string {
  return key.replace(/\//g, '_').substring(0, 1500);
}

/**
 * Load the moderator suppression list.
 *
 * Without this, deleting an ingested incident is theatre: `upsertIncident`
 * writes by `dedup_key` with `merge: true` and unconditionally sets
 * `deleted: false`, so anything a moderator removed reappears on the next run
 * as long as the upstream feed still lists it.
 */
async function loadSuppressedIds(db: Firestore): Promise<Set<string>> {
  const snapshot = await db.collection('suppressed_incidents').get();
  const now = Date.now();
  const ids = new Set<string>();
  for (const doc of snapshot.docs) {
    const expiresAt = doc.data()?.expiresAt;
    if (typeof expiresAt === 'number' && expiresAt < now) continue;
    ids.add(doc.id);
  }
  return ids;
}

/**
 * Delete all system-ingested incidents whose expires_at has passed.
 * Only reads expired docs instead of scanning the full collection.
 */
async function pruneExpired(db: Firestore): Promise<number> {
  const now = Date.now();
  const snapshot = await db
    .collection('incidents')
    .where('authorUid', '==', 'system')
    .where('expires_at', '<', now)
    .get();

  if (snapshot.empty) return 0;

  const batch = db.batch();
  for (const doc of snapshot.docs) batch.delete(doc.ref);
  await batch.commit();
  return snapshot.size;
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

/**
 * Upsert an incident using dedup_key as the Firestore document ID.
 * No pre-read required — set() with merge:true creates or refreshes the doc.
 */
async function upsertIncident(
  db: Firestore,
  incident: NormalizedIncident,
): Promise<void> {
  const docId = dedupKeyToDocId(incident.dedup_key);
  const now = FieldValue.serverTimestamp();

  await db.collection('incidents').doc(docId).set(
    {
      ...incident,
      // Use the source's own report time. Overwriting this with Date.now() on
      // every run made week-old records show as "just now" and re-surface as
      // new on each 30-minute pass.
      timestamp: incident.timestamp ?? Date.now(),
      updatedAt: now,
      verified_status: incident.verified_status,
      report_count: 1,
      // The public map filters on `visibility`; a record written without it is
      // invisible. `deleted` is kept in step for documents and code paths that
      // predate the visibility migration.
      visibility: 'public',
      deleted: false,
      authorUid: 'system',
    },
    { merge: true },
  );
}


// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  console.log(`[ingest] Starting — ${new Date().toISOString()}`);

  const db = initFirebase();

  // 2. Fetch all sources in parallel (failures are isolated).
  const [ecAlerts, albertaTraffic, albertaEmergencyAlerts, reddit, newsFeeds, ecEnhanced, calgaryCrime] = await Promise.allSettled([
    fetchEnvironmentCanadaAlerts(),
    fetch511AlbertaEvents(),
    fetchAlbertaEmergencyAlerts(),
    fetchRedditCalgary(),
    fetchNewsFeedsCalgary(),
    fetchEnvironmentCanadaEnhanced(),
    fetchCalgary311Crime(),
  ]);

  const allIncidents: NormalizedIncident[] = [];

  if (calgaryCrime.status === 'fulfilled') {
    console.log(`[ingest] Calgary 311 property crime: ${calgaryCrime.value.length} report(s).`);
    allIncidents.push(...calgaryCrime.value);
  } else {
    console.error('[ingest] Calgary 311 property crime failed:', calgaryCrime.reason);
  }

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



  // 3. Prune expired system incidents (targeted query, not a full-collection scan).
  const pruned = await pruneExpired(db);
  console.log(`[ingest] Pruned ${pruned} expired incident(s).`);

  if (allIncidents.length === 0) {
    console.log('[ingest] No incidents to process. Done.');
    return;
  }

  // 4. Drop anything a moderator has suppressed, then upsert in series
  //    (avoids Firestore write-rate bursts).
  const suppressed = await loadSuppressedIds(db);
  let skipped = 0;
  for (const incident of allIncidents) {
    if (suppressed.has(dedupKeyToDocId(incident.dedup_key))) {
      skipped++;
      continue;
    }
    await upsertIncident(db, incident);
  }

  console.log(
    `[ingest] Done — upserted ${allIncidents.length - skipped} incident(s), ` +
      `skipped ${skipped} suppressed.`,
  );
}

run().catch((err) => {
  console.error('[ingest] Fatal error:', err);
  process.exit(1);
});
