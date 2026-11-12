/**
 * CalgaryWatch Pick follow-ups (src/lib/cwPicks.ts, docs/cw-picks.md): one
 * email, seven days after a reader asked us to check in, then the address is
 * wiped once they answer or after 60 days.
 *
 * NOT on a schedule yet: Aldo checks a sample first (team rule for every new
 * email). Once approved, add it to discovery-actions.yml beside the claim
 * approval emails.
 *
 *   PICK_EMAIL_SAMPLE_TO=a@b.c   send one sample to that address and nothing else
 *   PICKS_DRY_RUN=1              render and log, send nothing, change nothing
 */
import { readFileSync } from 'node:fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { inventoryDatabase } from '../discovery/firebase';
import { exitForQuota, isQuotaExhausted } from '../lib/quota.js';
import { BEST_CATEGORIES } from '../../src/content/bestOf.js';
import { followupEmail, placeKey, PICK_FOLLOWUPS, PICK_REVIEWS, type FollowupEmail, type PickFollowup } from '../../src/lib/cwPicks.js';

const log = (m: string) => console.log(`[picks:followups] ${m}`);
const sender = JSON.parse(readFileSync(new URL('../../brand/outreach.json', import.meta.url), 'utf8')).sender as { name: string; mailbox: string };
const RETENTION_MS = 60 * 86_400_000;
const label = (list: string) => BEST_CATEGORIES.find(c => c.slug === list)?.label;

async function send(mail: FollowupEmail): Promise<string> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: `CalgaryWatch <${sender.mailbox}>`, to: [mail.to], reply_to: sender.mailbox, subject: mail.subject, text: mail.text, html: mail.html }),
  });
  const body = await res.json().catch(() => ({})) as { id?: string; message?: string };
  if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? 'rejected'}`);
  return body.id;
}

async function run() {
  const mailingAddress = process.env.DIGEST_MAILING_ADDRESS ?? '';
  const dry = process.env.PICKS_DRY_RUN === '1';
  const sampleTo = (process.env.PICK_EMAIL_SAMPLE_TO ?? '').trim();
  if (sampleTo) {
    const c = BEST_CATEGORIES.find(x => x.slug === 'plumbers') ?? BEST_CATEGORIES[0];
    const p = c.places[0];
    const mail = followupEmail({ email: sampleTo, placeName: p.name, list: c.slug, place: placeKey(p) }, 'SAMPLEsample0000', 'sample-key-not-valid-000', { listLabel: c.label, mailingAddress });
    mail.subject = `[Sample] ${mail.subject}`;
    log(`sample → ${sampleTo}\n${mail.text}`);
    if (dry) return;
    if (!process.env.RESEND_API_KEY) throw new Error('No RESEND_API_KEY.');
    log(`sent sample (${await send(mail)})`);
    return;
  }
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) { log('No Firebase credentials; nothing to do.'); return; }
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = inventoryDatabase();
  const now = Date.now();

  // 1. Due follow-ups. A handful a day at most; filtering here avoids a composite index.
  const pending = await db.collection(PICK_FOLLOWUPS).where('status', '==', 'pending').limit(200).get();
  const due = pending.docs.filter(d => (d.data() as PickFollowup).dueAt <= now);
  log(`${pending.size} pending, ${due.length} due`);
  if (due.length && !process.env.RESEND_API_KEY && !dry) log(`No RESEND_API_KEY; ${due.length} waiting.`);
  for (const doc of due) {
    if (!process.env.RESEND_API_KEY && !dry) break;
    const f = doc.data() as PickFollowup;
    const mail = followupEmail(f, doc.id, f.key, { listLabel: label(f.list), mailingAddress });
    if (dry) { log(`dry run → ${f.list}/${f.place}`); continue; }
    const mine = await db.runTransaction(async t => {
      const fresh = await t.get(doc.ref);
      if ((fresh.data() as PickFollowup | undefined)?.status !== 'pending') return false;
      t.update(doc.ref, { status: 'sending', sentAt: Date.now() });
      return true;
    });
    if (!mine) continue;
    try {
      const id = await send(mail);
      await doc.ref.update({ status: 'sent', emailId: id });
      log(`sent ${f.list}/${f.place}`);
    } catch (e) {
      if (isQuotaExhausted(e)) exitForQuota('picks:followups');
      await doc.ref.update({ status: 'failed', error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).catch(() => undefined);
      log(`FAILED ${f.list}/${f.place}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise(r => setTimeout(r, 600));
  }

  // 2. Wipe addresses: answered, or 60 days old. The doc stays (minus the email) so the review rule still matches its key.
  const sent = await db.collection(PICK_FOLLOWUPS).where('status', 'in', ['sent', 'failed']).limit(400).get();
  let wiped = 0;
  for (const doc of sent.docs) {
    const f = doc.data() as PickFollowup;
    const answered = (await db.collection(PICK_REVIEWS).doc(doc.id).get()).exists;
    if (!answered && now - f.createdAt < RETENTION_MS) continue;
    if (!dry) await doc.ref.update({ email: '', status: answered ? 'answered' : 'expired', closedAt: now });
    wiped++;
  }
  log(`${dry ? 'would wipe' : 'wiped'} ${wiped} address(es)`);
}

run().catch(e => {
  if (isQuotaExhausted(e)) exitForQuota('picks:followups');
  console.error('[picks:followups] fatal:', e);
  process.exit(1);
});
