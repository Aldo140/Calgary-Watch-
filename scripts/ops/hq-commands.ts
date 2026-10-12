// Applies actions taken in HQ (see lib/hqCommands.ts). Reads pending commands
// from arctos-hq with HQ_ACCESS_TOKEN (keyless GitHub OIDC), applies each to
// the CalgaryWatch ops data, and marks it done or failed so HQ can show the
// outcome. Runs before the ops step, so an approval made in HQ is published
// or sent in the same run when it's due.

import { FieldValue } from 'firebase-admin/firestore';
import type { OpsPost, PartnerLead } from '../../src/types/ops';
import { COLLECTIONS, hasFirebase, opsDb } from './lib/firebase';
import { applyLeadCommand, applyPostCommand, isPostCommand, type HqCommand, type HqCommandType } from './lib/hqCommands';
import { IG_NOTES_DOC, newBriefs, notesChanged, type IgNote } from './lib/igNotes';

const log = (m: string) => console.log(`[hq-commands] ${m}`);
const BASE = 'https://firestore.googleapis.com/v1/projects/arctos-hq/databases/(default)/documents';

const token = process.env.HQ_ACCESS_TOKEN;
if (!token) { log('HQ_ACCESS_TOKEN not set; skipped.'); process.exit(0); }
if (!hasFirebase()) { log('FIREBASE_SERVICE_ACCOUNT is required.'); process.exit(1); }
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

type Fields = Record<string, { stringValue?: string; integerValue?: string }>;

// Notes for the Instagram agent, sent from Telegram (/ig): copy them to the ops data, replan the
// week when they change, and draft a brief from any new link.
try {
  const r = await fetch(`${BASE}:runQuery`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'hq_ig_notes' }], limit: 50 } }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const notes: IgNote[] = ((await r.json()) as Array<{ document?: { name: string; fields: Fields } }>).filter(x => x.document).map(x => ({
    id: x.document!.name.split('/').pop()!,
    text: x.document!.fields.text?.stringValue ?? '',
    at: Number(x.document!.fields.at?.integerValue ?? 0),
  })).filter(n => n.text);
  const ops = opsDb();
  const ref = ops.collection(COLLECTIONS.health).doc(IG_NOTES_DOC);
  const prev = (await ref.get()).data() as { notes?: IgNote[]; briefed?: string[] } | undefined;
  const briefs = newBriefs(notes, prev?.briefed ?? []);
  const now = Date.now();
  for (const b of briefs) {
    const id = `brief-ig-${b.id}`.slice(0, 120);
    await ops.collection(COLLECTIONS.posts).doc(id).set({
      id, brand: 'calgarydaily', status: 'requested', template: 'update', requestUrl: b.url, note: b.text,
      fingerprint: `calgarydaily|brief|${b.url}`.slice(0, 300), createdAt: now, updatedAt: now, reviewedByEmail: 'Aldo (Telegram /ig)',
    }, { merge: true });
    log(`instagram note: brief queued from ${b.url}`);
  }
  if (notesChanged(prev?.notes ?? [], notes) || briefs.length) {
    await ref.set({ notes, briefed: [...new Set([...(prev?.briefed ?? []), ...briefs.map(b => b.id)])].slice(-200), updatedAt: now });
    // A new instruction gets a new plan on the next daily run instead of waiting out the old one.
    await ops.collection(COLLECTIONS.health).doc('coordinator').set({ at: 0 }, { merge: true });
    log(`instagram notes: ${notes.length} now; the week will be replanned.`);
  }
} catch (e) {
  log(`instagram notes not synced: ${e instanceof Error ? e.message : e}`);
}

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
