/**
 * Verified listings: what "verified" means on CalgaryWatch, and the one place
 * its ranking weight is set. Full write-up: docs/verified-listings.md.
 *
 * A listing is verified when, and only when, an admin approved a listing claim
 * for it (`listing_claims/{uid}_{entityId}` with status "approved"). Approval
 * also writes the public `verified_listings/{entityId}` mark the badge reads at
 * runtime. Opening the claim page, signing in, submitting or re-submitting a
 * claim, or being contacted by outreach never counts; a pending or rejected
 * claim never counts; a `verified_listings` doc without an approved claim
 * behind it never counts.
 *
 * The build (scripts/discovery/export.ts) stamps `ownerVerifiedAt` on each
 * verified entity from those two collections. Anything a feed or an entity
 * document says about itself is stripped first, so a listing cannot mark
 * itself verified.
 *
 * Not to be confused with `verification` / `verifiedAt` on EntityBase, which
 * record CalgaryWatch's own source check of a listing.
 *
 * Pure, so the rules are tested without Firestore.
 */

export interface ClaimRecord { entityId: string; status: string; reviewedAt?: number | null }
export interface VerifiedMarkRecord { entityId: string; verifiedAt?: number | null }

/**
 * entityId → when it was verified (ISO), for every listing with an approved
 * claim. The time is the public mark's `verifiedAt`, else the earliest approval.
 */
export function ownerVerification(claims: readonly ClaimRecord[], marks: readonly VerifiedMarkRecord[] = []): Map<string, string> {
  const approvedAt = new Map<string, number>();
  for (const c of claims) {
    if (c.status !== 'approved' || !c.entityId) continue;
    const at = typeof c.reviewedAt === 'number' && Number.isFinite(c.reviewedAt) ? c.reviewedAt : 0;
    const prev = approvedAt.get(c.entityId);
    if (prev === undefined || (at && (!prev || at < prev))) approvedAt.set(c.entityId, at);
  }
  const markAt = new Map(marks.filter(m => typeof m.verifiedAt === 'number').map(m => [m.entityId, m.verifiedAt as number]));
  const out = new Map<string, string>();
  for (const [id, at] of approvedAt) {
    const when = markAt.get(id) || at;
    out.set(id, when ? new Date(when).toISOString() : '1970-01-01T00:00:00.000Z');
  }
  return out;
}

type Stampable = { id: string; kind?: string; ownerVerifiedAt?: unknown; claimed?: unknown };

/**
 * Entities with `ownerVerifiedAt` set from approved claims only. Any value the
 * input already carried is dropped, and a business's `claimed` flag follows.
 */
export function applyOwnerVerification<T extends Stampable>(entities: readonly T[], verified: ReadonlyMap<string, string>): T[] {
  return entities.map(e => {
    const { ownerVerifiedAt: _ignored, ...rest } = e;
    const at = verified.get(e.id);
    const out = (at ? { ...rest, ownerVerifiedAt: at } : rest) as T;
    if (e.kind === 'business') (out as Stampable).claimed = Boolean(at);
    return out;
  });
}

type Verifiable = { ownerVerifiedAt?: string; status?: string; kind?: string; cancelled?: boolean; end?: string };

export function isOwnerVerified(e: Pick<Verifiable, 'ownerVerifiedAt'>): boolean {
  return typeof e.ownerVerifiedAt === 'string' && e.ownerVerifiedAt.length > 0;
}

/**
 * Whether verification may lift this listing right now: verified, published,
 * and for an event not cancelled or over. A verified organizer's past or
 * cancelled event gets nothing.
 */
export function verificationCounts(e: Verifiable, now = Date.now()): boolean {
  if (!isOwnerVerified(e)) return false;
  if (e.status && e.status !== 'published') return false;
  if (e.cancelled) return false;
  if (e.kind === 'event' && e.end && Number.isFinite(Date.parse(e.end)) && Date.parse(e.end) <= now) return false;
  return true;
}

/**
 * How much verification adds on each scored surface. Each is calibrated to
 * break close ties and lift a listing a notch, never to beat a clearly more
 * relevant result:
 *
 *  - interest (eventRank.interestScore: homepage day list, events board, week
 *    agenda): +2, the same as an editor's source check. A marquee venue (+3),
 *    a big-draw format (+3) or a pro team (+4 to +6) still outranks it, and a
 *    campus-only listing (−10) stays buried.
 *  - search (listingSearch.searchListings): +2. A title match is worth 10 and
 *    a tag match 5, so a verified listing that only matches in its summary (2)
 *    cannot pass an unverified listing matching in its title or tags.
 *  - picks (eventPicks.buildEventPicks): +0.5. One shared interest is worth 3
 *    and the home neighbourhood 3, so it only orders otherwise equal picks.
 *
 * Local (/local and its category pages) and neighbourhood place lists have no
 * score; there verification is a tiebreaker after paid and editorial order and
 * before name or distance (`byVerified`).
 */
export const VERIFIED_WEIGHT = { interest: 2, search: 2, picks: 0.5 } as const;
export type VerifiedSurface = keyof typeof VERIFIED_WEIGHT;

export function verifiedBoost(e: Verifiable, surface: VerifiedSurface, now = Date.now()): number {
  return verificationCounts(e, now) ? VERIFIED_WEIGHT[surface] : 0;
}

/** Sort comparator: verified first, otherwise equal. */
export function byVerified(a: Verifiable, b: Verifiable, now = Date.now()): number {
  return Number(verificationCounts(b, now)) - Number(verificationCounts(a, now));
}

/**
 * True only while verification actually carries ranking weight. Outreach may
 * tell organizations that verified listings get more priority only while this
 * holds (scripts/ops/lib/claimFacts.ts).
 */
export const VERIFICATION_PRIORITY_ENABLED = Object.values(VERIFIED_WEIGHT).every(w => w > 0);
