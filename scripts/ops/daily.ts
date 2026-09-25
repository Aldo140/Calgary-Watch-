// Once a day (early morning Calgary time): draft posts, research and draft
// partner emails, check health, and email the founder a summary.
//
// Without FIREBASE_SERVICE_ACCOUNT it runs as a dry run: drafts and renders
// posts from the local discovery index into brand/preview/dry-run/ and stops.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './lib/brand';
import { hasFirebase, opsDb } from './lib/firebase';
import type { DiscoveryIndex } from './lib/posts';
import { queueDrafts } from './jobs/drafts';
import { autoApprove, draftPosts, monitorPosts, redraftAndBriefs } from './jobs/posts';
import { draftPitches, findLeads } from './jobs/outreach';
import { checkHealth, sendSummary } from './jobs/health';

const log = (m: string) => console.log(`[ops:daily] ${m}`);
const index = JSON.parse(await readFile(join(ROOT, 'src', 'generated', 'discovery-index.json'), 'utf8')) as DiscoveryIndex;
const now = Date.now();
const db = hasFirebase() ? opsDb() : null;
let failed = false;

async function step(name: string, run: () => Promise<unknown>) {
  try { await run(); } catch (e) { failed = true; log(`${name} failed: ${e instanceof Error ? e.stack ?? e.message : e}`); }
}

if (!db) {
  log('No Firebase credentials: dry run, nothing is written remotely.');
  await step('draft posts', () => draftPosts(null, index, now, log));
  await step('health', () => checkHealth(null, index, now, log));
} else {
  await step('monitor posts', () => monitorPosts(db, index, now, log));
  await step('redrafts and briefs', () => redraftAndBriefs(db, now, log));
  await step('draft posts', () => draftPosts(db, index, now, log));
  await step('queue drafts', () => queueDrafts(db, now, log));
  await step('auto-approve', () => autoApprove(db, now, log));
  await step('find leads', () => findLeads(db, index, now, log));
  await step('draft pitches', () => draftPitches(db, index, now, log));
  let health = null as Awaited<ReturnType<typeof checkHealth>> | null;
  await step('health', async () => { health = await checkHealth(db, index, now, log); });
  if (health) await step('summary', () => sendSummary(db, health!, now, log));
}
if (failed) process.exitCode = 1;
