// What uses up the Firestore free quota (50,000 reads a day). Prints reads and
// writes per 15 minutes from Cloud Monitoring for the last two days, so spikes
// line up with the workflow runs that caused them, and how many documents each
// top-level collection holds (a full read of a collection costs that many).
//
// Monitoring doesn't count against the quota; the collection counts cost one
// read per 1,000 documents and are skipped when the quota is already out.

import { GoogleAuth } from 'google-auth-library';
import { opsDb } from './lib/firebase';
import { isQuotaExhausted } from '../lib/quota';

const STEP = 15 * 60;
const json = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
const credentials = JSON.parse(json) as { project_id: string };
const project = process.env.VITE_FIREBASE_PROJECT_ID || credentials.project_id;

async function series(metric: string): Promise<Map<number, Record<string, number>>> {
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/monitoring.read'] });
  const client = await auth.getClient();
  const end = new Date();
  const start = new Date(end.getTime() - 48 * 3_600_000);
  const params = new URLSearchParams({
    filter: `metric.type="${metric}"`,
    'interval.startTime': start.toISOString(),
    'interval.endTime': end.toISOString(),
    'aggregation.alignmentPeriod': `${STEP}s`,
    'aggregation.perSeriesAligner': 'ALIGN_SUM',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
    'aggregation.groupByFields': 'metric.label.type',
  });
  const res = await client.request<{ timeSeries?: Array<{ metric: { labels?: Record<string, string> }; points: Array<{ interval: { endTime: string }; value: { int64Value?: string } }> }> }>({
    url: `https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${params}`,
  });
  const out = new Map<number, Record<string, number>>();
  for (const s of res.data.timeSeries ?? []) {
    const label = s.metric.labels?.type ?? 'all';
    for (const p of s.points) {
      const t = Date.parse(p.interval.endTime);
      const row = out.get(t) ?? {};
      row[label] = (row[label] ?? 0) + Number(p.value.int64Value ?? 0);
      out.set(t, row);
    }
  }
  return out;
}

async function timeline() {
  const [reads, writes] = await Promise.all([series('firestore.googleapis.com/document/read_count'), series('firestore.googleapis.com/document/write_count')]);
  const times = [...new Set([...reads.keys(), ...writes.keys()])].sort((a, b) => a - b);
  let day = '';
  let total = 0;
  console.log('Reads and writes per 15 minutes (UTC). The quota day starts at 07:00 UTC.');
  for (const t of times) {
    const d = new Date(t);
    const quotaDay = new Date(t - 7 * 3_600_000 - 1).toISOString().slice(0, 10);
    if (quotaDay !== day) {
      if (day) console.log(`  quota day ${day}: ${total} reads`);
      day = quotaDay;
      total = 0;
    }
    const r = reads.get(t) ?? {};
    const sum = Object.values(r).reduce((a, b) => a + b, 0);
    total += sum;
    const w = Object.values(writes.get(t) ?? {}).reduce((a, b) => a + b, 0);
    if (sum || w) console.log(`${d.toISOString().slice(5, 16)}  reads ${String(sum).padStart(6)} (${Object.entries(r).map(([k, v]) => `${k} ${v}`).join(', ')})  writes ${w}  running ${total}`);
  }
  if (day) console.log(`  quota day ${day}: ${total} reads so far`);
}

async function collections() {
  const db = opsDb();
  const cols = await db.listCollections();
  const rows: Array<[string, number]> = [];
  for (const c of cols) rows.push([c.id, (await c.count().get()).data().count]);
  rows.sort((a, b) => b[1] - a[1]);
  console.log('\nDocuments per top-level collection:');
  for (const [id, n] of rows) console.log(`  ${String(n).padStart(7)}  ${id}`);
}

try { await timeline(); } catch (e) { console.log(`Monitoring unavailable: ${String((e as Error).message ?? e).slice(0, 300)}`); }
try { await collections(); } catch (e) { console.log(isQuotaExhausted(e) ? 'Collection counts skipped: quota exhausted.' : `Collection counts failed: ${String(e).slice(0, 300)}`); }
