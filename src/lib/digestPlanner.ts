import { digestWeekKey, WEEK_MS } from './digest';

export const DIGEST_CONTRIBUTION_STYLES = ['neighbour-note', 'news-brief', 'personal-story'] as const;
export type DigestContributionStyle = typeof DIGEST_CONTRIBUTION_STYLES[number];

export interface DigestContribution {
  weekKey: string;
  weekStart: number;
  headline: string;
  body: string;
  style: DigestContributionStyle;
  status: 'published';
  authorUid?: string;
  authorEmail?: string;
  authorName?: string;
  createdAt?: number;
  updatedAt?: number;
  revision?: number;
}

export const CONTRIBUTION_STYLE_COPY: Record<DigestContributionStyle, {
  label: string;
  description: string;
  emailLabel: string;
}> = {
  'neighbour-note': {
    label: 'Neighbour note',
    description: 'Warm, direct and community-minded.',
    emailLabel: 'A note from Calgary Watch',
  },
  'news-brief': {
    label: 'News brief',
    description: 'Concise and factual, like a newsroom update.',
    emailLabel: 'From the watch desk',
  },
  'personal-story': {
    label: 'Personal story',
    description: 'A more reflective first-person contribution.',
    emailLabel: 'This week in our community',
  },
};

export interface DigestWeekOption {
  weekKey: string;
  weekStart: number;
  label: string;
}

function localCalendarParts(when: Date | number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(when));
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

/** Upcoming Monday editions, with next week selected first even when today is Monday. */
export function upcomingDigestWeeks(
  when: Date | number = Date.now(),
  count = 8,
  timeZone = 'America/Edmonton',
): DigestWeekOption[] {
  const local = localCalendarParts(when, timeZone);
  const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day, 18));
  const daysUntilNextMonday = ((8 - localDate.getUTCDay()) % 7) || 7;
  const firstMonday = Date.UTC(local.year, local.month - 1, local.day + daysUntilNextMonday, 18);

  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const weekStart = firstMonday + index * WEEK_MS;
    const weekEnd = weekStart + 6 * 24 * 60 * 60 * 1000;
    const from = new Intl.DateTimeFormat('en-CA', { timeZone, month: 'short', day: 'numeric' })
      .format(new Date(weekStart));
    const to = new Intl.DateTimeFormat('en-CA', { timeZone, month: 'short', day: 'numeric', year: 'numeric' })
      .format(new Date(weekEnd));
    return {
      weekKey: digestWeekKey(weekStart, timeZone),
      weekStart,
      label: `${from} – ${to}`,
    };
  });
}

export function normalizeDigestContribution(value: unknown): DigestContribution | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<DigestContribution>;
  const headline = typeof candidate.headline === 'string' ? candidate.headline.trim().slice(0, 100) : '';
  const body = typeof candidate.body === 'string' ? candidate.body.trim().slice(0, 2400) : '';
  const style = DIGEST_CONTRIBUTION_STYLES.includes(candidate.style as DigestContributionStyle)
    ? candidate.style as DigestContributionStyle
    : null;
  if (!/^\d{4}-W\d{2}$/.test(candidate.weekKey ?? '') || !body || !style) return null;
  return {
    ...candidate,
    weekKey: candidate.weekKey!,
    weekStart: typeof candidate.weekStart === 'number' ? candidate.weekStart : 0,
    headline,
    body,
    style,
    status: 'published',
  };
}
