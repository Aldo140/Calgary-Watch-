// Publishes the HQ snapshot (lib/hqSnapshot.ts) to the arctos-hq Firestore
// project, which the dashboard at arctoslaunchpad.com/hq reads.
//
// Reads CalgaryWatch's ops data with FIREBASE_SERVICE_ACCOUNT and writes to
// arctos-hq with HQ_ACCESS_TOKEN: a short-lived Google token the workflow gets
// through keyless GitHub OIDC (google-github-actions/auth). No key is stored.
//
// Partner leads are the expensive read, so pipelines are refreshed at most
// every 6 hours and otherwise carried over from the previous snapshot.

import type { AccountHistory, OpsHealth, OpsPerformance, OpsPost, PartnerLead } from '../../src/types/ops';
import { COLLECTIONS, hasFirebase, opsDb } from './lib/firebase';
import { bottlenecks, calgaryDailySummary, calgaryWatchPipeline, notConnected, spendSummary, todayItems, SNAPSHOT_VERSION, type HqSnapshot, type SpendDay } from './lib/hqSnapshot';
import type { ScoutEntry } from './lib/scout';
import { calgaryDate } from './lib/time';
import { USAGE_COLLECTION } from './jobs/usage';

const log = (m: string) => console.log(`[hq-snapshot] ${m}`);
const DOC = 'https://firestore.googleapis.com/v1/projects/arctos-hq/databases/(default)/documents/hq/snapshot';
const DAY = 86_400_000;
const PIPELINE_TTL = 6 * 3_600_000;

const token = process.env.HQ_ACCESS_TOKEN;
if (!token) { log('HQ_ACCESS_TOKEN not set (the workflow could not sign in to arctos-hq); skipped.'); process.exit(0); }
if (!hasFirebase()) { log('FIREBASE_SERVICE_ACCOUNT is required.'); process.exit(1); }

const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const now = Date.now();
const db = opsDb();

async function previous(): Promise<HqSnapshot | null> {
  const r = await fetch(DOC, { headers });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`reading arctos-hq: HTTP ${r.status} ${await r.text()}`);
  const body = await r.json() as { fields?: { payload?: { stringValue?: string } } };
  try { return JSON.parse(body.fields?.payload?.stringValue ?? 'null'); } catch { return null; }
}

const health = (await db.collection(COLLECTIONS.health).doc('latest').get()).data() as OpsHealth | undefined ?? null;
const performance = (await db.collection(COLLECTIONS.health).doc('performance').get()).data() as OpsPerformance | undefined ?? null;
const history = (await db.collection(COLLECTIONS.health).doc('account_history').get()).data() as AccountHistory | undefined ?? null;
const scoutDoc = (await db.collection(COLLECTIONS.health).doc('scout').get()).data() as { updatedAt: number; accounts: ScoutEntry[]; unreadable: string[]; candidates: Record<string, { status: string }> } | undefined;
const inboxCheckedAt = ((await db.collection(COLLECTIONS.health).doc('outreach_inbox').get()).get('lastCheckedAt') as number | undefined) ?? null;

const open = (await db.collection(COLLECTIONS.posts).where('status', 'in', ['drafted', 'needs-correction', 'failed', 'approved']).get()).docs.map(d => ({ id: d.id, ...d.data() }) as OpsPost);
const recent = (await db.collection(COLLECTIONS.posts).where('publishedAt', '>=', now - 7 * DAY).get().catch(() => ({ docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] }))).docs.map(d => d.data() as OpsPost);

const prev = await previous().catch(e => { log(String(e)); return null; });
let leads: PartnerLead[] | null = null;
let pipelines = prev?.pipelines ?? [];
let pipelinesAt = prev?.pipelinesAt ?? 0;
if (!prev || now - pipelinesAt > PIPELINE_TTL) {
  leads = (await db.collection(COLLECTIONS.leads).get()).docs.map(d => ({ id: d.id, ...d.data() }) as PartnerLead);
  pipelines = [
    calgaryWatchPipeline(leads, now),
    notConnected('vowmotion', 'Vow Motion planners', 'Connects when the agent can read mrotiz14@gmail.com (Gmail sign-in, next step).'),
    notConnected('arctos', 'Arctos Launchpad', 'Connects when the agent can read mrotiz14@gmail.com (Gmail sign-in, next step).'),
  ];
  pipelinesAt = now;
}
// Replies and pitches waiting on you need fresh lead data; between lead reads, keep the previous ones.
const leadItems = leads ? todayItems([], leads, null) : (prev?.today ?? []).filter(t => t.kind === 'reply' || t.kind === 'pitch-review');
const today = [...todayItems(open, [], health), ...leadItems].sort((a, b) => a.since - b.since);

const usageDocs = (await db.collection(USAGE_COLLECTION).where('date', '>=', calgaryDate(now - 40 * DAY)).get()).docs.map(d => d.data());
const days: SpendDay[] = usageDocs.map(u => ({
  date: String(u.date),
  usd: Math.round(Number(u.usd ?? 0) * 10_000) / 10_000,
  calls: Object.values((u.tasks ?? {}) as Record<string, { calls?: number }>).reduce((n, t) => n + (t.calls ?? 0), 0),
  byTask: Object.fromEntries(Object.entries((u.tasks ?? {}) as Record<string, { usd?: number }>).map(([k, t]) => [k, Math.round((t.usd ?? 0) * 10_000) / 10_000])),
}));

const failed7d = open.filter(p => p.status === 'failed' && ((p as { updatedAt?: number }).updatedAt ?? 0) >= now - 7 * DAY).length;
const snapshot: HqSnapshot = {
  version: SNAPSHOT_VERSION,
  generatedAt: now,
  today,
  health,
  scout: scoutDoc ? {
    updatedAt: scoutDoc.updatedAt,
    accounts: (scoutDoc.accounts ?? []).slice(0, 40),
    unreadable: scoutDoc.unreadable ?? [],
    candidatesWaiting: Object.values(scoutDoc.candidates ?? {}).filter(c => c.status === 'new').length,
  } : null,
  calgaryDaily: calgaryDailySummary(history, performance, {
    waiting: open.filter(p => p.brand === 'calgarydaily' && p.status === 'drafted').length,
    scheduled: open.filter(p => p.brand === 'calgarydaily' && p.status === 'approved').length,
    published7d: recent.filter(p => p.brand === 'calgarydaily').length,
    failed7d,
  }),
  pipelines,
  pipelinesAt,
  spend: spendSummary(days, calgaryDate(now)),
  bottlenecks: bottlenecks({ today, performance, inboxCheckedAt, health, failed7d, now }),
};

const payload = JSON.stringify(snapshot);
const r = await fetch(`${DOC}?updateMask.fieldPaths=payload&updateMask.fieldPaths=generatedAt&updateMask.fieldPaths=version`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ fields: { payload: { stringValue: payload }, generatedAt: { integerValue: String(now) }, version: { integerValue: String(SNAPSHOT_VERSION) } } }),
});
if (!r.ok) { log(`write failed: HTTP ${r.status} ${await r.text()}`); process.exit(1); }
log(`published: ${today.length} waiting on you, ${snapshot.scout?.accounts.length ?? 0} scout accounts, ${days.length} spend days, ${Math.round(payload.length / 1024)} KB${leads ? '' : ' (pipelines carried over)'}.`);
