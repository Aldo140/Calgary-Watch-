/**
 * Instant incident alerts.
 *
 * The weekly digest is a scheduled recap; this is the sharp, between-digest
 * nudge for the few things worth interrupting a day for. It runs often (every
 * ~15 minutes), asks selectAlerts what — if anything — each opted-in reader
 * should hear about since we last wrote to them, and emails only those.
 *
 * Safety is inherited from the digest sender: it is DRY RUN unless a real key
 * is present, honours DIGEST_TEST_EMAIL redirection, and is capped per run. The
 * eligibility policy itself lives in src/lib/alerts.ts and is unit-tested; this
 * file is the plumbing around it.
 *
 * Environment:
 *   FIREBASE_SERVICE_ACCOUNT   — JSON string of a Firebase service-account key
 *   RESEND_API_KEY             — Resend key (omit with DIGEST_DRY_RUN=1)
 *   DIGEST_DRY_RUN=1           — render and log, transmit nothing
 *   DIGEST_TEST_EMAIL          — redirect every message to this address
 *   ALERT_ONLY_UID / ALERT_ONLY_EMAIL — restrict the run to one account
 *   ALERT_LOOKBACK_HOURS       — window for a first run / missing cursor (default 6)
 *
 * Run:  DIGEST_DRY_RUN=1 tsx scripts/alerts/send.ts
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import type { Firestore } from 'firebase-admin/firestore';

import type { Incident } from '../../src/types/index.js';
import { selectAlerts } from '../../src/lib/alerts.js';
import { readAlertPreferences, type AlertProfileFields } from '../../src/lib/alertProfile.js';
import { renderAlertEmail } from './render.js';
import { loadSenderConfig, sendDigestEmail, sleep, type OutgoingEmail } from '../digest/send.js';

const ORIGIN = 'https://calgarywatch.ca';
const DEFAULT_LOOKBACK_MS = 6 * 60 * 60 * 1000;

function initFirebase(): Firestore {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  return getFirestore();
}

interface AlertRecipient {
  uid: string;
  email: string;
  displayName?: string;
  profile: Record<string, unknown>;
  alertLastSentAt: number | null;
  pushTokens: string[];
}

async function loadAlertRecipients(db: Firestore): Promise<AlertRecipient[]> {
  const onlyUid = process.env.ALERT_ONLY_UID?.trim();
  const onlyEmail = process.env.ALERT_ONLY_EMAIL?.trim().toLowerCase();
  const snapshot = onlyUid
    ? await db.collection('users').where('uid', '==', onlyUid).get()
    : await db.collection('users').where('alertsEnabled', '==', true).get();

  return snapshot.docs
    .map((doc) => {
      const d = doc.data();
      return {
        uid: doc.id,
        email: typeof d.email === 'string' ? d.email : '',
        displayName: typeof d.displayName === 'string' ? d.displayName : undefined,
        profile: d,
        alertLastSentAt: typeof d.alertLastSentAt === 'number' ? d.alertLastSentAt : null,
        pushTokens: Array.isArray(d.pushTokens) ? d.pushTokens.filter((t: unknown): t is string => typeof t === 'string') : [],
      };
    })
    .filter((r) => r.email && r.profile.alertsEnabled === true)
    .filter((r) => !onlyEmail || r.email.toLowerCase() === onlyEmail);
}

async function loadRecentIncidents(db: Firestore, now: number): Promise<Incident[]> {
  const lookback = Number(process.env.ALERT_LOOKBACK_HOURS ?? '6') * 60 * 60 * 1000;
  const snapshot = await db.collection('incidents')
    .where('visibility', '==', 'public')
    .where('timestamp', '>=', now - Math.max(lookback, DEFAULT_LOOKBACK_MS))
    .orderBy('timestamp', 'desc')
    .get();
  return snapshot.docs.map((doc) => {
    const d = doc.data();
    return { id: doc.id, ...d, lat: Number(d.lat), lng: Number(d.lng) } as Incident;
  });
}

function renderAlert(recipient: AlertRecipient, alerts: Incident[], now: number): OutgoingEmail {
  return { to: recipient.email, ...renderAlertEmail(alerts, now, ORIGIN) };
}

/**
 * Deliver a push to the reader's registered devices, alongside the email. Best
 * effort: a bad token is pruned, and any failure is swallowed so it never
 * blocks the run. A dry run logs and sends nothing.
 */
async function sendPush(recipient: AlertRecipient, alerts: Incident[], dryRun: boolean): Promise<void> {
  if (recipient.pushTokens.length === 0) return;
  const lead = alerts[0];
  const title = alerts.length === 1 ? 'Report near you' : `${alerts.length} reports near you`;
  const body = alerts.length === 1 ? lead.title : `${lead.title} +${alerts.length - 1} more`;
  if (dryRun) {
    console.log(`[alerts] dry run — would push to ${recipient.pushTokens.length} device(s) for ${recipient.uid}`);
    return;
  }
  try {
    const res = await getMessaging().sendEachForMulticast({
      tokens: recipient.pushTokens,
      notification: { title, body },
      data: { url: `${ORIGIN}/map` },
    });
    // Prune tokens the provider rejected as unregistered.
    const dead: string[] = [];
    res.responses.forEach((r, i) => { if (!r.success) dead.push(recipient.pushTokens[i]); });
    if (dead.length) {
      const { FieldValue } = await import('firebase-admin/firestore');
      await getFirestore().collection('users').doc(recipient.uid)
        .update({ pushTokens: FieldValue.arrayRemove(...dead) }).catch(() => {});
    }
  } catch (error) {
    console.warn(`[alerts] push failed ${recipient.uid}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function run(): Promise<void> {
  const config = loadSenderConfig(process.env);
  if (config.dryRun) console.log('[alerts] DRY RUN — nothing will be transmitted');

  const db = initFirebase();
  const now = Date.now();
  const recipients = await loadAlertRecipients(db);
  console.log(`[alerts] ${recipients.length} account(s) with instant alerts on`);
  if (recipients.length === 0) return;

  const incidents = await loadRecentIncidents(db, now);
  console.log(`[alerts] ${incidents.length} recent public report(s) to consider`);

  let sent = 0;
  let failed = 0;
  for (const recipient of recipients.slice(0, config.limit)) {
    const prefs = readAlertPreferences(recipient.profile as AlertProfileFields);
    if (!prefs.enabled) continue;
    const since = recipient.alertLastSentAt ?? now - DEFAULT_LOOKBACK_MS;
    const alerts = selectAlerts({ incidents, prefs, since, now }).slice(0, 5);
    if (alerts.length === 0) continue;

    const email = config.testRecipient ? { ...renderAlert(recipient, alerts, now), to: config.testRecipient } : renderAlert(recipient, alerts, now);
    const result = await sendDigestEmail(email, config);
    if (result.ok && !result.skipped) {
      sent += 1;
      await sendPush(recipient, alerts, config.dryRun);
      // Advance the cursor only on a real send, so a dry run never suppresses
      // the next live run's alerts.
      await db.collection('users').doc(recipient.uid).set({ alertLastSentAt: now }, { merge: true }).catch(() => {});
      console.log(`[alerts] sent ${alerts.length} to ${recipient.uid}`);
    } else if (result.skipped) {
      await sendPush(recipient, alerts, true);
      console.log(`[alerts] dry run — would send ${alerts.length} to ${recipient.uid}`);
    } else {
      failed += 1;
      console.warn(`[alerts] failed ${recipient.uid}: ${result.error}`);
    }
    await sleep(config.throttleMs);
  }

  console.log(`[alerts] done — ${sent} sent, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error('[alerts] fatal', error);
  process.exit(1);
});
