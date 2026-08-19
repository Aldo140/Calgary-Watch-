/**
 * Calgary Watch — weekly digest, the part that decides what to say.
 *
 * Deliberately pure and dependency-free: no React, no Firebase, no DOM. The
 * browser renders a briefing from this and the Monday cron writes an email from
 * it, and neither is allowed to drift from the other. Everything here takes
 * plain data and returns plain data, so `npm test` can check the sentences a
 * resident will actually receive without a network or an emulator.
 *
 * Only `import type` crosses into the app's types — nothing is pulled in at
 * runtime, so `npx tsx scripts/digest/weekly.ts` stays a cold-start script.
 */

import type { Incident, IncidentCategory } from '@/src/types';

/** Seven days, in ms. The digest's whole horizon. */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Rings, widest-last, matching the personal briefing's.
 *
 * A digest that opens with "0 reports within a 15-minute walk" has reported the
 * radius we picked, not the neighbourhood they live in. So it widens until
 * there is something to say and names the ring it settled on.
 */
export const DIGEST_RINGS: ReadonlyArray<{ metres: number; label: string }> = [
  { metres: 1_200, label: 'within a 15-minute walk' },
  { metres: 3_000, label: 'within 3 km' },
  { metres: 10_000, label: 'within 10 km' },
];

/** Categories in the order the email lists them: loudest first. */
export const DIGEST_CATEGORY_ORDER: readonly IncidentCategory[] = [
  'emergency', 'crime', 'traffic', 'infrastructure', 'weather',
];

export const DIGEST_CATEGORY_LABEL: Record<IncidentCategory, string> = {
  emergency: 'Emergency',
  crime: 'Crime',
  traffic: 'Traffic',
  infrastructure: 'Infrastructure',
  weather: 'Weather',
};

export const DIGEST_CATEGORY_COLOUR: Record<IncidentCategory, string> = {
  emergency: '#B0503A',
  crime: '#B0503A',
  traffic: '#B0793C',
  infrastructure: '#2F5F52',
  weather: '#6E6357',
};

// ── Consent ─────────────────────────────────────────────────────────────────

/**
 * The shape the sender needs off `users/{uid}`.
 *
 * Intentionally narrower than the app's profile type. A sender that can only
 * see these fields cannot accidentally put an address or a display photo in an
 * email, and the consent decision below is auditable from one small struct.
 */
export interface DigestRecipient {
  uid: string;
  email?: string;
  displayName?: string;
  neighborhood?: string;
  inferredNeighborhood?: string;
  weeklyDigestOptIn?: boolean;
  weeklyDigestOptInAt?: number | null;
  weeklyDigestTopics?: string[];
  digestUnsubToken?: string;
}

export type ConsentRefusal =
  | 'not-opted-in'
  | 'no-consent-timestamp'
  | 'no-email'
  | 'invalid-email';

/**
 * Whether this person may lawfully be emailed, and why not when they may not.
 *
 * CASL treats the burden of proof as ours, so the check is positive on every
 * count rather than an absence of a suppression flag: an explicit `true`, a
 * timestamp recording when they gave it, and an address to send to. A profile
 * that merely fails to say "no" is not consent, and `weeklyDigestOptIn` is
 * compared against `true` rather than coerced so a stray truthy string in an
 * old document cannot become permission.
 *
 * Returns null when everything checks out — "no reason to refuse".
 */
export function consentRefusal(profile: DigestRecipient): ConsentRefusal | null {
  if (profile.weeklyDigestOptIn !== true) return 'not-opted-in';
  if (typeof profile.weeklyDigestOptInAt !== 'number' || profile.weeklyDigestOptInAt <= 0) {
    return 'no-consent-timestamp';
  }
  const email = profile.email?.trim() ?? '';
  if (!email) return 'no-email';
  if (!isPlausibleEmail(email)) return 'invalid-email';
  return null;
}

export function mayEmail(profile: DigestRecipient): boolean {
  return consentRefusal(profile) === null;
}

/**
 * A deliberately loose check: reject what cannot be an address, accept the rest.
 *
 * Strict RFC validation rejects real mailboxes, and the provider will bounce
 * anything genuinely undeliverable. This exists to stop empty strings and
 * obvious junk from becoming an API call.
 */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value.trim());
}

// ── Week identity ───────────────────────────────────────────────────────────

/**
 * The ISO week a send belongs to, in Calgary's clock — "2026-W34".
 *
 * This is the idempotency key. It has to be computed in America/Edmonton, not
 * UTC: a job that fires 09:00 Calgary is 15:00 or 16:00 UTC depending on the
 * season, and a UTC week boundary would put two consecutive Monday sends in the
 * same bucket, or the same send in two. Getting this wrong means either a
 * silent skip or a duplicate email, so it is derived from the parts a
 * timezone-aware formatter reports rather than from arithmetic on the epoch.
 */
export function digestWeekKey(when: Date | number, timeZone = 'America/Edmonton'): string {
  const date = typeof when === 'number' ? new Date(when) : when;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // Reconstruct the Calgary calendar date as a UTC instant, then do ISO week
  // arithmetic on it. Working in UTC from here keeps DST out of the maths.
  const local = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));

  // ISO-8601: week 1 is the week holding the first Thursday, weeks start Monday.
  const day = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() + 4 - day);
  const isoYear = local.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((local.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** The ledger document id for one person's send in one week. */
export function digestSendId(uid: string, weekKey: string): string {
  return `${uid}_${weekKey}`;
}

// ── Geography ───────────────────────────────────────────────────────────────

export interface Point { lat: number; lng: number }

/** Great-circle metres between two points. */
export function distanceMetres(a: Point, b: Point): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "180 m" below a kilometre, "1.4 km" above — the briefing's phrasing. */
export function formatDigestDistance(metres: number): string {
  if (metres < 25) return 'at your address';
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}

/**
 * Loose neighbourhood match.
 *
 * Community names arrive from four registries with four house styles —
 * "Saddle Ridge", "SADDLERIDGE", "Saddleridge Industrial" — so comparison is on
 * letters alone, and a containment either way counts. Over-matching a
 * neighbouring community is a far smaller error here than sending someone an
 * empty email about the place they live.
 */
export function neighborhoodMatches(a: string | undefined, b: string | undefined): boolean {
  const norm = (v: string | undefined) => (v ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const x = norm(a);
  const y = norm(b);
  if (x.length < 4 || y.length < 4) return false;
  return x === y || x.includes(y) || y.includes(x);
}

// ── Selection ───────────────────────────────────────────────────────────────

export interface ScoredIncident {
  incident: Incident;
  /** Metres from home, or null when we only know the community name. */
  distanceM: number | null;
}

/**
 * How much we actually know about where this person lives.
 *
 * The distinction matters more than it looks. "Nothing happened near you" and
 * "we don't know where you are" produce the same empty list, and reporting the
 * second as the first is a lie the reader has no way to detect — they would
 * conclude their neighbourhood had a quiet week when in fact Calgary had a
 * normal one and we never looked at their part of it.
 *
 *   home       a saved address resolved to coordinates → real distances
 *   community  a neighbourhood name matched reports → no distances, real place
 *   city       we could not place them, or their area had nothing → all Calgary
 */
export type DigestScope = 'home' | 'community' | 'city';

export interface DigestSummary {
  weekKey: string;
  scope: DigestScope;
  /**
   * True when the person has given us no usable location at all. Drives the
   * one line of the email that asks for one — and nothing else, because
   * somebody who has not set an address still deserves a useful digest.
   */
  needsLocation: boolean;
  /** True when their own area was empty and the digest widened to the city. */
  widenedToCity: boolean;
  /** Start of the seven-day window, inclusive. */
  since: number;
  until: number;
  /** Human phrase for the ring we settled on, e.g. "within 3 km". */
  ringLabel: string;
  /** Everything in scope for this person this week, nearest/newest first. */
  items: ScoredIncident[];
  total: number;
  byCategory: Array<{ category: IncidentCategory; label: string; count: number; colour: string }>;
  /** Same count for the seven days before, for the week-over-week line. */
  previousTotal: number;
  /** Signed change vs last week. */
  delta: number;
  /** The handful the email actually lists. */
  highlights: ScoredIncident[];
  /** True when there is genuinely nothing to report. */
  quiet: boolean;
  areaName: string;
}

export const MAX_HIGHLIGHTS = 6;

/**
 * Reports that are allowed to appear in somebody's inbox.
 *
 * Three exclusions, each load-bearing. Hidden and deleted reports must never be
 * mailed — an email cannot be un-sent when a moderator takes a post down an
 * hour later, so takedown has to be honoured at selection time, not at render
 * time. Demo reports are staged examples and would read as real events. Expired
 * ingested records have already left the map and would arrive as news that is
 * no longer true.
 */
export function isMailable(incident: Incident, now: number): boolean {
  const visibility = incident.visibility
    ?? (incident.deleted ? 'deleted' : incident.flagged ? 'flagged' : 'public');
  if (visibility !== 'public') return false;
  if (incident.data_source === 'demo') return false;
  if (typeof incident.expires_at === 'number' && incident.expires_at <= now) return false;
  return Number.isFinite(incident.lat) && Number.isFinite(incident.lng);
}

/**
 * Everything relevant to one person, in the tightest ring that has anything.
 *
 * Two matching modes, because the two things a resident can give us are
 * different in kind. A saved street address resolves to a point and gets real
 * distances; a community name only supports a name comparison. Someone who gave
 * us a name is not given fake precision — their items carry `distanceM: null`
 * and the email says "in <community>" rather than inventing a radius.
 */
export function buildDigestSummary(options: {
  incidents: Incident[];
  profile: DigestRecipient;
  /** Resolved coordinates for a saved street address, when we have them. */
  home?: Point | null;
  now: number;
  rings?: ReadonlyArray<{ metres: number; label: string }>;
}): DigestSummary {
  const { incidents, profile, home, now } = options;
  const rings = options.rings ?? DIGEST_RINGS;
  const since = now - WEEK_MS;
  const previousSince = since - WEEK_MS;

  const savedArea = (profile.neighborhood || profile.inferredNeighborhood || '').trim();
  const mailable = incidents.filter((i) => isMailable(i, now));

  const inWindow = (i: Incident, from: number, to: number) =>
    i.timestamp >= from && i.timestamp < to;

  // ── 1. A resolved address: real distances, tightest ring with anything ────
  if (home) {
    const withDistance = (from: number, to: number): ScoredIncident[] => mailable
      .filter((i) => inWindow(i, from, to))
      .map((i) => ({ incident: i, distanceM: distanceMetres(home, { lat: i.lat, lng: i.lng }) }))
      .filter((x) => (x.distanceM ?? Infinity) <= rings[rings.length - 1].metres);

    const thisWeek = withDistance(since, now);
    const lastWeek = withDistance(previousSince, since);

    for (let i = 0; i < rings.length; i += 1) {
      const inRing = thisWeek.filter((x) => (x.distanceM ?? Infinity) <= rings[i].metres);
      if (inRing.length > 0 || i === rings.length - 1) {
        return finish({
          scope: 'home',
          areaName: savedArea || 'your area',
          ringLabel: rings[i].label,
          items: inRing,
          previousTotal: lastWeek.filter((x) => (x.distanceM ?? Infinity) <= rings[i].metres).length,
          needsLocation: false,
          widenedToCity: false,
          since, until: now,
        });
      }
    }
  }

  // ── 2. A neighbourhood name: match by name, no invented precision ─────────
  if (savedArea) {
    const named = (from: number, to: number): ScoredIncident[] => mailable
      .filter((i) => inWindow(i, from, to) && neighborhoodMatches(i.neighborhood, savedArea))
      .map((i) => ({ incident: i, distanceM: null }));

    const thisWeek = named(since, now);
    if (thisWeek.length > 0) {
      return finish({
        scope: 'community',
        areaName: savedArea,
        ringLabel: `in ${savedArea}`,
        items: thisWeek,
        previousTotal: named(previousSince, since).length,
        needsLocation: false,
        widenedToCity: false,
        since, until: now,
      });
    }
  }

  // ── 3. Everything else: the city ─────────────────────────────────────────
  //
  // Reached by three different people: somebody who never set a location,
  // somebody living outside the areas our reports cover, and somebody whose own
  // community genuinely had a quiet week. All three are better served by a real
  // digest of the city than by an empty page implying nothing happened. The
  // flags below let the email say which of the three it is.
  const cityWide = (from: number, to: number): ScoredIncident[] => mailable
    .filter((i) => inWindow(i, from, to))
    .map((i) => ({ incident: i, distanceM: null }));

  return finish({
    scope: 'city',
    areaName: savedArea || 'Calgary',
    ringLabel: 'across Calgary',
    items: cityWide(since, now),
    previousTotal: cityWide(previousSince, since).length,
    needsLocation: !savedArea && !home,
    widenedToCity: Boolean(savedArea || home),
    since, until: now,
  });
}

/**
 * Shared tail: ordering, category counts and the derived fields.
 *
 * Distance sorts ascending where we have it — the whole point of the rail is a
 * proximity ladder — and newest-first where we do not, because without a
 * distance the only ordering a reader can feel is recency.
 */
function finish(parts: {
  scope: DigestScope;
  areaName: string;
  ringLabel: string;
  items: ScoredIncident[];
  previousTotal: number;
  needsLocation: boolean;
  widenedToCity: boolean;
  since: number;
  until: number;
}): DigestSummary {
  const items = [...parts.items].sort((a, b) => {
    if (a.distanceM !== null && b.distanceM !== null && a.distanceM !== b.distanceM) {
      return a.distanceM - b.distanceM;
    }
    return b.incident.timestamp - a.incident.timestamp;
  });

  const counts = new Map<IncidentCategory, number>();
  for (const { incident } of items) {
    counts.set(incident.category, (counts.get(incident.category) ?? 0) + 1);
  }

  return {
    weekKey: digestWeekKey(parts.until),
    scope: parts.scope,
    needsLocation: parts.needsLocation,
    widenedToCity: parts.widenedToCity,
    since: parts.since,
    until: parts.until,
    ringLabel: parts.ringLabel,
    items,
    total: items.length,
    byCategory: DIGEST_CATEGORY_ORDER
      .filter((c) => (counts.get(c) ?? 0) > 0)
      .map((category) => ({
        category,
        label: DIGEST_CATEGORY_LABEL[category],
        count: counts.get(category) ?? 0,
        colour: DIGEST_CATEGORY_COLOUR[category],
      })),
    previousTotal: parts.previousTotal,
    delta: items.length - parts.previousTotal,
    highlights: items.slice(0, MAX_HIGHLIGHTS),
    quiet: items.length === 0,
    areaName: parts.areaName,
  };
}

/**
 * The one-line subject.
 *
 * Says the number and the place, because that is what makes an inbox row worth
 * opening. A quiet week is stated as a quiet week rather than dressed up — the
 * point of the digest is that it can be trusted when it does say something.
 */
export function digestSubject(summary: DigestSummary): string {
  if (summary.quiet) return `A quiet week in ${summary.areaName}`;
  const noun = summary.total === 1 ? 'report' : 'reports';
  return `${summary.total} ${noun} near you this week — ${summary.areaName}`;
}

/** "3 more than last week" / "same as last week", or null when there is no basis. */
export function deltaSentence(summary: DigestSummary): string | null {
  if (summary.previousTotal === 0 && summary.total === 0) return null;
  if (summary.delta === 0) return 'The same as last week.';
  const n = Math.abs(summary.delta);
  const noun = n === 1 ? 'report' : 'reports';
  return summary.delta > 0
    ? `${n} more ${noun} than last week.`
    : `${n} fewer ${noun} than last week.`;
}

// ── Unsubscribe ─────────────────────────────────────────────────────────────

/**
 * The link every email must carry.
 *
 * The token is a per-account secret stored on the profile, not a signature over
 * the uid: this is a static site with no server to hold a signing key, so the
 * check has to be something Firestore rules can perform by themselves. Rules
 * `get()` the profile and compare, which means a link works for exactly one
 * account and cannot be forged by editing the uid in the URL.
 */
export function unsubscribeUrl(origin: string, uid: string, token: string): string {
  const url = new URL('/unsubscribe', origin);
  url.searchParams.set('uid', uid);
  url.searchParams.set('t', token);
  return url.toString();
}

/** Tokens are compared for shape before use; anything else is a bug upstream. */
export function isValidUnsubToken(token: string | undefined | null): boolean {
  return typeof token === 'string' && /^[a-f0-9]{32}$/.test(token);
}
