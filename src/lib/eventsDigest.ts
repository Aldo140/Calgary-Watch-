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

/** Subject line: the reader's first real pick, never a manufactured superlative. */
export function eventsSubject(picks: EventPicks, interests: readonly EventInterestId[]): string {
  if (picks.going.length) return `You’re going to ${picks.going[0].title}, plus ${picks.picks.length} more picks`;
  if (!picks.picks.length) return 'A quiet week for your picks in Calgary';
  const lead = interests.length ? `${interestLabel(interests[0])} and more` : 'What’s on';
  return `${lead}: ${picks.picks.length} Calgary picks for this week`;
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
