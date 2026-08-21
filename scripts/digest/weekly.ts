/**
 * Calgary Watch — Weekly Digest Sender
 *
 * Run via GitHub Actions, Mondays:
 *   npx tsx scripts/digest/weekly.ts
 *
 * Required environment variables:
 *   FIREBASE_SERVICE_ACCOUNT   — JSON string of a Firebase service-account key
 *   RESEND_API_KEY             — Resend API key (not needed with DIGEST_DRY_RUN=1)
 *   DIGEST_MAILING_ADDRESS     — physical address; CASL requires it in every message
 *   DIGEST_SENDER_NAME         — who the message is from, in the footer
 *   DIGEST_SUPPORT_EMAIL       — a mailbox a person actually reads
 *
 * Optional:
 *   DIGEST_DRY_RUN=1           — render and log, transmit nothing
 *   DIGEST_TEST_EMAIL=you@…    — redirect every message to one address
 *   DIGEST_ONLY_UID=abc123     — restrict the run to a single account
 *   DIGEST_LIMIT=50            — hard ceiling on messages per run
 *   DIGEST_ORIGIN=https://…    — site origin used for links (default production)
 *
 * ── The order of operations matters ────────────────────────────────────────
 * Unsubscribes are processed BEFORE recipients are selected. Doing it the other
 * way round would mail somebody in the same run that acknowledged their request
 * to stop, which is precisely the failure CASL exists to prevent.
 *
 * ── On idempotency ─────────────────────────────────────────────────────────
 * Every send is claimed by creating `digest_sends/{uid}_{isoWeek}` with a
 * create-only transaction *before* the provider is called. GitHub Actions
 * re-runs jobs, humans press "Re-run failed jobs", and a timeout can leave a
 * run half-finished — without the claim, any of those mails the list twice. The
 * claim is taken first and released only on a failure that definitely never
 * reached the provider, because a duplicate email is worse than a missed one.
 *
 * ── On addresses ───────────────────────────────────────────────────────────
 * A saved street address is resolved to coordinates in memory and never written
 * back. `src/hooks/useHomeLocation.ts` made that choice for the browser and the
 * reasoning is identical here: we need the point for the length of one render,
 * not a precise residential coordinate sitting in the database forever.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';

import {
  buildDigestSummary,
  consentRefusal,
  consentTimestamp,
  consentTimestampIsInferred,
  digestSendId,
  digestSubject,
  digestWeekKey,
  isValidUnsubToken,
  unsubscribeUrl,
  WEEK_MS,
  type DigestRecipient,
} from '../../src/lib/digest.js';
import { normalizeDigestContribution, type DigestContribution } from '../../src/lib/digestPlanner.js';
import { resolveHomeLocation, type HomeLocation } from '../../src/hooks/useHomeLocation.js';
import { assertBrandingComplete, renderDigestHtml, renderDigestText, renderWelcomeHtml, renderWelcomeText, type DigestBranding } from './render.js';
import { WELCOME } from './copy.js';
import { letterheadImages, welcomeImages } from './art.js';
import { loadSenderConfig, sendDigestEmail, sleep } from './send.js';
import type { Incident } from '../../src/types/index.js';

const PRODUCTION_ORIGIN = 'https://calgarywatch.ca';
const SENDS = 'digest_sends';
const UNSUBS = 'digest_unsubscribes';
const PLANS = 'weekly_email_plans';

function initFirebase(): Firestore {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
  }
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  }
  return getFirestore();
}

// ── Unsubscribes ────────────────────────────────────────────────────────────

/**
 * Honour every pending unsubscribe, then mark it honoured.
 *
 * The unsubscribe page cannot flip `weeklyDigestOptIn` itself — the rules only
 * let the owner write their own profile, and somebody clicking a link in an
 * email is by definition not signed in. So the page files a request that the
 * rules validate against the account's token, and this job is what actually
 * carries it out with admin credentials.
 *
 * Requests are stamped rather than deleted. CASL puts the burden of proving we
 * honoured a withdrawal on us, and a deleted document proves nothing.
 */
async function processUnsubscribes(db: Firestore): Promise<number> {
  const pending = await db.collection(UNSUBS).where('processedAt', '==', null).get();
  let honoured = 0;

  for (const request of pending.docs) {
    const uid = request.id;
    try {
      await db.collection('users').doc(uid).set({
        weeklyDigestOptIn: false,
        weeklyDigestOptInAt: null,
        weeklyDigestTopics: [],
        digestUnsubscribedAt: Date.now(),
      }, { merge: true });
      await request.ref.set({ processedAt: Date.now() }, { merge: true });
      honoured += 1;
      console.log(`[digest] unsubscribed ${uid}`);
    } catch (error) {
      // Leave the request pending so the next run retries it. Never swallow.
      console.error(`[digest] FAILED to honour unsubscribe for ${uid}:`, error);
      process.exitCode = 1;
    }
  }
  return honoured;
}

// ── Recipients ──────────────────────────────────────────────────────────────

async function loadRecipients(db: Firestore): Promise<DigestRecipient[]> {
  const onlyUid = process.env.DIGEST_ONLY_UID?.trim();
  const snapshot = onlyUid
    ? await db.collection('users').where('uid', '==', onlyUid).get()
    : await db.collection('users').where('weeklyDigestOptIn', '==', true).get();

  return snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      uid: doc.id,
      email: typeof d.email === 'string' ? d.email : undefined,
      displayName: typeof d.displayName === 'string' ? d.displayName : undefined,
      neighborhood: typeof d.neighborhood === 'string' ? d.neighborhood : undefined,
      inferredNeighborhood: typeof d.inferredNeighborhood === 'string' ? d.inferredNeighborhood : undefined,
      weeklyDigestOptIn: d.weeklyDigestOptIn === true,
      weeklyDigestOptInAt: typeof d.weeklyDigestOptInAt === 'number' ? d.weeklyDigestOptInAt : null,
      // Older evidence of the same consent, for accounts that predate the
      // weeklyDigestOptInAt field. See consentTimestamp() in src/lib/digest.ts.
      digestPromptedAt: typeof d.digestPromptedAt === 'number' ? d.digestPromptedAt : null,
      onboardingCompletedAt: typeof d.onboardingCompletedAt === 'number' ? d.onboardingCompletedAt : null,
      piiConsentAt: typeof d.piiConsentAt === 'number' ? d.piiConsentAt : null,
      profileUpdatedAt: typeof d.profileUpdatedAt === 'number' ? d.profileUpdatedAt : null,
      weeklyDigestTopics: Array.isArray(d.weeklyDigestTopics) ? d.weeklyDigestTopics : [],
      digestUnsubToken: typeof d.digestUnsubToken === 'string' ? d.digestUnsubToken : undefined,
      digestWelcomeSentAt: typeof d.digestWelcomeSentAt === 'number' ? d.digestWelcomeSentAt : null,
      // Kept out of DigestRecipient so it cannot reach a template by accident.
      _address: typeof d.address === 'string' ? d.address : '',
    } as DigestRecipient & { _address: string };
  });
}

/**
 * Mint the account's unsubscribe token the first time it is needed.
 *
 * Stored on the profile rather than signed, because the link has to be checked
 * by Firestore rules on a static site with nowhere to keep a signing key. 128
 * bits from a CSPRNG is not guessable, and it is scoped to one account: the uid
 * and the token must agree, so editing the URL unsubscribes nobody.
 */
async function ensureUnsubToken(db: Firestore, profile: DigestRecipient): Promise<string> {
  if (isValidUnsubToken(profile.digestUnsubToken)) return profile.digestUnsubToken!;
  const token = randomBytes(16).toString('hex');
  await db.collection('users').doc(profile.uid).set({ digestUnsubToken: token }, { merge: true });
  return token;
}

// ── Incidents ───────────────────────────────────────────────────────────────

/**
 * Two weeks of public reports, fetched once for the whole run.
 *
 * Fourteen days because the digest states a week-over-week change, and one
 * query because per-recipient queries would multiply Firestore reads by the
 * size of the list to return almost entirely the same documents.
 */
async function loadRecentIncidents(db: Firestore, now: number): Promise<Incident[]> {
  // The explicit descending order is load-bearing, not cosmetic.
  //
  // An equality filter plus a range filter and NO orderBy makes Firestore ask
  // for an index ordered (visibility ASC, timestamp ASC) — which the project
  // does not have, so the first run against production died with
  // FAILED_PRECONDITION before a single message was built. Naming the order
  // the project already indexes (visibility ASC, timestamp DESC) serves the
  // same query from the existing composite, so no index has to be created or
  // deployed. Newest-first also happens to be the order the digest wants.
  const snapshot = await db.collection('incidents')
    .where('visibility', '==', 'public')
    .where('timestamp', '>=', now - 2 * WEEK_MS)
    .orderBy('timestamp', 'desc')
    .get();

  return snapshot.docs.map((doc) => {
    const d = doc.data();
    return { id: doc.id, ...d, lat: Number(d.lat), lng: Number(d.lng) } as Incident;
  });
}

async function loadWeeklyContribution(db: Firestore, weekKey: string): Promise<DigestContribution | undefined> {
  const snapshot = await db.collection(PLANS).doc(weekKey).get();
  if (!snapshot.exists || snapshot.data()?.status !== 'published') return undefined;
  const contribution = normalizeDigestContribution(snapshot.data());
  if (!contribution) {
    console.warn(`[digest] ${weekKey} has an invalid planner contribution; sending the default brief`);
    return undefined;
  }
  return contribution;
}

// ── Run ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const now = Date.now();
  const weekKey = digestWeekKey(now);
  const origin = process.env.DIGEST_ORIGIN?.trim() || PRODUCTION_ORIGIN;
  console.log(`[digest] ${weekKey} — starting ${new Date(now).toISOString()}`);

  const sender = loadSenderConfig();
  const branding: DigestBranding = {
    mailingAddress: process.env.DIGEST_MAILING_ADDRESS ?? '',
    senderName: process.env.DIGEST_SENDER_NAME ?? '',
    supportEmail: process.env.DIGEST_SUPPORT_EMAIL ?? '',
    origin,
  };
  // Fail on the legal requirements before a single document is touched. The
  // renderer checks these too, but by then a ledger claim has been taken and
  // the failure is per-recipient noise rather than one clear line at the top.
  // Dry runs are checked as well — a rehearsal that skips the check is not one.
  assertBrandingComplete(branding);

  if (sender.dryRun) console.log('[digest] DRY RUN — nothing will be transmitted');
  if (sender.testRecipient) console.log(`[digest] TEST MODE — all mail → ${sender.testRecipient}`);
  if (sender.allowlist.length > 0) {
    console.log(`[digest] ALLOWLIST ACTIVE — only ${sender.allowlist.join(', ')} can be mailed`);
  } else {
    console.log('[digest] NO ALLOWLIST — every opted-in subscriber is in scope');
  }

  const db = initFirebase();

  const honoured = await processUnsubscribes(db);
  if (honoured > 0) console.log(`[digest] honoured ${honoured} unsubscribe(s)`);

  const recipients = await loadRecipients(db);
  console.log(`[digest] ${recipients.length} profile(s) flagged for the digest`);
  if (recipients.length === 0) return;

  const incidents = await loadRecentIncidents(db, now);
  console.log(`[digest] ${incidents.length} public report(s) in the last 14 days`);
  const contribution = await loadWeeklyContribution(db, weekKey);
  console.log(`[digest] opening contribution ${contribution ? `revision ${contribution.revision ?? 1}` : 'not scheduled'}`);

  // Addresses repeat across a household; resolve each one once per run.
  const geocodeCache = new Map<string, HomeLocation | null>();

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const profile of recipients) {
    if (sent >= sender.limit) {
      console.warn(`[digest] hit DIGEST_LIMIT (${sender.limit}); stopping early`);
      break;
    }

    const refusal = consentRefusal(profile);
    if (refusal) {
      console.log(`[digest] skip ${profile.uid}: ${refusal}`);
      skipped += 1;
      continue;
    }

    // Write the recovered date back, once. These accounts consented before the
    // field existed; persisting our best evidence now means the record stops
    // depending on a fallback chain and the next run reads it directly.
    if (consentTimestampIsInferred(profile)) {
      const recovered = consentTimestamp(profile)!;
      await db.collection('users').doc(profile.uid).set({
        weeklyDigestOptInAt: recovered,
        weeklyDigestOptInAtSource: 'recovered',
      }, { merge: true }).catch((error) => {
        console.error(`[digest] could not backfill consent date for ${profile.uid}:`, error);
      });
      console.log(`[digest] recovered consent date for ${profile.uid}`
        + ` (${new Date(recovered).toISOString().slice(0, 10)})`);
    }

    // Claim the week before doing anything that could send. A second run, a
    // manual re-run or an overlapping job all lose the race here rather than
    // in somebody's inbox.
    const claim = db.collection(SENDS).doc(digestSendId(profile.uid, weekKey));
    try {
      await claim.create({
        uid: profile.uid,
        weekKey,
        claimedAt: now,
        status: 'claimed',
      });
    } catch {
      console.log(`[digest] skip ${profile.uid}: already sent for ${weekKey}`);
      skipped += 1;
      continue;
    }

    try {
      const address = ((profile as DigestRecipient & { _address?: string })._address ?? '').trim();
      let home: HomeLocation | null = null;
      if (address) {
        if (!geocodeCache.has(address)) {
          geocodeCache.set(address, await resolveHomeLocation(address));
        }
        home = geocodeCache.get(address) ?? null;
      }

      const summary = buildDigestSummary({ incidents, profile, home, now });
      const token = await ensureUnsubToken(db, profile);
      const unsubUrl = unsubscribeUrl(origin, profile.uid, token);

      // The first message anybody gets is the introduction, not a digest.
      // A brief arriving cold from a half-remembered signup reads as spam, so
      // one person gets one hello — tracked on the profile rather than by
      // counting ledger rows, because the flag survives a ledger cleanup and
      // costs no extra read.
      const isFirstEmail = (profile as DigestRecipient & { digestWelcomeSentAt?: number | null })
        .digestWelcomeSentAt == null;
      const render = isFirstEmail ? renderWelcomeHtml : renderDigestHtml;
      const renderText = isFirstEmail ? renderWelcomeText : renderDigestText;
      const shared = {
        summary,
        displayName: profile.displayName,
        unsubscribeUrl: unsubUrl,
        branding,
        contribution: isFirstEmail ? undefined : contribution,
      };

      const email = {
        to: profile.email!.trim(),
        subject: isFirstEmail ? WELCOME.subject : digestSubject(summary),
        html: render(shared),
        text: renderText(shared),
        unsubscribeUrl: unsubUrl,
        inline: isFirstEmail ? welcomeImages() : letterheadImages(),
      };

      const result = await sendDigestEmail(email, sender);

      // Nothing left the building — a dry run, or a recipient the allowlist
      // refused. Release the claim.
      //
      // A claim that outlives a rehearsal is worse than no claim at all: the
      // week is marked spent, and the REAL Monday run skips everybody as
      // already sent. That turned the safest way to test into the one action
      // guaranteed to break the next live send, and left "remember to delete
      // the ledger rows afterwards" as a manual step nobody should be asked to
      // remember. The claim is still taken first, so the ordering that makes
      // duplicates impossible is exercised exactly as it will be in production.
      if (result.skipped) {
        await claim.delete().catch(() => {});
        skipped += 1;
        console.log(`[digest] ${result.blocked ? 'blocked' : 'dry run'} ${profile.uid}`
          + ` — ${summary.total} report(s) ${summary.ringLabel}, claim released`);
        continue;
      }
      if (result.ok) {
        sent += 1;
        await claim.set({
          status: 'sent',
          sentAt: Date.now(),
          providerId: result.id ?? null,
          subject: email.subject,
          kind: isFirstEmail ? 'welcome' : 'digest',
          reportCount: summary.total,
          ring: summary.ringLabel,
        }, { merge: true });
        if (isFirstEmail) {
          await db.collection('users').doc(profile.uid)
            .set({ digestWelcomeSentAt: Date.now() }, { merge: true });
        }
        console.log(`[digest] sent ${profile.uid}${isFirstEmail ? ' (hello)' : ''}`
          + ` — ${summary.total} report(s) ${summary.ringLabel}`);
      } else {
        failed += 1;
        // The provider rejected it, so nothing was delivered — release the
        // claim so next week's run (or a re-run today) can try again.
        await claim.delete().catch(() => {});
        console.error(`[digest] FAILED ${profile.uid}: ${result.error}`);
      }
    } catch (error) {
      failed += 1;
      await claim.delete().catch(() => {});
      console.error(`[digest] FAILED ${profile.uid}:`, error);
    }

    await sleep(sender.throttleMs);
  }

  console.log(`[digest] done — sent ${sent}, skipped ${skipped}, failed ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error('[digest] fatal:', error);
  process.exit(1);
});
