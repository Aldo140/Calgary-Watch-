// What uses up the Firestore free quota (50,000 reads a day). Prints reads and
// writes per 15 minutes from Cloud Monitoring for the last two days, so spikes
// line up with the workflow runs that caused them, and how many documents each
// top-level collection holds (a full read of a collection costs that many).
// It also prints each day's peak live connections and snapshot listeners and
// how many security-rule evaluations were allowed, denied or errored: a jump in
// denials after a deploy means a client query no longer matches the rules.
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

async function series(metric: string, aligner = 'ALIGN_SUM', groupBy = 'metric.label.type', reducer = 'REDUCE_SUM'): Promise<Map<number, Record<string, number>>> {
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/monitoring.read'] });
  const client = await auth.getClient();
  const end = new Date();
  const start = new Date(end.getTime() - 48 * 3_600_000);
  const params = new URLSearchParams({
    filter: `metric.type="${metric}"`,
    'interval.startTime': start.toISOString(),
    'interval.endTime': end.toISOString(),
    'aggregation.alignmentPeriod': `${STEP}s`,
    'aggregation.perSeriesAligner': aligner,
    'aggregation.crossSeriesReducer': reducer,
    'aggregation.groupByFields': groupBy,
  });
  const res = await client.request<{ timeSeries?: Array<{ metric: { labels?: Record<string, string> }; points: Array<{ interval: { endTime: string }; value: { int64Value?: string } }> }> }>({
    url: `https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${params}`,
  });
  const out = new Map<number, Record<string, number>>();
  for (const s of res.data.timeSeries ?? []) {
    const label = s.metric.labels?.[groupBy.split('.').pop()!] ?? 'all';
    for (const p of s.points) {
      // Reads and writes report a few seconds apart; snap to the step so they share a row.
      const t = Math.round(Date.parse(p.interval.endTime) / (STEP * 1000)) * STEP * 1000;
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
  let written = 0;
  console.log('Reads and writes per 15 minutes (UTC). The quota day starts at 07:00 UTC.');
  for (const t of times) {
    const d = new Date(t);
    const quotaDay = new Date(t - 7 * 3_600_000 - 1).toISOString().slice(0, 10);
    if (quotaDay !== day) {
      if (day) console.log(`  quota day ${day}: ${total} reads, ${written} writes`);
      day = quotaDay;
      total = 0;
      written = 0;
    }
    const r = reads.get(t) ?? {};
    const sum = Object.values(r).reduce((a, b) => a + b, 0);
    total += sum;
    const w = Object.values(writes.get(t) ?? {}).reduce((a, b) => a + b, 0);
    written += w;
    if (sum || w) console.log(`${d.toISOString().slice(5, 16)}  reads ${String(sum).padStart(6)} (${Object.entries(r).map(([k, v]) => `${k} ${v}`).join(', ')})  writes ${w}  running ${total}`);
  }
  if (day) console.log(`  quota day ${day}: ${total} reads, ${written} writes so far`);
}

/** Per quota day: peak open connections and listeners, and rule evaluations by result. */
async function realtime() {
  const quotaDay = (t: number) => new Date(t - 7 * 3_600_000 - 1).toISOString().slice(0, 10);
  const [connections, listeners, rules] = await Promise.all([
    series('firestore.googleapis.com/network/active_connections', 'ALIGN_MAX', 'resource.label.project_id'),
    series('firestore.googleapis.com/network/snapshot_listeners', 'ALIGN_MAX', 'resource.label.project_id'),
    series('firestore.googleapis.com/rules/evaluation_count', 'ALIGN_SUM', 'metric.label.result'),
  ]);
  const days = new Map<string, { connections: number; listeners: number; rules: Record<string, number> }>();
  const at = (t: number) => { const d = quotaDay(t); if (!days.has(d)) days.set(d, { connections: 0, listeners: 0, rules: {} }); return days.get(d)!; };
  const peak = (rows: Map<number, Record<string, number>>, key: 'connections' | 'listeners') => {
    for (const [t, r] of rows) { const row = at(t); row[key] = Math.max(row[key], ...Object.values(r)); }
  };
  peak(connections, 'connections');
  peak(listeners, 'listeners');
  for (const [t, r] of rules) for (const [k, v] of Object.entries(r)) { const row = at(t); row.rules[k] = (row.rules[k] ?? 0) + v; }
  console.log('\nLive connections, listeners and rule evaluations per quota day:');
  for (const [d, row] of [...days].sort()) {
    console.log(`  ${d}  peak connections ${row.connections}  peak listeners ${row.listeners}  rules ${Object.entries(row.rules).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  }
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
try { await realtime(); } catch (e) { console.log(`Realtime metrics unavailable: ${String((e as Error).message ?? e).slice(0, 300)}`); }
try { await collections(); } catch (e) { console.log(isQuotaExhausted(e) ? 'Collection counts skipped: quota exhausted.' : `Collection counts failed: ${String(e).slice(0, 300)}`); }
