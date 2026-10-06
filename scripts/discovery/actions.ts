/**
 * Applies admin moderation queued in `discovery_actions`.
 *
 * The admin Content workspace calls the manageDiscovery Cloud Function when it
 * is deployed. When it isn't (Functions need Firebase's paid plan), the
 * browser queues the same request here instead, and this job applies it with
 * the function's own code: same validation, same store, same admin check.
 *
 * Run by .github/workflows/discovery-actions.yml. Writes `applied=N` to
 * GITHUB_OUTPUT so the workflow can redeploy only when something changed.
 */
import { appendFileSync } from 'node:fs';
import { inventoryDatabase } from './firebase';
import store from '../../functions/discovery-store.cjs';
import { ALLOWED_ADMIN_EMAILS } from '../../src/constants/admin.js';
import { exitForQuota, isQuotaExhausted } from '../lib/quota.js';

type Action = { action?: string; sourceId?: string; input?: unknown; recordId?: string; cancelled?: boolean; id?: string; reject?: boolean } & Record<string, unknown>;

const log = (m: string) => console.log(`[discovery:actions] ${m}`);

async function run() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) { log('No Firebase credentials; nothing to do.'); return; }
  const db = inventoryDatabase();
  const pending = await db.collection('discovery_actions').where('status', '==', 'pending').limit(50).get();
  let applied = 0;
  for (const doc of pending.docs.sort((a, b) => (a.get('createdAt') ?? 0) - (b.get('createdAt') ?? 0))) {
    const { action, adminUid, adminEmail } = doc.data() as { action: Action; adminUid: string; adminEmail: string };
    try {
      const allowed = ALLOWED_ADMIN_EMAILS.includes(String(adminEmail).toLowerCase())
        || (await db.collection('users').doc(adminUid).get()).data()?.role === 'admin';
      if (!allowed) throw Error('Not an administrator');
      let result: unknown;
      if (action.action === 'save') {
        const source = (await db.collection('discovery_sources').doc(String(action.sourceId)).get()).data();
        if (!source) throw Error('Choose an approved source');
        result = await store.ingestRecord(db, action.input, source, action.recordId, { cancelled: action.cancelled });
      } else if (action.action === 'review-submission') {
        const ref = db.collection('entity_submissions').doc(String(action.id));
        if (!(await ref.get()).exists) throw Error('Submission missing');
        if (action.reject) {
          await ref.update({ status: 'rejected', reviewedBy: adminUid });
        } else {
          const source = (await db.collection('discovery_sources').doc(String(action.sourceId)).get()).data();
          if (!source) throw Error('Choose an approved source');
          const out = await store.ingestRecord(db, action.input, source, `submission-${action.id}`);
          await ref.update({ status: 'approved', entityId: out.id, reviewedBy: adminUid });
          result = out;
        }
      } else {
        result = await store.moderate(db, action as Parameters<typeof store.moderate>[1], adminUid);
      }
      await doc.ref.update({ status: 'applied', appliedAt: Date.now(), result: JSON.parse(JSON.stringify(result ?? null)) });
      applied += 1;
      log(`applied ${doc.id} (${action.action ?? 'moderate'})`);
    } catch (error) {
      if (isQuotaExhausted(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      await doc.ref.update({ status: 'failed', failedAt: Date.now(), error: message.slice(0, 500) });
      log(`failed ${doc.id}: ${message}`);
    }
  }
  log(`${applied} applied, ${pending.size - applied} failed or skipped.`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `applied=${applied}\n`);
}

run().catch((error) => {
  if (isQuotaExhausted(error)) exitForQuota('Discovery actions');
  console.error('[discovery:actions] fatal:', error);
  process.exit(1);
});
