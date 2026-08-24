import {
  compareDigestDeliveryPriority,
  consentRefusal,
  consentTimestamp,
  digestDeliveryKind,
  digestWeekKey,
  WEEK_MS,
  type ConsentRefusal,
  type DigestDeliveryKind,
  type DigestRecipient,
  type DigestScope,
} from './digest';

export const DIGEST_CONTRIBUTION_STYLES = ['neighbour-note', 'news-brief', 'personal-story'] as const;
export type DigestContributionStyle = typeof DIGEST_CONTRIBUTION_STYLES[number];
export const DIGEST_CONTRIBUTION_AUDIENCES = ['everyone', 'local', 'citywide'] as const;
export type DigestContributionAudience = typeof DIGEST_CONTRIBUTION_AUDIENCES[number];

/**
 * The three emails involved in the digest lifecycle are intentionally separate.
 * Keeping this registry in shared code stops the admin console from presenting
 * an editorial voice as though it were a different subscriber template.
 */
export const DIGEST_TEMPLATE_PURPOSES = [
  {
    id: 'welcome',
    label: 'Welcome letter',
    timing: 'First eligible send',
    purpose: 'Introduces Calgary Watch and explains what arrives each Monday.',
    schedule: 'Checked by the Monday run at 15:00 UTC — 09:00 in Calgary during daylight time and 08:00 during standard time.',
    trigger: 'Used when an opted-in recipient has no successful welcome recorded. It replaces that week’s brief; the person never receives two Calgary Watch emails from the same run.',
    recipients: 'Every eligible opted-in subscriber whose first successful welcome is still pending. The live Recipients view shows any deployment allowlist or send-cap holds before Monday.',
    protection: 'After a successful delivery, digestWelcomeSentAt is recorded. Future Monday runs route that recipient to the weekly brief instead.',
  },
  {
    id: 'weekly',
    label: 'Weekly brief',
    timing: 'Every later Monday',
    purpose: 'Personalized local summary. This planner controls its optional opening note.',
    schedule: 'Runs every Monday at 15:00 UTC — 09:00 MDT or 08:00 MST. The edition week is calculated in America/Edmonton so daylight-saving time cannot move it into the wrong week.',
    trigger: 'Used for an eligible opted-in recipient whose welcome was already delivered. A published planner note is inserted first only when its selected audience matches that recipient’s local or city-wide summary.',
    recipients: 'Every eligible opted-in subscriber whose welcome was already delivered. The live Recipients view applies the current deployment safety settings and 50-delivery ceiling.',
    protection: 'One send-ledger record per recipient and Calgary week prevents duplicates. Manual workflow runs are dry by default and transmit nothing unless an operator deliberately changes the controls.',
  },
  {
    id: 'admin-proof',
    label: 'Admin proof',
    timing: 'After publish or removal',
    purpose: 'Private delivery check for approved administrators only.',
    schedule: 'Event-driven, not part of the Monday schedule. Publishing, updating, removing, or manually retesting an opening creates a proof request immediately.',
    trigger: 'The Firebase preview function renders the selected edition and sends an individually addressed proof. Removing an opening sends a cancellation notice instead.',
    recipients: 'Only jorti104@mtroyal.ca and ophillah1863@gmail.com are approved. Subscriber addresses are never used for proofs.',
    protection: 'Each request is processed once and reports delivery per administrator. Activation requires the Firebase Blaze plan, the Resend secret and a successful backend deployment.',
  },
] as const;

export type DigestAudienceStatus = 'scheduled' | 'held-allowlist' | 'held-limit' | 'attention';

export interface DigestAudienceRow {
  uid: string;
  email: string;
  displayName: string;
  location: string;
  kind: DigestDeliveryKind;
  status: DigestAudienceStatus;
  refusal: ConsentRefusal | null;
  consentedAt: number | null;
  welcomeSentAt: number | null;
}

export interface DigestAudienceForecast {
  rows: DigestAudienceRow[];
  allowlistActive: boolean;
  limit: number;
}

/**
 * Mirrors the Monday sender's consent, routing, priority, allowlist and cap.
 * The admin forecast and the job therefore answer "who gets what?" identically.
 */
export function buildDigestAudienceForecast(
  profiles: DigestRecipient[],
  options: { allowlist?: string[]; limit?: number } = {},
): DigestAudienceForecast {
  const allowlist = new Set((options.allowlist ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean));
  const suppliedLimit = Number(options.limit ?? 50);
  const limit = Number.isFinite(suppliedLimit) && suppliedLimit > 0 ? Math.floor(suppliedLimit) : 50;
  const optedIn = profiles.filter((profile) => profile.weeklyDigestOptIn === true);
  const eligible = optedIn.filter((profile) => consentRefusal(profile) === null)
    .sort(compareDigestDeliveryPriority);
  const statuses = new Map<string, DigestAudienceStatus>();
  let scheduled = 0;

  eligible.forEach((profile) => {
    const permitted = allowlist.size === 0 || allowlist.has(profile.email?.trim().toLowerCase() ?? '');
    if (!permitted) statuses.set(profile.uid, 'held-allowlist');
    else if (scheduled >= limit) statuses.set(profile.uid, 'held-limit');
    else {
      statuses.set(profile.uid, 'scheduled');
      scheduled += 1;
    }
  });

  const statusOrder: Record<DigestAudienceStatus, number> = {
    scheduled: 0,
    'held-allowlist': 1,
    'held-limit': 2,
    attention: 3,
  };
  const rows = optedIn.map((profile): DigestAudienceRow => {
    const refusal = consentRefusal(profile);
    return {
      uid: profile.uid,
      email: profile.email?.trim() ?? '',
      displayName: profile.displayName?.trim() ?? '',
      location: profile.neighborhood?.trim() || profile.inferredNeighborhood?.trim() || 'City-wide',
      kind: digestDeliveryKind(profile),
      status: refusal ? 'attention' : statuses.get(profile.uid) ?? 'attention',
      refusal,
      consentedAt: consentTimestamp(profile),
      welcomeSentAt: profile.digestWelcomeSentAt ?? null,
    };
  }).sort((a, b) => statusOrder[a.status] - statusOrder[b.status]
    || (a.kind === b.kind ? 0 : a.kind === 'welcome' ? -1 : 1)
    || (a.displayName || a.email).localeCompare(b.displayName || b.email));

  return { rows, allowlistActive: allowlist.size > 0, limit };
}

export interface DigestContribution {
  weekKey: string;
  weekStart: number;
  headline: string;
  preheader?: string;
  body: string;
  style: DigestContributionStyle;
  audience?: DigestContributionAudience;
  byline?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  status: 'published';
  authorUid?: string;
  authorEmail?: string;
  authorName?: string;
  createdAt?: number;
  updatedAt?: number;
  revision?: number;
}

export const CONTRIBUTION_AUDIENCE_COPY: Record<DigestContributionAudience, {
  label: string;
  description: string;
}> = {
  everyone: { label: 'Every weekly reader', description: 'Show this opening in every recurring digest.' },
  local: { label: 'Local-result readers', description: 'Only readers whose digest stayed near their home or community.' },
  citywide: { label: 'City-wide readers', description: 'Only readers receiving a Calgary-wide digest.' },
};

export const CONTRIBUTION_OUTLINES: Record<DigestContributionStyle, {
  label: string;
  headline: string;
  body: string;
}> = {
  'neighbour-note': {
    label: 'Practical update outline',
    headline: 'What neighbours should know this week',
    body: 'Replace this with the essential context in one or two sentences.\n\n## What to know\n\n- Replace this with the first useful point\n- Replace this with the second useful point',
  },
  'news-brief': {
    label: 'Watch desk outline',
    headline: 'This week’s Calgary Watch update',
    body: 'Replace this with the verified news in one concise paragraph.\n\n## What changed\n\n- Replace this with a factual change\n- Replace this with a second factual change\n\n## What it means\n\nReplace this with the practical impact for readers.',
  },
  'personal-story': {
    label: 'Community story outline',
    headline: 'A moment from our community',
    body: 'Replace this with the scene: who, where and what happened.\n\n> Replace this with the detail or quotation that carries the story.\n\nReplace this with the reflection and why it matters this week.',
  },
};

export function contributionAppliesToScope(
  contribution: Pick<DigestContribution, 'audience'> | undefined,
  scope: DigestScope,
): boolean {
  const audience = contribution?.audience ?? 'everyone';
  if (audience === 'local') return scope === 'home' || scope === 'community';
  if (audience === 'citywide') return scope === 'city';
  return true;
}

export type DigestInlineToken =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'link'; text: string; url: string };

export type DigestBodyBlock =
  | { type: 'paragraph'; content: DigestInlineToken[] }
  | { type: 'heading'; content: DigestInlineToken[] }
  | { type: 'quote'; content: DigestInlineToken[] }
  | { type: 'list'; items: DigestInlineToken[][] };

/** Only web links are accepted in an email contribution. */
export function normalizeDigestUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

/**
 * A deliberately small, deterministic formatting language for administrator copy.
 * It is expressive enough for editorial hierarchy without accepting raw HTML.
 */
export function parseDigestInline(value: string): DigestInlineToken[] {
  const tokens: DigestInlineToken[] = [];
  const pattern = /\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ type: 'text', text: value.slice(cursor, index) });
    if (match[1]) tokens.push({ type: 'strong', text: match[1] });
    else {
      const url = normalizeDigestUrl(match[3]);
      tokens.push(url
        ? { type: 'link', text: match[2], url }
        : { type: 'text', text: match[0] });
    }
    cursor = index + match[0].length;
  }
  if (cursor < value.length) tokens.push({ type: 'text', text: value.slice(cursor) });
  return tokens.length ? tokens : [{ type: 'text', text: value }];
}

export function parseDigestBody(value: string): DigestBodyBlock[] {
  const lines = value.replace(/\r/g, '').split('\n');
  const blocks: DigestBodyBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    const text = paragraph.join('\n').trim();
    if (text) blocks.push({ type: 'paragraph', content: parseDigestInline(text) });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list.map(parseDigestInline) });
    list = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
    } else if (/^##\s+/.test(trimmed)) {
      flushParagraph(); flushList();
      blocks.push({ type: 'heading', content: parseDigestInline(trimmed.replace(/^##\s+/, '')) });
    } else if (/^>\s?/.test(trimmed)) {
      flushParagraph(); flushList();
      blocks.push({ type: 'quote', content: parseDigestInline(trimmed.replace(/^>\s?/, '')) });
    } else if (/^-\s+/.test(trimmed)) {
      flushParagraph();
      list.push(trimmed.replace(/^-\s+/, ''));
    } else {
      flushList();
      paragraph.push(trimmed);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function digestBodyPlainText(value: string): string {
  return value
    .replace(/^##\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-]\s+/gm, '• ')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g, '$1 ($2)');
}

export const CONTRIBUTION_STYLE_COPY: Record<DigestContributionStyle, {
  label: string;
  description: string;
  emailLabel: string;
}> = {
  'neighbour-note': {
    label: 'Neighbour note',
    description: 'A short, practical message from the team.',
    emailLabel: 'A note from Calgary Watch',
  },
  'news-brief': {
    label: 'News brief',
    description: 'For factual updates, launches and service news.',
    emailLabel: 'From the watch desk',
  },
  'personal-story': {
    label: 'Personal story',
    description: 'For a reflective first-person community story.',
    emailLabel: 'This week in our community',
  },
};

export interface DigestWeekOption {
  weekKey: string;
  weekStart: number;
  label: string;
}

/** Exact next GitHub cron tick: Monday at 15:00 UTC, including today if pending. */
export function nextDigestRunAt(when: Date | number = Date.now()): number {
  const now = new Date(when);
  const daysUntilMonday = (8 - now.getUTCDay()) % 7;
  let candidate = Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday, 15, 0, 0,
  );
  if (candidate <= now.getTime()) candidate += WEEK_MS;
  return candidate;
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
  const preheader = typeof candidate.preheader === 'string' ? candidate.preheader.trim().slice(0, 140) : '';
  const body = typeof candidate.body === 'string' ? candidate.body.trim().slice(0, 2400) : '';
  const byline = typeof candidate.byline === 'string' ? candidate.byline.trim().slice(0, 80) : '';
  const ctaLabel = typeof candidate.ctaLabel === 'string' ? candidate.ctaLabel.trim().slice(0, 50) : '';
  const ctaUrl = typeof candidate.ctaUrl === 'string' ? normalizeDigestUrl(candidate.ctaUrl) : '';
  const style = DIGEST_CONTRIBUTION_STYLES.includes(candidate.style as DigestContributionStyle)
    ? candidate.style as DigestContributionStyle
    : null;
  const audience = DIGEST_CONTRIBUTION_AUDIENCES.includes(candidate.audience as DigestContributionAudience)
    ? candidate.audience as DigestContributionAudience
    : 'everyone';
  if (!/^\d{4}-W\d{2}$/.test(candidate.weekKey ?? '') || !body || !style) return null;
  return {
    ...candidate,
    weekKey: candidate.weekKey!,
    weekStart: typeof candidate.weekStart === 'number' ? candidate.weekStart : 0,
    headline,
    preheader,
    body,
    style,
    audience,
    byline,
    ctaLabel: ctaUrl && ctaLabel ? ctaLabel : '',
    ctaUrl: ctaUrl && ctaLabel ? ctaUrl : '',
    status: 'published',
  };
}
