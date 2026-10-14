/**
 * Business accounts: a CalgaryWatch account becomes a business account when an
 * admin approves a listing claim it made. Claiming already needs an account (a
 * Google sign-in with a verified email, enforced by firestore.rules), so the
 * claimant always has a `users/{uid}` profile to mark.
 *
 * The mark lives on that profile: `accountType: 'business'`, the listings it
 * manages (`businessListings`) and when it first became one (`businessSince`).
 * Only an admin can write these fields (firestore.rules); a member can't set
 * or remove them on their own profile.
 *
 * "Business account" is not "Featured partner", which stays the label for a
 * paid placement (docs/partner-outreach.md).
 *
 * Pure, so the rules are tested without Firestore.
 */

export const BUSINESS = 'business' as const;
export const BUSINESS_FIELDS = ['accountType', 'businessListings', 'businessSince'] as const;

export interface BusinessAccount { since: number; listings: string[] }

/** The business side of a profile, or null for a personal account. */
export function readBusinessAccount(data: Record<string, unknown> | undefined | null): BusinessAccount | null {
  if (!data || data.accountType !== BUSINESS) return null;
  const listings = Array.isArray(data.businessListings) ? data.businessListings.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  return { since: typeof data.businessSince === 'number' ? data.businessSince : 0, listings };
}

/**
 * The fields to write on the claimant's profile when their claim for
 * `entityId` is approved. Keeps an earlier `businessSince` and every listing
 * they already manage; approving the same claim twice changes nothing.
 */
export function businessAccountPatch(existing: Record<string, unknown> | undefined | null, entityId: string, now: number): { accountType: typeof BUSINESS; businessListings: string[]; businessSince: number } {
  const current = readBusinessAccount(existing);
  const listings = [...new Set([...(current?.listings ?? []), entityId].filter(Boolean))];
  return { accountType: BUSINESS, businessListings: listings, businessSince: current?.since || now };
}

/** Approved claims grouped by account: what every claimant's profile should say. */
export function businessAccountsFromClaims(claims: ReadonlyArray<{ uid: string; entityId: string; status: string; reviewedAt?: number | null }>): Map<string, { listings: string[]; since: number }> {
  const out = new Map<string, { listings: string[]; since: number }>();
  for (const c of claims) {
    if (c.status !== 'approved' || !c.uid || !c.entityId) continue;
    const at = typeof c.reviewedAt === 'number' ? c.reviewedAt : 0;
    const row = out.get(c.uid) ?? { listings: [], since: 0 };
    if (!row.listings.includes(c.entityId)) row.listings.push(c.entityId);
    if (at && (!row.since || at < row.since)) row.since = at;
    out.set(c.uid, row);
  }
  return out;
}
