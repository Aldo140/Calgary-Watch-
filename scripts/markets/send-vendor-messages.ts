/**
 * Sends vendor messages queued in Market HQ (vendor_messages, status
 * 'queued'). Run hourly by .github/workflows/discovery-actions.yml.
 *
 * Each vendor gets their own email (nobody sees anyone else's address),
 * from "<Market> via CalgaryWatch", with Reply-To set to the organizer and a
 * footer saying who sent it and how to stop (CASL). Vendors the organizer
 * marked "opted out" are skipped. Failures are written back to the message
 * so the organizer sees them in Market HQ; the job itself only fails when it
 * can't run at all, so a bad address never becomes a workflow-failure email.
 *
 *   MARKETS_DRY_RUN=1   render and log, send nothing
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { inventoryDatabase } from '../discovery/firebase';
import { exitForQuota, isQuotaExhausted } from '../lib/quota.js';
import {
  LINEUPS, MESSAGES, VENDORS, VENDOR_CONTACTS, messageRecipients, vendorMessageFooter,
  type Lineup, type Vendor, type VendorContact, type VendorMessage,
} from '../../src/lib/markets.js';

const log = (m: string) => console.log(`[markets:messages] ${m}`);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function sendOne(from: string, to: string, replyTo: string, subject: string, text: string): Promise<void> {
  const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#151515;max-width:560px">${esc(text).replace(/\n/g, '<br>')}</div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [to], reply_to: replyTo, subject, text, html }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(`Resend ${res.status}: ${body.message ?? 'rejected'}`);
  }
}

async function run() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) { log('No Firebase credentials; nothing to do.'); return; }
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = inventoryDatabase();
  const dry = process.env.MARKETS_DRY_RUN === '1';
  const queued = await db.collection(MESSAGES).where('status', '==', 'queued').limit(20).get();
  if (queued.empty) { log('Nothing queued.'); return; }
  if (!process.env.RESEND_API_KEY && !dry) { log('No RESEND_API_KEY; leaving messages queued.'); return; }
  const address = process.env.DIGEST_MAILING_ADDRESS ?? '';
  if (!address) { log('No DIGEST_MAILING_ADDRESS (CASL); leaving messages queued.'); return; }
  const mailbox = (process.env.DIGEST_FROM ?? '').match(/<([^>]+)>/)?.[1] ?? process.env.DIGEST_FROM ?? 'digest@calgarywatch.ca';

  for (const doc of queued.docs) {
    // Claim it first, so an overlapping run can't send it twice.
    const claimed = await db.runTransaction(async (t) => {
      const fresh = await t.get(doc.ref);
      if (fresh.get('status') !== 'queued') return false;
      t.update(doc.ref, { status: 'sending' });
      return true;
    });
    if (!claimed) continue;
    const m = doc.data() as VendorMessage;
    try {
      const [vendors, contacts, lineups] = await Promise.all([
        db.collection(VENDORS).where('marketId', '==', m.marketId).get(),
        db.collection(VENDOR_CONTACTS).where('marketId', '==', m.marketId).get(),
        db.collection(LINEUPS).where('marketId', '==', m.marketId).get(),
      ]);
      const to = messageRecipients(m, vendors.docs.map((d) => d.data() as Vendor), contacts.docs.map((d) => d.data() as VendorContact), lineups.docs.map((d) => d.data() as Lineup));
      const from = `${m.marketTitle.replace(/[<>"]/g, '').slice(0, 60)} via CalgaryWatch <${mailbox}>`;
      const text = `${m.body}\n\n${vendorMessageFooter(m.marketTitle, m.replyTo, address)}`;
      let sent = 0;
      const errors: string[] = [];
      for (const email of to) {
        if (dry) { log(`dry run → ${email}: ${m.subject}`); sent += 1; continue; }
        try { await sendOne(from, email, m.replyTo, m.subject, text); sent += 1; }
        catch (e) { errors.push(`${email}: ${e instanceof Error ? e.message : e}`); }
        await new Promise((r) => setTimeout(r, 600)); // Resend's default rate limit is 2/s.
      }
      await doc.ref.update({
        status: sent || !to.length ? 'sent' : 'failed', sentCount: sent, sentAt: Date.now(),
        ...(errors.length ? { error: errors.slice(0, 5).join('; ').slice(0, 900) } : {}),
      });
      log(`${m.marketTitle}: "${m.subject}" → ${sent}/${to.length}${errors.length ? ` (${errors.length} failed)` : ''}`);
    } catch (e) {
      if (isQuotaExhausted(e)) exitForQuota('markets:messages');
      await doc.ref.update({ status: 'failed', error: (e instanceof Error ? e.message : String(e)).slice(0, 900) }).catch(() => undefined);
      log(`FAILED ${doc.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

run().catch((e) => {
  if (isQuotaExhausted(e)) exitForQuota('markets:messages');
  console.error('[markets:messages] fatal:', e);
  process.exit(1);
});
