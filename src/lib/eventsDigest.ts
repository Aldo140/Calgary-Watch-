/**
 * The Thursday events email: who may get it, and what it says.
 *
 * A separate list from the Monday neighbourhood email, with its own opt-in,
 * consent date, ledger and unsubscribe, because somebody who wants weekend
 * plans has not agreed to a crime recap and vice versa. It shares the
 * per-account unsubscribe token, which is a secret about the account, not
 * about a list.
 */

import { isPlausibleEmail } from './digest';
import { interestLabel, type EventInterestId, type EventPicks } from './eventPicks';

export interface EventsDigestRecipient {
  uid: string;
  email?: string;
  displayName?: string;
  neighborhood?: string;
  inferredNeighborhood?: string;
  eventsDigestOptIn?: boolean;
  eventsDigestOptInAt?: number | null;
  eventInterests: EventInterestId[];
  digestUnsubToken?: string;
  eventsWelcomeSentAt?: number | null;
}

export type EventsConsentRefusal = 'not-opted-in' | 'no-consent-timestamp' | 'no-email' | 'invalid-email';

/** Positive on every count, like the Monday list: an explicit true, a date, and an address. */
export function eventsConsentRefusal(profile: EventsDigestRecipient): EventsConsentRefusal | null {
  if (profile.eventsDigestOptIn !== true) return 'not-opted-in';
  if (!(typeof profile.eventsDigestOptInAt === 'number' && profile.eventsDigestOptInAt > 0)) return 'no-consent-timestamp';
  const email = profile.email?.trim() ?? '';
  if (!email) return 'no-email';
  if (!isPlausibleEmail(email)) return 'invalid-email';
  return null;
}

export function eventsSendId(uid: string, weekKey: string): string {
  return `${uid}_${weekKey}`;
}

export function eventsUnsubscribeUrl(origin: string, uid: string, token: string): string {
  const url = new URL('/unsubscribe', origin);
  url.searchParams.set('uid', uid);
  url.searchParams.set('t', token);
  url.searchParams.set('list', 'events');
  return url.toString();
}

/** For the combined Monday email: one link that stops both lists. */
export function allUnsubscribeUrl(origin: string, uid: string, token: string): string {
  const url = new URL(eventsUnsubscribeUrl(origin, uid, token));
  url.searchParams.set('list', 'all');
  return url.toString();
}

/**
 * What this reader's Thursday email is, this week.
 *   picks       – things matching their interests (the normal case)
 *   fallback    – nothing matched, so a short "what else is on" list instead
 *                 of an empty email; says so plainly
 *   going-only  – nothing new, but reminders for what they said they're going to
 *   skip        – nothing at all: no email is better than an empty one
 */
export type EventsEmailMode = 'picks' | 'fallback' | 'going-only' | 'skip';

export function eventsEmailMode(picks: EventPicks, fallback: EventPicks | null): EventsEmailMode {
  if (picks.picks.length) return 'picks';
  if (fallback?.picks.length) return 'fallback';
  if (picks.going.length) return 'going-only';
  return 'skip';
}

/** Subject line: the reader's first real pick, never a manufactured superlative. */
export function eventsSubject(picks: EventPicks, interests: readonly EventInterestId[], opts: { mode?: EventsEmailMode; first?: boolean; fallbackCount?: number } = {}): string {
  const mode = opts.mode ?? eventsEmailMode(picks, null);
  if (opts.first && mode === 'picks') return `Your first Thursday picks: ${picks.picks.length} things to do in Calgary`;
  if (picks.going.length && mode !== 'fallback') return picks.picks.length
    ? `You’re going to ${picks.going[0].title}, plus ${picks.picks.length} more pick${picks.picks.length === 1 ? '' : 's'}`
    : `Reminder: you’re going to ${picks.going[0].title}`;
  if (mode === 'fallback') return `Nothing matched your picks this week, but ${opts.fallbackCount ?? 'a few'} things are on`;
  if (!picks.picks.length) return 'A quiet week for your picks in Calgary';
  const lead = interests.length ? `${interestLabel(interests[0])} and more` : 'What’s on';
  return `${lead}: ${picks.picks.length} Calgary pick${picks.picks.length === 1 ? '' : 's'} for this week`;
}

/** Sentence for the top of the email explaining why these were chosen. */
export function eventsIntro(interests: readonly EventInterestId[], area: string): string {
  const what = interests.length
    ? interests.slice(0, 3).map((i) => interestLabel(i).toLowerCase()).join(', ') + (interests.length > 3 ? ' and the rest of your picks' : '')
    : 'a bit of everything';
  return area
    ? `Chosen for ${what}, with things near ${area} given a head start. Listed by date.`
    : `Chosen for ${what}, from listings checked against the organizer’s own page.`;
}
