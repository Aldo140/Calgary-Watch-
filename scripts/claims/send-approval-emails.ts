/**
 * Emails each claimant once their listing claim is approved in /admin
 * (src/lib/claimApprovalEmail.ts has the copy and the rules). Run hourly by
 * .github/workflows/discovery-actions.yml.
 *
 * Each approved claim is marked approvalEmailStatus 'sending' in a
 * transaction before it's sent, so overlapping runs never send twice, then
 * 'sent' or 'failed' (with the error, shown in Claimed listings). Claims
 * approved before APPROVAL_EMAILS_SINCE are left alone.
 *
 *   CLAIM_EMAIL_SAMPLE_TO=a@b.c   send one sample to that address and nothing else
 *   CLAIMS_DRY_RUN=1              render and log, send nothing
 */
import { readFileSync } from 'node:fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { inventoryDatabase } from '../discovery/firebase';
import { exitForQuota, isQuotaExhausted } from '../lib/quota.js';
import { CLAIMS } from '../../src/lib/claims.js';
import { approvalEmail, needsApprovalEmail, type ApprovalEmail, type ApprovalEmailClaim } from '../../src/lib/claimApprovalEmail.js';

const log = (m: string) => console.log(`[claims:approval-emails] ${m}`);
const sender = JSON.parse(readFileSync(new URL('../../brand/outreach.json', import.meta.url), 'utf8')).sender as { name: string; mailbox: string };

async function send(mail: ApprovalEmail): Promise<string> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: `${sender.name} at CalgaryWatch <${sender.mailbox}>`, to: mail.to, reply_to: sender.mailbox, subject: mail.subject, text: mail.text, html: mail.html }),
  });
  const body = await res.json().catch(() => ({})) as { id?: string; message?: string };
  if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? 'rejected'}`);
  return body.id;
}

/** A sample for checking the copy, built from a real published business listing. */
async function sample(to: string, mailingAddress: string) {
  const index = JSON.parse(readFileSync(new URL('../../src/generated/discovery-index.json', import.meta.url), 'utf8')) as { entities: Array<{ id: string; kind: string; slug: string; title: string; status: string }> };
  const e = index.entities.find((x) => x.kind === 'business' && x.status === 'published') ?? index.entities[0];
  const mail = approvalEmail({ entityId: e.id, entityTitle: e.title, entityPath: `/local/${e.slug}`, name: 'Aldo', accountEmail: to, workEmail: '' }, { mailingAddress });
  mail.subject = `[Sample] ${mail.subject}`;
  log(`sample for ${e.title} → ${to}\n${mail.text}`);
  if (process.env.CLAIMS_DRY_RUN === '1') return;
  log(`sent sample (${await send(mail)})`);
}

async function run() {
  const mailingAddress = process.env.DIGEST_MAILING_ADDRESS ?? '';
  const sampleTo = (process.env.CLAIM_EMAIL_SAMPLE_TO ?? '').trim();
  if (sampleTo) {
    if (!process.env.RESEND_API_KEY && process.env.CLAIMS_DRY_RUN !== '1') throw new Error('No RESEND_API_KEY.');
    return sample(sampleTo, mailingAddress);
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) { log('No Firebase credentials; nothing to do.'); return; }
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = inventoryDatabase();
  const dry = process.env.CLAIMS_DRY_RUN === '1';

  // A few hundred approved claims at most; filtering here avoids a composite index.
  const approved = await db.collection(CLAIMS).where('status', '==', 'approved').limit(500).get();
  const due = approved.docs.filter((d) => needsApprovalEmail(d.data() as ApprovalEmailClaim));
  if (!due.length) { log('Nothing to send.'); return; }
  if (!process.env.RESEND_API_KEY && !dry) { log(`No RESEND_API_KEY; ${due.length} approval email(s) waiting.`); return; }

  for (const doc of due) {
    const c = doc.data() as ApprovalEmailClaim;
    const mail = approvalEmail(c, { mailingAddress });
    if (dry) { log(`dry run → ${mail.to.join(', ')}: ${mail.subject}`); continue; }
    const mine = await db.runTransaction(async (t) => {
      const fresh = await t.get(doc.ref);
      if (!needsApprovalEmail(fresh.data() as ApprovalEmailClaim)) return false;
      t.update(doc.ref, { approvalEmailStatus: mail.to.length ? 'sending' : 'skipped', approvalEmailAt: Date.now(), ...(mail.to.length ? {} : { approvalEmailError: 'No valid email address on the claim.' }) });
      return mail.to.length > 0;
    });
    if (!mine) continue;
    try {
      const id = await send(mail);
      await doc.ref.update({ approvalEmailStatus: 'sent', approvalEmailAt: Date.now(), approvalEmailTo: mail.to, approvalEmailId: id });
      log(`${c.entityTitle} → ${mail.to.join(', ')}`);
    } catch (e) {
      if (isQuotaExhausted(e)) exitForQuota('claims:approval-emails');
      await doc.ref.update({ approvalEmailStatus: 'failed', approvalEmailError: (e instanceof Error ? e.message : String(e)).slice(0, 500) }).catch(() => undefined);
      log(`FAILED ${c.entityTitle}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 600)); // Resend's default rate limit is 2/s.
  }
}

run().catch((e) => {
  if (isQuotaExhausted(e)) exitForQuota('claims:approval-emails');
  console.error('[claims:approval-emails] fatal:', e);
  process.exit(1);
});
