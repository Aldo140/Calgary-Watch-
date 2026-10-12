/**
 * Sample readers for reviewing the email planner on the dev server.
 *
 * Used only when `import.meta.env.DEV` is true and Firebase is not configured
 * (`/admin?preview`), so the segment cards and recipient lists have something
 * to show. Production builds replace DEV with false and drop this module.
 */

import type { UserProfile } from '@/src/hooks/useAdminData';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 12, 15);
const AREAS = ['Beltline', 'Bridgeland', 'Inglewood', 'Seton', 'Varsity', 'Kensington', 'Mission', 'Bowness'];
const NAMES = ['Vicky Penny', 'Sam Ortiz', 'Priya Shah', 'Jordan Lee', 'Maya Chen', 'Alex Roy', 'Noor Haddad', 'Chris Dube', 'Taylor Kim', 'Robin Ng'];

function person(i: number, over: Partial<UserProfile> & Record<string, unknown> = {}): UserProfile & Record<string, unknown> {
  const name = NAMES[i % NAMES.length];
  return {
    uid: `sample-${i}`,
    email: `${name.split(' ')[0].toLowerCase()}.${i}@example.com`,
    displayName: name,
    role: 'user',
    neighborhood: AREAS[i % AREAS.length],
    weeklyDigestOptIn: true,
    weeklyDigestOptInAt: NOW - (20 + i) * DAY,
    digestWelcomeSentAt: NOW - (13 + i) * DAY,
    ...over,
  };
}

export const SAMPLE_MONDAY: UserProfile[] = [
  ...Array.from({ length: 22 }, (_, i) => person(i)),
  ...Array.from({ length: 6 }, (_, i) => person(30 + i, { neighborhood: undefined })),
  ...Array.from({ length: 5 }, (_, i) => person(40 + i, { digestWelcomeSentAt: null, weeklyDigestOptInAt: NOW - i * DAY })),
  ...Array.from({ length: 2 }, (_, i) => person(50 + i, { digestWelcomeSentAt: null, neighborhood: undefined, weeklyDigestOptInAt: NOW - DAY })),
  ...Array.from({ length: 4 }, (_, i) => person(60 + i, { digestCategories: ['crime', 'traffic'] })),
  person(70, { weeklyDigestOptInAt: null }),
];

export const SAMPLE_THURSDAY: Array<Record<string, unknown> & { uid: string }> = [
  // On both lists: the first twelve Monday readers.
  ...Array.from({ length: 12 }, (_, i) => ({ ...person(i), eventsDigestOptIn: true, eventsDigestOptInAt: NOW - 10 * DAY, eventInterests: ['music', 'food'] })),
  // Thursday only.
  ...Array.from({ length: 9 }, (_, i) => ({ ...person(80 + i, { weeklyDigestOptIn: false }), eventsDigestOptIn: true, eventsDigestOptInAt: NOW - 5 * DAY, eventInterests: i % 3 ? ['family', 'outdoors'] : [] })),
  ...Array.from({ length: 3 }, (_, i) => ({ ...person(90 + i, { weeklyDigestOptIn: false, neighborhood: undefined }), eventsDigestOptIn: true, eventsDigestOptInAt: NOW - 3 * DAY, eventInterests: ['arts'] })),
];
