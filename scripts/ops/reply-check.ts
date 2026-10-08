// HQ's reply check, from the ops agents' hourly run (see lib/hq/triage.ts). Reads
// the latest Gmail sync from arctos-hq (hq/gmail) with HQ_ACCESS_TOKEN (keyless
// GitHub OIDC), decides which replies need Aldo, and writes the verdicts to
// hq/gmail-triage. Needs ANTHROPIC_API_KEY. Sends nothing.
//
// A copy of ops/reply-check.ts in Aldo140/ArctosLaunchpad, run here until the
// agents move there.

import { runTriage, triageConfigured, type TriageStore } from './lib/replyCheckAgent';
import type { GmailSummary, GmailTriage } from './lib/replyCheck';

const log = (m: string) => console.log(`[reply-check] ${m}`);
const BASE = 'https://firestore.googleapis.com/v1/projects/arctos-hq/databases/(default)/documents';

const token = process.env.HQ_ACCESS_TOKEN;
if (!token) { log('HQ_ACCESS_TOKEN not set; skipped.'); process.exit(0); }
if (!triageConfigured()) { log('ANTHROPIC_API_KEY not set; skipped.'); process.exit(0); }
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function readPayload(path: string): Promise<string | null> {
  const r = await fetch(`${BASE}/${path}`, { headers });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`reading ${path}: HTTP ${r.status}`);
  const doc = (await r.json()) as { fields?: { payload?: { stringValue?: string } } };
  return doc.fields?.payload?.stringValue ?? null;
}

const store: TriageStore = {
  read: async () => {
    const s = await readPayload('hq/gmail-triage');
    return s ? (JSON.parse(s) as GmailTriage) : null;
  },
  write: async (t) => {
    const r = await fetch(`${BASE}/hq/gmail-triage?updateMask.fieldPaths=payload`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fields: { payload: { stringValue: JSON.stringify(t) } } }),
    });
    if (!r.ok) throw new Error(`writing hq/gmail-triage: HTTP ${r.status}`);
  },
};

const raw = await readPayload('hq/gmail');
if (!raw) { log('the Gmail sync has not reported yet; nothing to check.'); process.exit(0); }
const result = await runTriage(JSON.parse(raw) as GmailSummary, store, log);
log(`${result.items.length} replies have a verdict${result.error ? `; last problem: ${result.error}` : ''}.`);
if (result.error) process.exitCode = 1;
