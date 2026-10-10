// The HQ Gmail sync workflow's side (see scripts/ops/lib/gmailSync.ts): opens
// the sealed payload with the private key in arctos-hq (ops_meta/gmail-sync-key)
// and merges it into hq/gmail, where the dashboard and the reply check read it.
// PAYLOAD "init" creates the key pair once and prints the public key, which
// goes in scripts/ops/gmail-sync.pub.pem. Prints counts only, never mail.

import { createPublicKey } from 'node:crypto';
import { mergeSummary, newKeyPair, open } from './lib/gmailSync';
import type { GmailSummary } from './lib/replyCheck';

const log = (m: string) => console.log(`[gmail-sync] ${m}`);
const BASE = 'https://firestore.googleapis.com/v1/projects/arctos-hq/databases/(default)/documents';
const KEY_DOC = 'ops_meta/gmail-sync-key';

const token = process.env.HQ_ACCESS_TOKEN;
const payload = process.env.PAYLOAD?.trim();
if (!token) throw new Error('Could not sign in to arctos-hq.');
if (!payload) throw new Error('No payload.');
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

interface Doc { fields?: Record<string, { stringValue?: string }>; updateTime?: string }

async function read(path: string): Promise<Doc | null> {
  const r = await fetch(`${BASE}/${path}`, { headers });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`reading ${path}: HTTP ${r.status}`);
  return (await r.json()) as Doc;
}

/** Writes one string field, only if the document is still as it was read (false if someone wrote first). */
async function write(path: string, field: string, value: string, was: Doc | null): Promise<boolean> {
  const pre = was?.updateTime ? `currentDocument.updateTime=${encodeURIComponent(was.updateTime)}` : 'currentDocument.exists=false';
  const r = await fetch(`${BASE}/${path}?updateMask.fieldPaths=${field}&${pre}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { [field]: { stringValue: value } } }),
  });
  if (r.status === 400 || r.status === 409 || r.status === 412) {
    const text = await r.text();
    if (/FAILED_PRECONDITION|ALREADY_EXISTS|NOT_FOUND/.test(text)) return false;
    throw new Error(`writing ${path}: HTTP ${r.status}`);
  }
  if (!r.ok) throw new Error(`writing ${path}: HTTP ${r.status}`);
  return true;
}

const keyDoc = await read(KEY_DOC);
const privateKey = keyDoc?.fields?.privateKey?.stringValue;

if (payload === 'init') {
  let pem = privateKey;
  if (!pem) {
    const pair = newKeyPair();
    if (!(await write(KEY_DOC, 'privateKey', pair.privateKey, null))) throw new Error('Another run created the key first; run init again.');
    pem = pair.privateKey;
    log('Created the key pair.');
  }
  const publicKey = createPublicKey(pem).export({ type: 'spki', format: 'pem' }).toString();
  log(`Public key (goes in scripts/ops/gmail-sync.pub.pem):\n${publicKey}`);
  process.exit(0);
}

if (!privateKey) throw new Error('No key yet: run this workflow once with payload "init".');
const { threadIds, summary } = open(payload, privateKey);

// Parts of one run can land together; retry on a write that lost the race.
for (let attempt = 1; attempt <= 6; attempt++) {
  const doc = await read('hq/gmail');
  const raw = doc?.fields?.payload?.stringValue;
  const merged = mergeSummary(raw ? (JSON.parse(raw) as GmailSummary) : null, summary, threadIds);
  if (await write('hq/gmail', 'payload', JSON.stringify(merged), doc)) {
    log(`Merged ${threadIds.length} threads: HQ now has ${merged.sends.length} sends and ${merged.replies.length} replies.`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 1000 * attempt + Math.random() * 1000));
}
throw new Error('hq/gmail kept changing under this run; try again.');
