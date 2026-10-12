/**
 * Every subscriber, sorted into the one email they will get next.
 *
 * The planner used to answer "who gets what" in three places that never met:
 * the Monday recipient forecast, the Thursday list counts and a gallery of
 * previews. This puts each person in exactly one segment, named for the email
 * that segment receives, so the admin can read the week as "11 people get the
 * welcome, 34 get the combined week, 6 still have no area" and open the exact
 * email each group will see.
 *
 * Pure and side-effect free: the same rules as scripts/digest/weekly.ts and
 * scripts/digest/events.ts, read from the profile fields both senders use.
 */

import { consentRefusal, digestDeliveryKind, type DigestRecipient } from './digest';
import { eventsConsentRefusal } from './eventsDigest';
import { normalizeInterests } from './eventPicks';

export type SegmentId =
  | 'welcome' | 'welcome-city' | 'both' | 'monday-home' | 'monday-city'
  | 'thursday' | 'thursday-no-area';

export interface SegmentDefinition {
  id: SegmentId;
  label: string;
  who: string;
  /** The preview file in email-previews/ this segment receives. */
  file: string;
  /** Cover colour of that email, for the swatch. */
  tone: 'paper' | 'blue' | 'city' | 'yellow' | 'week';
  day: 'Monday' | 'Thursday';
  /** What makes their email different from everyone else's. */
  tailored: string;
}

export const SEGMENTS: readonly SegmentDefinition[] = [
  { id: 'welcome', label: 'New, with an area', who: 'First Monday, neighbourhood saved', file: 'welcome.html', tone: 'paper', day: 'Monday', tailored: 'A hello, their setup checklist, and a sample of their own area’s week.' },
  { id: 'welcome-city', label: 'New, no area yet', who: 'First Monday, nothing saved', file: 'welcome-city.html', tone: 'paper', day: 'Monday', tailored: 'Checklist flags the missing area with a one-tap fix.' },
  { id: 'both', label: 'Both lists', who: 'Monday brief and Thursday picks', file: 'combined.html', tone: 'week', day: 'Monday', tailored: 'One “your week” email: their blocks, then the pick of the week.' },
  { id: 'monday-home', label: 'Monday, near home', who: 'Monday only, area saved', file: 'digest.html', tone: 'blue', day: 'Monday', tailored: 'Their count, day-by-day strip and CW pick angle, closest first.' },
  { id: 'monday-city', label: 'Monday, whole city', who: 'Monday only, no area', file: 'city.html', tone: 'city', day: 'Monday', tailored: 'Where reports landed across Calgary, and a “make it yours” ask.' },
  { id: 'thursday', label: 'Thursday, near home', who: 'Thursday only, area saved', file: 'thursday.html', tone: 'yellow', day: 'Thursday', tailored: 'Pick of the week, a seven-day strip, free and nearby counts.' },
  { id: 'thursday-no-area', label: 'Thursday, no area', who: 'Thursday only, nothing saved', file: 'thursday-no-area.html', tone: 'yellow', day: 'Thursday', tailored: 'Picks without distances and a prompt to add their area.' },
];

/** The loose profile shape both lists read. */
export type SegmentProfile = DigestRecipient & {
  eventsDigestOptIn?: boolean;
  eventsDigestOptInAt?: number | null;
  eventInterests?: unknown;
};

export interface SegmentCounts {
  counts: Record<SegmentId, number>;
  /** Mailable readers in any segment. */
  total: number;
  /** Monday readers who narrowed their topics: a modifier, not a segment. */
  topicFiltered: number;
  /** Thursday readers with no interests: they get "a bit of everything". */
  noInterests: number;
  /** Opted in to something but not mailable (consent, address). */
  blocked: number;
}

const hasArea = (p: SegmentProfile) => Boolean((p.neighborhood || p.inferredNeighborhood || '').trim());

export function segmentReaders(monday: SegmentProfile[], thursday: SegmentProfile[]): SegmentCounts {
  const counts = Object.fromEntries(SEGMENTS.map((s) => [s.id, 0])) as Record<SegmentId, number>;
  let topicFiltered = 0;
  let noInterests = 0;
  let blocked = 0;

  const thursdayOk = new Map<string, SegmentProfile>();
  for (const p of thursday) {
    const refusal = eventsConsentRefusal({
      uid: p.uid, email: p.email, eventsDigestOptIn: p.eventsDigestOptIn === true,
      eventsDigestOptInAt: typeof p.eventsDigestOptInAt === 'number' ? p.eventsDigestOptInAt : null,
      eventInterests: normalizeInterests(p.eventInterests),
    });
    if (refusal) { blocked += 1; continue; }
    thursdayOk.set(p.uid, p);
    if (!normalizeInterests(p.eventInterests).length) noInterests += 1;
  }

  const mondayUids = new Set<string>();
  for (const p of monday) {
    if (consentRefusal(p)) { blocked += 1; continue; }
    mondayUids.add(p.uid);
    if (p.digestCategories?.length) topicFiltered += 1;
    // The welcome always wins: the sender never folds a first email into the
    // combined week, so a new both-lists reader is a welcome this Monday.
    if (digestDeliveryKind(p) === 'welcome') counts[hasArea(p) ? 'welcome' : 'welcome-city'] += 1;
    else if (thursdayOk.has(p.uid)) counts.both += 1;
    else counts[hasArea(p) ? 'monday-home' : 'monday-city'] += 1;
  }

  for (const [uid, p] of thursdayOk) {
    if (mondayUids.has(uid)) continue;
    counts[hasArea(p) ? 'thursday' : 'thursday-no-area'] += 1;
  }

  const total = Object.values(counts).reduce((n, c) => n + c, 0);
  return { counts, total, topicFiltered, noInterests, blocked };
}
