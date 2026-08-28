/**
 * Publishes privacy-safe aggregate traffic flow to live_data/traffic_flow.
 *
 * Provider contract:
 *   TRAFFIC_FLOW_URL     HTTPS endpoint returning an array, {segments: []}, or
 *                        a GeoJSON FeatureCollection.
 *   TRAFFIC_FLOW_TOKEN   Optional bearer token.
 *   TRAFFIC_FLOW_SOURCE  Optional public attribution label.
 *   TRAFFIC_FLOW_PUBLIC_URL Optional public provider information page.
 *
 * Only segment geometry, aggregate speed/count, confidence, trend, and source
 * attribution survive normalization. Identity-shaped records are rejected.
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  makeTrafficFlowSnapshot,
  normalizeTrafficProviderPayload,
  TRAFFIC_FLOW_COLLECTION,
  TRAFFIC_FLOW_DOC_ID,
} from '../../src/lib/trafficFlow.js';
import { DATA_SOURCE_BY_ID } from '../../src/config/dataSources.js';

const MAX_SNAPSHOT_BYTES = 850_000;
const SOURCE_ID = 'aggregate_traffic_flow';

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} environment variable is not set.`);
  return value;
}

async function run(): Promise<void> {
  const serviceAccountJson = requiredEnvironment('FIREBASE_SERVICE_ACCOUNT');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  const db = getFirestore();
  const healthRef = db.collection('ingestion_health').doc(SOURCE_ID);
  const providerUrl = process.env.TRAFFIC_FLOW_URL?.trim();
  const source = process.env.TRAFFIC_FLOW_SOURCE?.trim() || 'Aggregate traffic flow provider';
  const publicSourceUrl = process.env.TRAFFIC_FLOW_PUBLIC_URL?.trim();
  const startedAt = Date.now();

  if (!providerUrl) {
    await healthRef.set({
      sourceId: SOURCE_ID,
      name: DATA_SOURCE_BY_ID.get(SOURCE_ID)?.name ?? 'Aggregate traffic flow',
      status: 'disabled',
      checkedAt: startedAt,
      durationMs: 0,
      recordCount: 0,
      error: DATA_SOURCE_BY_ID.get(SOURCE_ID)?.setupHint ?? 'Provider setup required.',
      runId: process.env.GITHUB_RUN_ID ?? 'local',
    }, { merge: true });
    console.log('[traffic-flow] Provider not configured; public layer will use its labelled annual baseline.');
    return;
  }

  let segments;
  try {
    const token = process.env.TRAFFIC_FLOW_TOKEN?.trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(providerUrl, {
      headers: {
        Accept: 'application/json, application/geo+json',
        'User-Agent': 'Calgary-Watch/1.0 aggregate-traffic-ingest',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
    segments = normalizeTrafficProviderPayload(await response.json(), Date.now(), source);
    if (segments.length === 0) throw new Error('Provider returned no valid privacy-safe road segments.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    await healthRef.set({
      sourceId: SOURCE_ID,
      name: DATA_SOURCE_BY_ID.get(SOURCE_ID)?.name ?? 'Aggregate traffic flow',
      status: 'error',
      checkedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      recordCount: null,
      error: message,
      runId: process.env.GITHUB_RUN_ID ?? 'local',
    }, { merge: true });
    console.error('[traffic-flow] Fetch failed; keeping the previous snapshot:', message);
    process.exitCode = 1;
    return;
  }

  const updatedAt = Date.now();
  const observedAt = Math.min(updatedAt, Math.max(...segments.map((segment) => segment.updatedAt)));
  // Never publish the fetch URL: vendor endpoints commonly carry API keys in
  // their query string. Only an explicitly public attribution URL is safe.
  let snapshot = makeTrafficFlowSnapshot(segments, source, observedAt, publicSourceUrl);
  while (snapshot.segments.length > 1 && Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_SNAPSHOT_BYTES) {
    snapshot = { ...snapshot, segments: snapshot.segments.slice(0, Math.floor(snapshot.segments.length * 0.85)) };
  }
  if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_SNAPSHOT_BYTES) {
    throw new Error('A single normalized traffic segment exceeds the safe Firestore snapshot size.');
  }

  const batch = db.batch();
  batch.set(db.collection(TRAFFIC_FLOW_COLLECTION).doc(TRAFFIC_FLOW_DOC_ID), snapshot);
  batch.set(healthRef, {
    sourceId: SOURCE_ID,
    name: DATA_SOURCE_BY_ID.get(SOURCE_ID)?.name ?? 'Aggregate traffic flow',
    status: 'ok',
    checkedAt: updatedAt,
    lastSuccessAt: updatedAt,
    durationMs: updatedAt - startedAt,
    recordCount: snapshot.segments.length,
    error: null,
    runId: process.env.GITHUB_RUN_ID ?? 'local',
  }, { merge: true });
  await batch.commit();
  console.log(`[traffic-flow] Published ${snapshot.segments.length} aggregate road segment(s).`);
}

run().catch((error) => {
  console.error('[traffic-flow] Fatal:', error);
  process.exit(1);
});
