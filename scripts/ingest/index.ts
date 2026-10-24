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
import { classifyText, fetchNewsFeedsCalgary, placeWithPolice, takeUnplacedNews } from './sources/rss.js';
import { isSetElsewhere } from './sources/community-locator.js';
import { cleanText } from '../../src/lib/cleanText.js';
import { fetchCalgary311Crime } from './sources/calgary-311.js';
import { fetchCalgaryPoliceNews } from './sources/calgary-police-news.js';
import type { NormalizedIncident } from './types.js';
import { DATA_SOURCE_BY_ID, type DataSourceId } from '../../src/config/dataSources.js';
import { exitForQuota, isQuotaExhausted } from '../lib/quota.js';
import { buildPulseSnapshot, PULSE_DOC, PULSE_SAMPLE } from '../../src/lib/livePulseSnapshot.js';
import type { Incident } from '../../src/types/index.js';
import {
  buildCrimeBoard, CRIME_BOARD_DOC, CRIME_BOARD_REFRESH_MS, CRIME_BOARD_WINDOW_MS, isBoardIncident,
} from '../../src/lib/crimeBoard.js';

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
  // Calgary stories that named no place, placed by the police release they report on.
  const viaPolice = placeWithPolice(takeUnplacedNews(),
    sourceResults.find((r) => r.id === 'calgary_police_news')?.incidents ?? []);
  if (viaPolice.length) console.log(`[ingest] Placed ${viaPolice.length} news stor(ies) by their police release.`);
  allIncidents.push(...viaPolice);

  // 3. Prune expired system incidents (targeted query, not a full-collection scan).
  const pruned = await pruneExpired(db);
  console.log(`[ingest] Pruned ${pruned} expired incident(s).`);

  if (allIncidents.length === 0) {
    console.log('[ingest] No incidents to process. Done.');
    await writePulseSnapshot(db);
    await writeCrimeBoard(db, []);
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
  await writePulseSnapshot(db);
  await writeCrimeBoard(db, allIncidents);
}

/**
 * The map's crime board (src/lib/crimeBoard.ts): police releases, news crime,
 * emergency alerts and neighbours' crime reports from the last 35 days, so the
 * City's 311 volume can't push them out of the map's newest-60 window.
 *
 * Reads are what this costs, so it rebuilds only when this run brought crime
 * a story newer than the board or the board is two hours old. Member reports
 * posted in between still reach the map through its newest-60 query. Equality filters only, so no composite
 * index is needed. Best effort, like the pulse.
 */
async function writeCrimeBoard(db: Firestore, fetched: NormalizedIncident[]): Promise<void> {
  try {
    const ref = db.collection(CRIME_BOARD_DOC.collection).doc(CRIME_BOARD_DOC.id);
    const now = Date.now();
    const current = await ref.get();
    const checkedAt = current.exists ? Number(current.get('checkedAt')) : 0;
    // Feeds repeat a week of items every run; only a story newer than the board counts as news.
    const crimeArrived = fetched.some((i) => isBoardIncident(i) && (i.timestamp ?? 0) > checkedAt);
    if (!crimeArrived && Number.isFinite(checkedAt) && now - checkedAt < CRIME_BOARD_REFRESH_MS) {
      console.log('[ingest] Crime board is fresh; skipped.');
      return;
    }
    const snap = await db.collection('incidents')
      .where('visibility', '==', 'public')
      .where('category', 'in', ['crime', 'emergency'])
      .limit(1500)
      .get();
    const cutoff = now - CRIME_BOARD_WINDOW_MS;
    const incidents = (await repairNewsRows(db, snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Incident)
      .filter((i) => Number(i.timestamp) >= cutoff), now))
      .filter((i) => i.category === 'crime' || i.category === 'emergency');
    const board = buildCrimeBoard(incidents, now);
    await ref.set(board);
    const members = board.entries.filter((e) => e.member).length;
    console.log(`[ingest] Crime board: ${board.entries.length} record(s), ${members} from neighbours (read ${snap.size}).`);
  } catch (error) {
    console.warn('[ingest] Crime board skipped:', error instanceof Error ? error.message : error);
  }
}

/**
 * Stories stored before the news rules were fixed keep their old mistakes:
 * "&#8216;" in a headline, a Vancouver assault pinned downtown because the
 * victims were from Calgary, a pedestrian death filed as crime. Each run
 * re-reads the stored news rows against today's rules and fixes them in
 * place; a story set elsewhere is expired, so the usual prune removes it.
 * Only `news_rss` rows are touched, and only fields the feed itself set.
 */
async function repairNewsRows(db: Firestore, incidents: Incident[], now: number): Promise<Incident[]> {
  const out: Incident[] = [];
  let fixed = 0;
  let retired = 0;
  for (const incident of incidents) {
    if (incident.source_type !== 'news_rss') { out.push(incident); continue; }
    const title = cleanText(incident.title ?? '');
    const description = cleanText(incident.description ?? '');
    const ref = db.collection('incidents').doc(incident.id);
    if (isSetElsewhere(title, `${title} ${description}`)) {
      await ref.update({ expires_at: now - 1 }).catch(() => undefined);
      retired++;
      continue;
    }
    const category = classifyText(title, description) ?? incident.category;
    if (title !== incident.title || description !== incident.description || category !== incident.category) {
      await ref.update({ title, description, category }).catch(() => undefined);
      fixed++;
    }
    out.push({ ...incident, title, description, category });
  }
  if (fixed || retired) console.log(`[ingest] News rows repaired: ${fixed} fixed, ${retired} set elsewhere and expired.`);
  return out;
}

/**
 * The homepage's live summary, so a page view costs one read instead of 60.
 * Best effort: a failure here never fails the ingest, the page falls back.
 */
async function writePulseSnapshot(db: Firestore): Promise<void> {
  try {
    const snap = await db.collection('incidents').where('visibility', '==', 'public')
      .orderBy('timestamp', 'desc').limit(PULSE_SAMPLE).get();
    const incidents = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Incident);
    const pulse = buildPulseSnapshot(incidents, Date.now());
    await db.collection(PULSE_DOC.collection).doc(PULSE_DOC.id).set(pulse);
    console.log(`[ingest] Pulse snapshot: ${pulse.total} report(s) in the last 24h.`);
  } catch (error) {
    console.warn('[ingest] Pulse snapshot skipped:', error instanceof Error ? error.message : error);
  }
}

run().catch((err) => {
  if (isQuotaExhausted(err)) exitForQuota('Ingest');
  console.error('[ingest] Fatal error:', err);
  process.exit(1);
});
