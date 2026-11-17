/**
 * Applies owner publishes queued in organization_submissions. The browser
 * cannot reach a Cloud Function on the free Firebase plan, so the owner
 * workspace writes its batch here and this runs with the quarter-hourly
 * owner-updates workflow, through the same submitOrganizationBatch checks
 * (approved claim, rolling 5-a-week allowance, payload validation).
 */
import { appendFileSync } from 'node:fs';
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

async function run() {
  const db = inventoryDatabase();
  const queued = await db.collection(ORGANIZATION_SUBMISSIONS).where('status', '==', 'queued').limit(25).get();
  const identity = async (uid: string) => { try { const u = await getAuth().getUser(uid); return { email: u.email, emailVerified: u.emailVerified }; } catch { return {}; } };
  let published = 0, failed = 0;
  for (const doc of queued.docs) {
    const outcome = await applyOrganizationSubmission(db, doc.id, identity);
    if (outcome === 'published') published++; else if (outcome === 'failed') { failed++; console.error(`[org-submissions] ${doc.id}: ${(await doc.ref.get()).get('error')}`); }
  }
  console.log(`[org-submissions] ${published} published, ${failed} failed, ${queued.size} examined.`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `publish=${published > 0}\n`);
}
if (process.argv[1]?.endsWith('apply-organization-submissions.ts')) run().catch(error => { console.error('[org-submissions] stopped:', error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
