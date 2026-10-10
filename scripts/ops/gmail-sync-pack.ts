// Seals what the Gmail sync routine read for the HQ Gmail sync workflow (see
// scripts/ops/lib/gmailSync.ts). Usage:
//   node scripts/ops/gmail-sync-pack.ts <threads.json> <out-dir>
// Writes part-1.txt, part-2.txt, ... into <out-dir>; start the workflow once
// per part with the file's text as its `payload` input. Prints only counts.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSummary, sealInParts, type RawMail } from './lib/gmailSync.ts';

const [input, outDir] = process.argv.slice(2);
if (!input || !outDir) {
  console.error('Usage: node scripts/ops/gmail-sync-pack.ts <threads.json> <out-dir>');
  process.exit(2);
}
const mail = JSON.parse(readFileSync(input, 'utf8')) as RawMail;
if (!mail.account || !Array.isArray(mail.threads)) throw new Error('Expected {"account": "...", "threads": [...]}.');
const publicKey = readFileSync(new URL('./gmail-sync.pub.pem', import.meta.url), 'utf8');

const now = Date.now();
const summary = buildSummary(mail, now);
const parts = sealInParts(mail, publicKey, now);
mkdirSync(outDir, { recursive: true });
parts.forEach((p, i) => writeFileSync(join(outDir, `part-${i + 1}.txt`), p));
console.log(`[gmail-sync] ${mail.threads.length} threads: ${summary.sends.length} sends, ${summary.replies.length} replies, ${summary.replies.filter((r) => r.kind === 'reply' && r.toPitch && !r.answered).length} waiting. ${parts.length} part(s) in ${outDir}.`);
