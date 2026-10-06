/**
 * The plans-related slice of a `users/{uid}` profile, read safely.
 * Pure (no Firebase import) so tests and scripts can use it.
 */

import { normalizeInterests, type EventInterestId } from './eventPicks';

export interface PlansProfile {
  displayName?: string;
  email?: string;
  photoURL?: string;
  createdAt?: number;
  neighborhood?: string;
  address?: string;
  inferredNeighborhood?: string;
  piiConsentAt?: number;
  weeklyDigestOptIn?: boolean;
  weeklyDigestOptInAt?: number | null;
  onboardingCompletedAt?: number;
  eventInterests: EventInterestId[];
  eventsDigestOptIn: boolean;
  eventsDigestOptInAt?: number | null;
}

export function readPlansProfile(data: Record<string, unknown> | undefined): PlansProfile {
  const d = data ?? {};
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : undefined);
  const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : undefined);
  return {
    displayName: str('displayName'),
    email: str('email'),
    photoURL: str('photoURL'),
    createdAt: num('createdAt'),
    neighborhood: str('neighborhood'),
    address: str('address'),
    inferredNeighborhood: str('inferredNeighborhood'),
    piiConsentAt: num('piiConsentAt'),
    weeklyDigestOptIn: d.weeklyDigestOptIn === true,
    weeklyDigestOptInAt: num('weeklyDigestOptInAt') ?? null,
    onboardingCompletedAt: num('onboardingCompletedAt'),
    eventInterests: normalizeInterests(d.eventInterests),
    eventsDigestOptIn: d.eventsDigestOptIn === true,
    eventsDigestOptInAt: num('eventsDigestOptInAt') ?? null,
  };
}

/** The area a reader's picks are centred on: typed neighbourhood, else the one inferred from their address. */
export function homeAreaOf(profile: Pick<PlansProfile, 'neighborhood' | 'inferredNeighborhood'>): string {
  return (profile.neighborhood || profile.inferredNeighborhood || '').trim();
}

/**
 * The consent fields for both email lists, from one choice.
 *
 * Each list keeps its first opt-in date while it stays on, clears it when
 * turned off, and records when and where an opt-out happened; an earlier
 * opt-out stays on record until the reader opts back in. Field names match
 * what the Monday sender (scripts/digest/weekly.ts), the Thursday sender
 * (scripts/digest/events.ts) and the live map's settings already read.
 */
export function emailConsentPatch(
  existing: Pick<PlansProfile, 'weeklyDigestOptIn' | 'weeklyDigestOptInAt' | 'eventsDigestOptIn' | 'eventsDigestOptInAt'> | null,
  choice: { weekly: boolean; events: boolean },
  now: number,
  source = 'plans-page',
): Record<string, unknown> {
  const list = (wasOn: boolean, since: number | null | undefined, on: boolean, f: { on: string; at: string; offAt: string; offSource: string }) => ({
    [f.on]: on,
    [f.at]: on ? (wasOn && since) || now : null,
    ...(on ? { [f.offAt]: null, [f.offSource]: null } : wasOn ? { [f.offAt]: now, [f.offSource]: source } : {}),
  });
  return {
    ...list(existing?.weeklyDigestOptIn === true, existing?.weeklyDigestOptInAt, choice.weekly,
      { on: 'weeklyDigestOptIn', at: 'weeklyDigestOptInAt', offAt: 'digestUnsubscribedAt', offSource: 'digestUnsubscribeSource' }),
    ...list(existing?.eventsDigestOptIn === true, existing?.eventsDigestOptInAt, choice.events,
      { on: 'eventsDigestOptIn', at: 'eventsDigestOptInAt', offAt: 'eventsDigestUnsubscribedAt', offSource: 'eventsDigestUnsubscribeSource' }),
  };
}
