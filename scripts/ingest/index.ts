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
import { fetchNewsFeedsCalgary } from './sources/rss.js';
import { fetchCalgary311Crime } from './sources/calgary-311.js';
import { fetchCalgaryPoliceNews } from './sources/calgary-police-news.js';
import type { NormalizedIncident } from './types.js';
import { DATA_SOURCE_BY_ID, type DataSourceId } from '../../src/config/dataSources.js';

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
  const ref = db.collection('incidents').doc(docId);

  const mutable = {
    ...incident,
    updatedAt: now,
    verified_status: incident.verified_status,
    report_count: 1,
    // The public map filters on `visibility`; a record written without it is
    // invisible. `deleted` is kept in step for documents and code paths that
    // predate the visibility migration.
    visibility: 'public',
    deleted: false,
    authorUid: 'system',
  };
  // `timestamp` is deliberately excluded from `mutable` — see below.
  delete (mutable as { timestamp?: number }).timestamp;

  try {
    // First sighting: stamp it once. 511 publishes planned work, so a source
    // time can be in the future; clampToNow pins it to when we read it.
    await ref.create({ ...mutable, timestamp: incident.timestamp ?? Date.now() });
  } catch (err) {
    const code = (err as { code?: number | string }).code;
    // ALREADY_EXISTS — refresh everything except the timestamp.
    //
    // Rewriting `timestamp` on every pass is what made week-old records show
    // as "just now" and re-surface as new each run. It bites hardest for
    // planned roadwork: its source time is in the future, so clamping it to
    // the run time would re-stamp it as brand new every thirty minutes and
    // permanently outrank real community reports in a newest-first feed.
    // The first sighting is the honest answer and it never moves.
    if (code !== 6 && code !== 'already-exists') throw err;
    await ref.set(mutable, { merge: true });
  }
}


// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type SourceJob = {
  id: DataSourceId;
  fetch: () => Promise<NormalizedIncident[]>;
  enabled?: boolean;
};

type SourceResult = {
  id: DataSourceId;
  status: 'ok' | 'error' | 'disabled';
  incidents: NormalizedIncident[];
  checkedAt: number;
  durationMs: number;
  error: string | null;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}

async function runSource(job: SourceJob): Promise<SourceResult> {
  const startedAt = Date.now();
  if (job.enabled === false) {
    return {
      id: job.id, status: 'disabled', incidents: [], checkedAt: startedAt,
      durationMs: 0, error: DATA_SOURCE_BY_ID.get(job.id)?.setupHint ?? 'Setup required.',
    };
  }
  try {
    const incidents = await job.fetch();
    return {
      id: job.id, status: 'ok', incidents, checkedAt: Date.now(),
      durationMs: Date.now() - startedAt, error: null,
    };
  } catch (error) {
    return {
      id: job.id, status: 'error', incidents: [], checkedAt: Date.now(),
      durationMs: Date.now() - startedAt, error: errorMessage(error),
    };
  }
}

async function publishSourceHealth(db: Firestore, results: SourceResult[]): Promise<void> {
  const batch = db.batch();
  for (const result of results) {
    const source = DATA_SOURCE_BY_ID.get(result.id);
    const ref = db.collection('ingestion_health').doc(result.id);
    batch.set(ref, {
      sourceId: result.id,
      name: source?.name ?? result.id,
      status: result.status,
      checkedAt: result.checkedAt,
      durationMs: result.durationMs,
      recordCount: result.incidents.length,
      error: result.error,
      runId: process.env.GITHUB_RUN_ID ?? 'local',
      ...(result.status === 'ok' ? { lastSuccessAt: result.checkedAt } : {}),
    }, { merge: true });
  }
  await batch.commit();
}

async function run(): Promise<void> {
  console.log(`[ingest] Starting — ${new Date().toISOString()}`);

  const db = initFirebase();

  // 2. Fetch all sources in parallel. Each result is persisted for the admin
  // dashboard, so an isolated upstream failure is visible without preventing
  // healthy sources from refreshing the public map.
  const jobs: SourceJob[] = [
    { id: 'calgary_311', fetch: fetchCalgary311Crime },
    { id: 'calgary_police_news', fetch: fetchCalgaryPoliceNews },
    { id: 'environment_canada', fetch: fetchEnvironmentCanadaAlerts },
    { id: 'alberta_emergency', fetch: fetchAlbertaEmergencyAlerts },
    { id: 'global_news', fetch: fetchNewsFeedsCalgary },
    {
      id: 'alberta_511', fetch: fetch511AlbertaEvents,
      enabled: Boolean(process.env.ALBERTA_511_API_KEY?.trim()),
    },
  ];
  const sourceResults = await Promise.all(jobs.map(runSource));
  await publishSourceHealth(db, sourceResults);

  for (const result of sourceResults) {
    const name = DATA_SOURCE_BY_ID.get(result.id)?.shortName ?? result.id;
    if (result.status === 'ok') {
      console.log(`[ingest] ${name}: ${result.incidents.length} record(s) in ${result.durationMs}ms.`);
    } else if (result.status === 'disabled') {
      console.log(`[ingest] ${name}: setup required; source skipped.`);
    } else {
      console.error(`[ingest] ${name} failed in ${result.durationMs}ms: ${result.error}`);
    }
  }

  const allIncidents = sourceResults.flatMap((result) => result.incidents);

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
