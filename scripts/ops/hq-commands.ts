// Applies actions taken in HQ (see lib/hqCommands.ts). Reads pending commands
// from arctos-hq with HQ_ACCESS_TOKEN (keyless GitHub OIDC), applies each to
// the CalgaryWatch ops data, and marks it done or failed so HQ can show the
// outcome. Runs before the ops step, so an approval made in HQ is published
// or sent in the same run when it's due.

import { FieldValue } from 'firebase-admin/firestore';
import type { OpsPost, PartnerLead } from '../../src/types/ops';
import { COLLECTIONS, hasFirebase, opsDb } from './lib/firebase';
import { applyLeadCommand, applyPostCommand, isPostCommand, type HqCommand, type HqCommandType } from './lib/hqCommands';

const log = (m: string) => console.log(`[hq-commands] ${m}`);
const BASE = 'https://firestore.googleapis.com/v1/projects/arctos-hq/databases/(default)/documents';

const token = process.env.HQ_ACCESS_TOKEN;
if (!token) { log('HQ_ACCESS_TOKEN not set; skipped.'); process.exit(0); }
if (!hasFirebase()) { log('FIREBASE_SERVICE_ACCOUNT is required.'); process.exit(1); }
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

type Fields = Record<string, { stringValue?: string; integerValue?: string }>;

const q = await fetch(`${BASE}:runQuery`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'hq_commands' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'pending' } } }, limit: 100 } }),
});
if (!q.ok) { log(`reading commands failed: HTTP ${q.status} ${await q.text()}`); process.exit(1); }
const rows = (await q.json()) as Array<{ document?: { name: string; fields: Fields } }>;
const commands: HqCommand[] = rows.filter(r => r.document).map(r => {
  const f = r.document!.fields;
  let payload = {};
  try { payload = JSON.parse(f.payload?.stringValue ?? '{}'); } catch { /* empty payload */ }
  return {
    id: r.document!.name.split('/').pop()!,
    type: f.type?.stringValue as HqCommandType,
    targetId: f.targetId?.stringValue ?? '',
    payload,
    by: f.by?.stringValue ?? 'HQ',
    at: Number(f.at?.integerValue ?? 0),
  };
}).sort((a, b) => a.at - b.at);

if (!commands.length) { log('no pending HQ actions.'); process.exit(0); }

const db = opsDb();
async function finish(cmd: HqCommand, status: 'done' | 'failed', result: string) {
  const r = await fetch(`${BASE}/hq_commands/${cmd.id}?updateMask.fieldPaths=status&updateMask.fieldPaths=result&updateMask.fieldPaths=appliedAt`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { status: { stringValue: status }, result: { stringValue: result }, appliedAt: { integerValue: String(Date.now()) } } }),
  });
  if (!r.ok) log(`could not mark ${cmd.id} ${status}: HTTP ${r.status}`);
}

for (const cmd of commands) {
  const now = Date.now();
  try {
    const post = isPostCommand(cmd.type);
    const ref = db.collection(post ? COLLECTIONS.posts : COLLECTIONS.leads).doc(cmd.targetId);
    const snap = await ref.get();
    const current = snap.exists ? ({ id: snap.id, ...snap.data() }) : null;
    const applied = post ? applyPostCommand(cmd, current as OpsPost | null, now) : applyLeadCommand(cmd, current as PartnerLead | null, now);
    if (!applied.ok) { await finish(cmd, 'failed', applied.reason); log(`${cmd.type} ${cmd.targetId}: ${applied.reason}`); continue; }
    const update: Record<string, unknown> = { ...applied.update };
    if (applied.event) update.history = FieldValue.arrayUnion({ at: now, type: 'status', summary: applied.event });
    await ref.update(update);
    await finish(cmd, 'done', 'Applied.');
    log(`${cmd.type} ${cmd.targetId}: applied (${cmd.by}).`);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await finish(cmd, 'failed', reason);
    log(`${cmd.type} ${cmd.targetId}: ${reason}`);
  }
}
