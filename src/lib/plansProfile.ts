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
    eventInterests: normalizeInterests(d.eventInterests),
    eventsDigestOptIn: d.eventsDigestOptIn === true,
    eventsDigestOptInAt: num('eventsDigestOptInAt') ?? null,
  };
}

/** The area a reader's picks are centred on: typed neighbourhood, else the one inferred from their address. */
export function homeAreaOf(profile: Pick<PlansProfile, 'neighborhood' | 'inferredNeighborhood'>): string {
  return (profile.neighborhood || profile.inferredNeighborhood || '').trim();
}
