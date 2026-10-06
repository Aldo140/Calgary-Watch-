/**
 * CalgaryWatch — Thursday event picks
 *
 * Run via GitHub Actions on Thursday mornings, after a fresh inventory export:
 *   npm run discovery:export && npx tsx scripts/digest/events.ts
 *
 * Same environment, same guards and the same Resend sender as the Monday
 * digest (scripts/digest/weekly.ts): DIGEST_DRY_RUN, DIGEST_TEST_EMAIL,
 * DIGEST_ONLY_UID / DIGEST_ONLY_EMAIL, DIGEST_LIMIT and, above all,
 * DIGEST_ALLOWLIST, which while set means nobody else can be mailed.
 *
 * It is a separate list with its own consent (`eventsDigestOptIn` +
 * `eventsDigestOptInAt`), its own ledger (`events_digest_sends`) and its own
 * unsubscribe queue (`events_digest_unsubscribes`). Unsubscribes are honoured
 * before anybody is selected, exactly as on Monday.
 *
 * Picks come from src/lib/eventPicks.ts — the very function the /plans page
 * uses for its preview — over the published inventory the site itself ships,
 * so the email can never recommend something the site would not show.
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { digestWeekKey, isValidUnsubToken } from '../../src/lib/digest.js';
import { buildEventPicks, normalizeInterests, neighbourhoodPoint, type Point } from '../../src/lib/eventPicks.js';
import { eventsConsentRefusal, eventsEmailMode, eventsSendId, eventsUnsubscribeUrl, type EventsDigestRecipient } from '../../src/lib/eventsDigest.js';
import { createDiscoveryRepository } from '../../src/lib/discovery.js';
import { resolveHomeLocation } from '../../src/hooks/useHomeLocation.js';
import type { DiscoveryEntity, MarketOccurrence } from '../../src/types/discovery.js';
import { assertBrandingComplete, eventsEmailContent, renderEventsHtml, renderEventsText, type DigestBranding } from './render.js';
import { letterheadImages } from './art.js';
import { loadSenderConfig, sendDigestEmail, sleep } from './send.js';

const PRODUCTION_ORIGIN = 'https://calgarywatch.ca';
const SENDS = 'events_digest_sends';
const UNSUBS = 'events_digest_unsubscribes';
const RSVPS = 'event_rsvps';
/** Thursday to the Sunday after next: this weekend and the next one's Friday. */
const WINDOW_DAYS = 10;
const MAX_PICKS = 8;

function initFirebase(): Firestore {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(json)) });
  return getFirestore();
}

/** The same published inventory the site was built with. */
function loadInventory() {
  const file = join(process.cwd(), 'src/generated/discovery-index.json');
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { generatedAt?: string; entities: DiscoveryEntity[]; occurrences: MarketOccurrence[] };
  const repo = createDiscoveryRepository(raw.entities, raw.occurrences, false);
  return { entities: repo.list(), occurrences: repo.occurrences(), generatedAt: raw.generatedAt };
}

/** Opt-outs filed from an email link. Stamped, never deleted (CASL burden of proof). */
async function processUnsubscribes(db: Firestore): Promise<number> {
  const pending = await db.collection(UNSUBS).where('processedAt', '==', null).get();
  let honoured = 0;
  for (const request of pending.docs) {
    const uid = request.id;
    try {
      const requestedAt = typeof request.data().requestedAt === 'number' ? request.data().requestedAt as number : 0;
      const profileRef = db.collection('users').doc(uid);
      const profile = (await profileRef.get()).data() ?? {};
      const consentAt = profile.eventsDigestOptIn === true && typeof profile.eventsDigestOptInAt === 'number' ? profile.eventsDigestOptInAt as number : 0;
      if (consentAt > requestedAt) {
        await request.ref.set({ processedAt: Date.now(), outcome: 'superseded-by-new-consent' }, { merge: true });
        continue;
      }
      await profileRef.set({
        eventsDigestOptIn: false,
        eventsDigestOptInAt: null,
        eventsDigestUnsubscribedAt: Date.now(),
        eventsDigestUnsubscribeSource: 'email-link',
      }, { merge: true });
      await request.ref.set({ processedAt: Date.now(), outcome: 'unsubscribed' }, { merge: true });
      honoured += 1;
      console.log(`[events] unsubscribed ${uid}`);
    } catch (error) {
      console.error(`[events] FAILED to honour unsubscribe for ${uid}:`, error);
      process.exitCode = 1;
    }
  }
  return honoured;
}

type Loaded = EventsDigestRecipient & { _address: string; _mondayOn: boolean };

async function loadRecipients(db: Firestore): Promise<Loaded[]> {
  const onlyUid = process.env.DIGEST_ONLY_UID?.trim();
  const onlyEmail = process.env.DIGEST_ONLY_EMAIL?.trim().toLowerCase();
  if (onlyUid && onlyEmail) throw new Error('Set DIGEST_ONLY_UID or DIGEST_ONLY_EMAIL, not both.');
  const users = db.collection('users');
  const snapshot = onlyUid ? await users.where('uid', '==', onlyUid).get()
    : onlyEmail ? await users.where('email', '==', onlyEmail).get()
      : await users.where('eventsDigestOptIn', '==', true).get();
  return snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      uid: doc.id,
      email: typeof d.email === 'string' ? d.email : undefined,
      displayName: typeof d.displayName === 'string' ? d.displayName : undefined,
      neighborhood: typeof d.neighborhood === 'string' ? d.neighborhood : undefined,
      inferredNeighborhood: typeof d.inferredNeighborhood === 'string' ? d.inferredNeighborhood : undefined,
      eventsDigestOptIn: d.eventsDigestOptIn === true,
      eventsDigestOptInAt: typeof d.eventsDigestOptInAt === 'number' ? d.eventsDigestOptInAt : null,
      eventInterests: normalizeInterests(d.eventInterests),
      digestUnsubToken: typeof d.digestUnsubToken === 'string' ? d.digestUnsubToken : undefined,
      eventsWelcomeSentAt: typeof d.eventsWelcomeSentAt === 'number' ? d.eventsWelcomeSentAt : null,
      // Kept off the recipient type so it can't reach a template.
      _address: typeof d.address === 'string' ? d.address : '',
      _mondayOn: d.weeklyDigestOptIn === true,
    };
  });
}

/** Shared with the Monday list: one secret per account, minted on first need. */
async function ensureUnsubToken(db: Firestore, profile: EventsDigestRecipient): Promise<string> {
  if (isValidUnsubToken(profile.digestUnsubToken)) return profile.digestUnsubToken!;
  const token = randomBytes(16).toString('hex');
  await db.collection('users').doc(profile.uid).set({ digestUnsubToken: token }, { merge: true });
  return token;
}

async function run() {
  const now = new Date();
  const weekKey = digestWeekKey(now);
  const origin = (process.env.DIGEST_ORIGIN || PRODUCTION_ORIGIN).replace(/\/$/, '');
  const sender = loadSenderConfig();
  const branding: DigestBranding = {
    mailingAddress: process.env.DIGEST_MAILING_ADDRESS ?? '',
    senderName: process.env.DIGEST_SENDER_NAME ?? '',
    supportEmail: process.env.DIGEST_SUPPORT_EMAIL ?? '',
    origin,
  };
  assertBrandingComplete(branding);

  if (sender.dryRun) console.log('[events] DRY RUN — nothing will be transmitted');
  if (sender.testRecipient) console.log(`[events] TEST MODE — all mail → ${sender.testRecipient}`);
  if (sender.testRecipient && !process.env.DIGEST_ONLY_UID?.trim() && !process.env.DIGEST_ONLY_EMAIL?.trim()) {
    throw new Error('A redirected test must set DIGEST_ONLY_UID or DIGEST_ONLY_EMAIL.');
  }
  console.log(sender.allowlist.length
    ? `[events] ALLOWLIST ACTIVE — only ${sender.allowlist.join(', ')} can be mailed`
    : '[events] NO ALLOWLIST — every opted-in reader is in scope');

  const inventory = loadInventory();
  console.log(`[events] inventory ${inventory.generatedAt ?? 'unknown'}: ${inventory.entities.length} published listings`);

  const db = initFirebase();
  const honoured = await processUnsubscribes(db);
  if (honoured) console.log(`[events] honoured ${honoured} unsubscribe(s)`);

  const recipients = (await loadRecipients(db))
    .filter((r) => {
      const refusal = eventsConsentRefusal(r);
      if (refusal) console.log(`[events] skip ${r.uid}: ${refusal}`);
      return !refusal;
    })
    // Oldest consent first, so a cap always reaches the earliest sign-ups.
    .sort((a, b) => (a.eventsDigestOptInAt ?? 0) - (b.eventsDigestOptInAt ?? 0) || a.uid.localeCompare(b.uid));

  // One message per address, however many accounts share it.
  const seen = new Set<string>();
  const planned = recipients.filter((r) => {
    const key = r.email!.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, sender.limit);
  console.log(`[events] ${planned.length} planned (cap ${sender.limit}, ${recipients.length} eligible)`);
  if (sender.testRecipient && planned.length !== 1) throw new Error(`A redirected test must resolve exactly one reader; resolved ${planned.length}.`);

  const geocode = new Map<string, Point | null>();
  let sent = 0; let skipped = 0; let failed = 0;

  for (const profile of planned) {
    const claimKey = sender.testRecipient ? `${weekKey}_test_${process.env.GITHUB_RUN_ID ?? randomBytes(4).toString('hex')}` : weekKey;
    const claim = db.collection(SENDS).doc(eventsSendId(profile.uid, claimKey));
    try {
      await claim.create({ uid: profile.uid, weekKey, claimedAt: Date.now(), status: 'claimed' });
    } catch {
      console.log(`[events] skip ${profile.uid}: already sent for ${weekKey}`);
      skipped += 1;
      continue;
    }

    try {
      const area = (profile.neighborhood || profile.inferredNeighborhood || '').trim();
      let home: Point | null = null;
      const address = profile._address.trim();
      if (address) {
        if (!geocode.has(address)) geocode.set(address, await resolveHomeLocation(address));
        home = geocode.get(address) ?? null;
      }
      home ??= neighbourhoodPoint(area);

      const rsvps = await db.collection(RSVPS).where('uid', '==', profile.uid).get();
      const goingIds = new Set(rsvps.docs.map((d) => String(d.data().eventId)));

      const picks = buildEventPicks({
        entities: inventory.entities,
        occurrences: inventory.occurrences,
        interests: profile.eventInterests,
        home,
        homeArea: area,
        goingIds,
        now,
        days: WINDOW_DAYS,
        limit: MAX_PICKS,
      });
      // Nothing matched their interests: a short "what else is on" instead of an empty email.
      const fallback = picks.picks.length ? null : buildEventPicks({
        entities: inventory.entities, occurrences: inventory.occurrences, interests: [], home, homeArea: area, goingIds, now, days: WINDOW_DAYS, limit: 5,
      });
      const mode = eventsEmailMode(picks, fallback);
      if (mode === 'skip') {
        // No email is better than an empty one. Release the week so a re-run can try again.
        await claim.delete().catch(() => {});
        skipped += 1;
        console.log(`[events] skip ${profile.uid}: nothing on in the next ${WINDOW_DAYS} days`);
        continue;
      }

      const token = await ensureUnsubToken(db, profile);
      const unsubscribeUrl = eventsUnsubscribeUrl(origin, profile.uid, token);
      const shared = {
        picks, fallback, interests: profile.eventInterests, area, displayName: profile.displayName, unsubscribeUrl, branding, at: now.getTime(),
        first: !profile.eventsWelcomeSentAt,
        offerMonday: !profile._mondayOn,
      };
      const content = eventsEmailContent(shared);
      const email = {
        to: profile.email!.trim(),
        subject: content.subject,
        html: renderEventsHtml(shared),
        text: renderEventsText(shared),
        unsubscribeUrl,
        // Replies go to a person, not the Monday reply-routing inbox (whose
        // per-send tokens only exist for the Monday ledger).
        replyTo: process.env.DIGEST_REPLY_TO?.trim() || process.env.DIGEST_SUPPORT_EMAIL?.trim() || undefined,
        inline: letterheadImages(),
      };

      const result = await sendDigestEmail(email, sender);
      if (result.skipped || (result.ok && sender.testRecipient)) {
        // Nothing reached the real reader: release the week so Thursday's real run isn't spent.
        await claim.delete().catch(() => {});
        if (result.skipped) skipped += 1; else sent += 1;
        console.log(`[events] ${result.blocked ? 'blocked' : result.skipped ? 'dry run' : 'test sent'} ${profile.uid} — ${mode}${shared.first ? ' (first)' : ''}, ${picks.going.length} going, ${content.list.length} listed; claim released`);
      } else if (result.ok) {
        sent += 1;
        await claim.set({ status: 'sent', sentAt: Date.now(), providerId: result.id ?? null, subject: email.subject, mode, first: shared.first, picks: content.list.length, going: picks.going.length }, { merge: true });
        if (!profile.eventsWelcomeSentAt) await db.collection('users').doc(profile.uid).set({ eventsWelcomeSentAt: Date.now() }, { merge: true });
        console.log(`[events] sent ${profile.uid} — ${mode}${shared.first ? ' (first)' : ''}, ${picks.going.length} going, ${content.list.length} listed`);
      } else {
        failed += 1;
        await claim.delete().catch(() => {});
        console.error(`[events] FAILED ${profile.uid}: ${result.error}`);
      }
    } catch (error) {
      failed += 1;
      await claim.delete().catch(() => {});
      console.error(`[events] FAILED ${profile.uid}:`, error);
    }
    await sleep(sender.throttleMs);
  }

  console.log(`[events] done — sent ${sent}, skipped ${skipped}, failed ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error('[events] fatal:', error);
  process.exit(1);
});
