// Every hour: publish approved posts that are due, pick up briefs and redrafts
// the reviewer asked for, match replies from businesses, and send approved emails.

import { hasFirebase, opsDb } from './lib/firebase';
import { queueDrafts } from './jobs/drafts';
import { resolveDoubleBookings, autoApprove, publishDue, redraftAndBriefs } from './jobs/posts';
import { sendApproved, syncReplies } from './jobs/outreach';
import { exitForQuota, isQuotaExhausted } from '../lib/quota';
import { flushUsage } from './jobs/usage';

const log = (m: string) => console.log(`[ops:hourly] ${m}`);
if (!hasFirebase()) {
  log('FIREBASE_SERVICE_ACCOUNT is required.');
  process.exit(1);
}
const db = opsDb();
const now = Date.now();
let failed = false;
let quota = false;
async function step(name: string, run: () => Promise<unknown>) {
  // Once the quota is gone every later step would fail the same way.
  if (quota) return;
  try { await run(); } catch (e) {
    if (isQuotaExhausted(e)) { quota = true; log(`${name}: Firestore quota exhausted; stopping this run.`); return; }
    failed = true; log(`${name} failed: ${e instanceof Error ? e.stack ?? e.message : e}`);
  }
}

await step('queue drafts', () => queueDrafts(db, now, log));
await step('auto-approve', () => autoApprove(db, now, log));
await step('one post per slot', () => resolveDoubleBookings(db, now, log));
await step('publish', () => publishDue(db, now, log));
await step('redrafts and briefs', () => redraftAndBriefs(db, now, log));
await step('replies', () => syncReplies(db, now, log));
await step('send', () => sendApproved(db, now, log));
await flushUsage(db, now, 'hourly', log).catch(e => log(`usage not recorded: ${e instanceof Error ? e.message : e}`));
if (failed) process.exitCode = 1;
else if (quota) exitForQuota('Operations hourly');
