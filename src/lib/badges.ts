/**
 * Profile badges.
 *
 * Small, earned, and only ever for things a person actually did on
 * CalgaryWatch — never for time spent, streaks, or anything that would reward
 * filing more safety reports for their own sake. A report badge exists, but it
 * unlocks at one public report and has no higher tier: nobody should feel
 * nudged to post more crime to level up.
 *
 * Pure, so the rules for earning each one are tested without Firestore.
 */

export type BadgeId =
  | 'founding' | 'neighbour' | 'tuned-in' | 'on-the-list' | 'monday-reader'
  | 'first-plans' | 'regular' | 'all-rounder' | 'eyes-on-the-street';

export type BadgeTone = 'navy' | 'blue' | 'cyan' | 'sun' | 'coral' | 'green';

export interface BadgeDefinition {
  id: BadgeId;
  label: string;
  /** What it recognises, shown once earned. */
  earned: string;
  /** How to get it, shown while locked. */
  hint: string;
  tone: BadgeTone;
  /** Target for a counted badge; absent for a yes/no one. */
  target?: number;
}

export const BADGES: readonly BadgeDefinition[] = [
  { id: 'founding', label: 'Founding neighbour', earned: 'Joined CalgaryWatch in its first year.', hint: 'For accounts opened in 2026.', tone: 'sun' },
  { id: 'neighbour', label: 'Neighbour', earned: 'Told us which part of Calgary is home.', hint: 'Add your neighbourhood or address.', tone: 'green' },
  { id: 'tuned-in', label: 'Tuned in', earned: 'Picked three or more things you’re into.', hint: 'Choose at least three interests.', tone: 'cyan', target: 3 },
  { id: 'on-the-list', label: 'On the list', earned: 'Gets the Thursday event picks email.', hint: 'Turn on the Thursday picks email.', tone: 'blue' },
  { id: 'monday-reader', label: 'Monday reader', earned: 'Gets the Monday neighbourhood email.', hint: 'Turn on the Monday email from the live map.', tone: 'navy' },
  { id: 'first-plans', label: 'First plans', earned: 'Said “I’m going” to a Calgary event.', hint: 'Tap “I’m going” on any event.', tone: 'coral' },
  { id: 'regular', label: 'Regular', earned: 'Made plans for five Calgary events.', hint: 'Say “I’m going” to five events.', tone: 'sun', target: 5 },
  { id: 'all-rounder', label: 'All-rounder', earned: 'Made plans across three different kinds of events.', hint: 'Go to three different kinds of things.', tone: 'cyan', target: 3 },
  { id: 'eyes-on-the-street', label: 'Eyes on the street', earned: 'Shared a report neighbours could see on the live map.', hint: 'Post a report on the live map.', tone: 'navy' },
];

export interface BadgeInput {
  /** Account creation, epoch ms. */
  createdAt?: number | null;
  hasHomeArea: boolean;
  interestCount: number;
  eventsDigestOptIn: boolean;
  weeklyDigestOptIn: boolean;
  goingCount: number;
  /** Distinct interests across everything the reader said they're going to. */
  goingInterestCount: number;
  /** Public reports the reader authored; undefined while unknown. */
  reportCount?: number;
}

export interface BadgeState extends BadgeDefinition {
  unlocked: boolean;
  /** For counted badges: progress toward `target`, capped at it. */
  progress?: number;
}

/** First instant of 2027 in Calgary. Accounts opened before it are founding. */
export const FOUNDING_CUTOFF = Date.parse('2027-01-01T00:00:00-07:00');

export function computeBadges(input: BadgeInput): BadgeState[] {
  const has: Record<BadgeId, boolean | number> = {
    founding: typeof input.createdAt === 'number' && input.createdAt > 0 && input.createdAt < FOUNDING_CUTOFF,
    neighbour: input.hasHomeArea,
    'tuned-in': input.interestCount,
    'on-the-list': input.eventsDigestOptIn,
    'monday-reader': input.weeklyDigestOptIn,
    'first-plans': input.goingCount >= 1,
    regular: input.goingCount,
    'all-rounder': input.goingInterestCount,
    'eyes-on-the-street': (input.reportCount ?? 0) >= 1,
  };
  return BADGES.map((def) => {
    const value = has[def.id];
    if (def.target !== undefined) {
      const n = typeof value === 'number' ? value : 0;
      return { ...def, unlocked: n >= def.target, progress: Math.min(n, def.target) };
    }
    return { ...def, unlocked: value === true };
  });
}

/** Earned first, then locked; definition order within each. */
export function orderBadges(badges: readonly BadgeState[]): BadgeState[] {
  return [...badges.filter((b) => b.unlocked), ...badges.filter((b) => !b.unlocked)];
}
