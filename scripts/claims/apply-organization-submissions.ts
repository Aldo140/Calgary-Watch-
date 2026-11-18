/**
 * Applies owner publishes queued in organization_submissions. The browser
 * cannot reach a Cloud Function on the free Firebase plan, so the owner
 * workspace writes its batch here. The owner-publish clock (always awake,
 * --watch-minutes) applies it within seconds; the owner-updates workflow is a
 * backup. Both go through the same submitOrganizationBatch checks
 * (approved claim, rolling 5-a-week allowance, payload validation).
 */
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { getAuth } from 'firebase-admin/auth';
import { inventoryDatabase } from '../discovery/firebase';
import { ORGANIZATION_SUBMISSIONS, type OrganizationSubmission } from '../../src/lib/organizationWorkspace';
import { submitOrganizationBatch } from './organization-submit';
import { isQuotaExhausted } from '../lib/quota';

type Identity = { email?: string; emailVerified?: boolean };
/** One queued submission. Returns 'published', 'failed' or 'skipped' (not queued any more). */
export async function applyOrganizationSubmission(db: any, id: string, identity: (uid: string) => Promise<Identity>, now = Date.now()): Promise<'published' | 'failed' | 'skipped'> {
  const ref = db.collection(ORGANIZATION_SUBMISSIONS).doc(id);
  const snap = await db.runTransaction((tx: any) => tx.get(ref));
  const mark = (fields: Record<string, unknown>) => db.runTransaction(async (tx: any) => { tx.update(ref, fields); });
  const s = snap.data() as OrganizationSubmission | undefined;
  if (!s || s.status !== 'queued') return 'skipped';
  try {
    const who = await identity(s.uid);
    if (!who.emailVerified) throw Error('Confirm your email address, then publish again.');
    const result = await submitOrganizationBatch(db, s.uid, { organizationId: s.organizationId, requestId: id, operations: s.operations, ...(s.adminEdit ? { adminEdit: true, ...(s.subjectUid ? { subjectUid: s.subjectUid } : {}) } : {}) }, now, who);
    await mark({ status: 'published', publishedAt: result.publishedAt ?? now, nextAt: result.nextAt ?? 0 });
    return 'published';
  } catch (error) {
    if (isQuotaExhausted(error)) throw error;
    await mark({ status: 'failed', error: error instanceof Error ? error.message : 'Your submission could not be saved. Your draft is preserved.', failedAt: now });
    return 'failed';
  }
}

const identity = async (uid: string): Promise<Identity> => { try { const u = await getAuth().getUser(uid); return { email: u.email, emailVerified: u.emailVerified }; } catch { return {}; } };

/** Applies every queued submission once. */
export async function applyQueued(db: any) {
  const queued = await db.collection(ORGANIZATION_SUBMISSIONS).where('status', '==', 'queued').limit(25).get();
  let published = 0, failed = 0;
  for (const doc of queued.docs) {
    const outcome = await applyOrganizationSubmission(db, doc.id, identity);
    if (outcome === 'published') published++; else if (outcome === 'failed') { failed++; console.error(`[org-submissions] ${doc.id}: ${(await doc.ref.get()).get('error')}`); }
  }
  console.log(`[org-submissions] ${new Date().toISOString().slice(11, 16)} ${published} published, ${failed} failed, ${queued.size} examined.`);
  return { published, failed };
}

/**
 * Stays awake for `minutes`, listening for new queued publishes (a listener
 * costs reads only when something changes), applies each within seconds and
 * starts a site deploy shortly after. GitHub runs the quarter-hourly schedule
 * only every few hours, which left an owner's "Going live shortly" waiting
 * over two hours (Uncle Fatih's, Nov 17 2026).
 */
async function watch(minutes: number) {
  const db = inventoryDatabase();
  const end = Date.now() + minutes * 60_000;
  let running = false, again = false, deployTimer: NodeJS.Timeout | undefined;
  const deploy = () => {
    clearTimeout(deployTimer);
    deployTimer = setTimeout(() => {
      try { execFileSync('gh', ['workflow', 'run', 'deploy-firebase.yml', '--ref', 'main'], { stdio: 'inherit' }); console.log('[org-submissions] started a site deploy'); }
      catch { console.error('::warning::could not start the site deploy; the next scheduled deploy carries the change'); }
    }, 45_000);
  };
  const pass = async () => {
    if (running) { again = true; return; }
    running = true;
    try { do { again = false; const r = await applyQueued(db); if (r.published) deploy(); } while (again); }
    catch (error) { console.error('[org-submissions] pass failed:', error instanceof Error ? error.message : String(error)); }
    finally { running = false; }
  };
  await pass();
  const stop = db.collection(ORGANIZATION_SUBMISSIONS).where('status', '==', 'queued').limit(1)
    .onSnapshot((snap: any) => { if (!snap.empty) void pass(); }, (error: Error) => console.error('[org-submissions] listener:', error.message));
  // Belt and braces in case the listener drops: one cheap check every 10 minutes.
  const poll = setInterval(() => void pass(), 10 * 60_000);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, end - Date.now())));
  stop(); clearInterval(poll);
  while (running) await new Promise(resolve => setTimeout(resolve, 1000));
  if (deployTimer) await new Promise(resolve => setTimeout(resolve, 50_000));
}

async function run() {
  const db = inventoryDatabase();
  const { published } = await applyQueued(db);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `publish=${published > 0}\n`);
}
const watchAt = process.argv.indexOf('--watch-minutes');
if (process.argv[1]?.endsWith('apply-organization-submissions.ts')) (watchAt > 0 ? watch(Number(process.argv[watchAt + 1]) || 340) : run()).then(() => process.exit(process.exitCode ?? 0)).catch(error => { console.error('[org-submissions] stopped:', error instanceof Error ? error.message : String(error)); process.exit(1); });
