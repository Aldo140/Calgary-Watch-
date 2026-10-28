/**
 * Emails CalgaryWatch admins when someone wants to run an organization
 * profile (src/lib/claimAdminAlert.ts has the copy and the rules). Run hourly
 * by .github/workflows/discovery-actions.yml.
 *
 * Two kinds of news, one email per run:
 *   - every pending listing claim not reported yet;
 *   - organizer accounts made on a claim page in the last 14 days, over 45
 *     minutes old, with no claim from that account (stuck on verification or
 *     never sent).
 *
 * Each one is reported once: admin_alerts/{claim_<id>|signup_<uid>} is created
 * in the same run before the email goes, and a failed send deletes them again
 * so the next run retries.
 *
 *   ADMIN_ALERT_TO=a@b.c,d@e.f   recipients (default jorti104@mtroyal.ca)
 *   CLAIMS_DRY_RUN=1             render and log, send and record nothing
 */
import { readFileSync } from 'node:fs';
import { getAuth } from 'firebase-admin/auth';
import { inventoryDatabase } from '../discovery/firebase';
import { exitForQuota, isQuotaExhausted } from '../lib/quota.js';
import { CLAIMS, claimEvidence, type ListingClaim } from '../../src/lib/claims.js';
import { entityPath } from '../../src/lib/discovery.js';
import { ADMIN_ALERTS, SIGNUP_LOOKBACK_MS, adminAlertEmail, alertKey, signupNeedsAlert, type AdminAlert } from '../../src/lib/claimAdminAlert.js';

const log = (m: string) => console.log(`[claims:notify-admins] ${m}`);
const recipients = (process.env.ADMIN_ALERT_TO || 'jorti104@mtroyal.ca').split(',').map((s) => s.trim()).filter(Boolean);

type IndexEntity = { id: string; kind: 'event' | 'market' | 'business'; slug: string; title: string; sources?: Array<{ url: string }> };
const index = JSON.parse(readFileSync(new URL('../../src/generated/discovery-index.json', import.meta.url), 'utf8')) as { entities: IndexEntity[] };
const byId = new Map(index.entities.map((e) => [e.id, e]));

async function send(mail: { subject: string; text: string; html: string }): Promise<string> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: 'CalgaryWatch admin <aldo@calgarywatch.ca>', to: recipients, subject: mail.subject, text: mail.text, html: mail.html }),
  });
  const body = await res.json().catch(() => ({})) as { id?: string; message?: string };
  if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? 'rejected'}`);
  return body.id;
}

async function run() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) { log('No Firebase credentials; nothing to do.'); return; }
  const db = inventoryDatabase();
  const dry = process.env.CLAIMS_DRY_RUN === '1';
  const now = Date.now();

  // Both sets are small (tens of docs); single-field filters need no composite index.
  const [pending, organizers] = await Promise.all([
    db.collection(CLAIMS).where('status', '==', 'pending').limit(500).get(),
    db.collection('users').where('signupAs', '==', 'organizer').limit(500).get(),
  ]);

  const candidates: AdminAlert[] = pending.docs.map((d) => {
    const c = d.data() as ListingClaim;
    return {
      kind: 'claim', claimId: d.id, entityTitle: c.entityTitle, entityPath: c.entityPath, name: c.name, role: c.role,
      workEmail: c.workEmail, accountEmail: c.accountEmail, phone: c.phone, note: c.note, createdAt: c.createdAt,
      evidence: claimEvidence({ accountEmail: c.accountEmail, workEmail: c.workEmail, sources: byId.get(c.entityId)?.sources ?? [] }),
    };
  });

  for (const u of organizers.docs) {
    const entityId = String(u.get('signupEntityId') ?? '');
    let user;
    try { user = await getAuth().getUser(u.id); } catch { continue; }
    const createdAt = Date.parse(user.metadata.creationTime);
    if (!(now - createdAt <= SIGNUP_LOOKBACK_MS)) continue;
    // Any claim from this account counts: it may have claimed the organizer behind the listing it signed up on.
    const hasClaim = !(await db.collection(CLAIMS).where('uid', '==', u.id).limit(1).get()).empty;
    if (!signupNeedsAlert(createdAt, hasClaim, now)) continue;
    const e = byId.get(entityId);
    candidates.push({
      kind: 'signup', uid: u.id, name: String(u.get('displayName') ?? user.displayName ?? ''), email: user.email ?? '',
      entityTitle: e?.title ?? entityId, entityPath: e ? entityPath(e) : `/claim/${entityId}`, emailVerified: user.emailVerified, createdAt,
    });
  }
  if (!candidates.length) { log('No pending claims or organizer sign-ups.'); return; }

  const seen = await db.getAll(...candidates.map((a) => db.collection(ADMIN_ALERTS).doc(alertKey(a))));
  const fresh = candidates.filter((_, i) => !seen[i].exists).sort((a, b) => a.createdAt - b.createdAt);
  if (!fresh.length) { log(`${candidates.length} already reported.`); return; }

  const mail = adminAlertEmail(fresh);
  if (dry) { log(`dry run → ${recipients.join(', ')}: ${mail.subject}\n${mail.text}`); return; }
  if (!process.env.RESEND_API_KEY) { log(`No RESEND_API_KEY; ${fresh.length} alert(s) waiting.`); return; }

  // Record first so an overlapping run can't send the same alert; create() fails if another run got there.
  const mine: AdminAlert[] = [];
  for (const a of fresh) {
    try { await db.collection(ADMIN_ALERTS).doc(alertKey(a)).create({ kind: a.kind, entityTitle: a.entityTitle, at: now, status: 'sending' }); mine.push(a); }
    catch (e) { if ((e as { code?: number }).code !== 6) throw e; } // 6 = ALREADY_EXISTS
  }
  if (!mine.length) return;
  const toSend = mine.length === fresh.length ? mail : adminAlertEmail(mine);
  try {
    const id = await send(toSend);
    await Promise.all(mine.map((a) => db.collection(ADMIN_ALERTS).doc(alertKey(a)).update({ status: 'sent', providerId: id, to: recipients })));
    log(`sent "${toSend.subject}" → ${recipients.join(', ')}`);
  } catch (e) {
    await Promise.all(mine.map((a) => db.collection(ADMIN_ALERTS).doc(alertKey(a)).delete().catch(() => undefined)));
    throw e;
  }
}

run().catch((e) => {
  if (isQuotaExhausted(e)) exitForQuota('claims:notify-admins');
  console.error('[claims:notify-admins] fatal:', e);
  process.exit(1);
});
