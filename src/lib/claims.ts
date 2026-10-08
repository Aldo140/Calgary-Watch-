/**
 * Claiming a listing: an organizer registers, proves they're with the
 * organization, and from then on keeps their own listing right.
 *
 * Why it exists: partner replies kept asking for the same things — a direct
 * line to update listings, a form to send dates and production photos, a
 * corrected address, a second location, a better link. A claim turns each of
 * those emails into a self-serve request with a verified sender.
 *
 * How trust works, without a server: the claim is a Firestore document the
 * claimant writes about themselves. The evidence below is computed again by
 * admin when reviewing, never trusted from the document. The strongest case
 * is a Google account at the organization's own domain (Google already
 * verified that address); a typed work email at the same domain is good but
 * unproven; a free-mail address needs a person to check.
 *
 * Pure, so the rules are tested without Firestore.
 */

export const CLAIMS = 'listing_claims';
export const UPDATES = 'listing_updates';
export const VERIFIED = 'verified_listings';

export type ClaimStatus = 'pending' | 'approved' | 'rejected';
export type ClaimEvidence = 'account-domain' | 'work-domain' | 'free-mail' | 'other-domain' | 'no-source';

export const CLAIM_ROLES = ['Owner', 'Staff', 'Marketing or communications', 'Volunteer organizer', 'Agency acting for them'] as const;

export interface ListingClaim {
  uid: string;
  entityId: string;
  entityTitle: string;
  entityPath: string;
  name: string;
  role: string;
  workEmail: string;
  accountEmail: string;
  phone: string;
  note: string;
  status: ClaimStatus;
  createdAt: number;
  reviewedAt?: number | null;
  reviewNote?: string;
}

export type UpdateField = 'link' | 'dates' | 'location' | 'photo' | 'description' | 'cancel' | 'other';

export const UPDATE_FIELDS: ReadonlyArray<{ id: UpdateField; label: string; hint: string }> = [
  { id: 'dates', label: 'Dates or hours', hint: 'New run dates, a schedule change, holiday hours.' },
  { id: 'location', label: 'Address or another location', hint: 'A corrected address, or a second branch.' },
  { id: 'link', label: 'The link we send people to', hint: 'Your homepage, tickets or a season page.' },
  { id: 'photo', label: 'A photo you’d like us to use', hint: 'A link to an image you own or have the rights to.' },
  { id: 'description', label: 'How it’s described', hint: 'Facts we got wrong or left out.' },
  { id: 'cancel', label: 'Cancelled or postponed', hint: 'We mark it right away so nobody shows up.' },
  { id: 'other', label: 'Something else', hint: 'Anything else that should change.' },
];

export interface ListingUpdate {
  uid: string;
  entityId: string;
  entityTitle: string;
  field: UpdateField;
  details: string;
  url: string;
  status: 'pending' | 'applied' | 'declined';
  createdAt: number;
}

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.ca',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'shaw.ca', 'telus.net', 'gmx.com',
]);

export function claimId(uid: string, entityId: string): string {
  return `${uid}_${entityId}`;
}

export function emailDomain(email: string | null | undefined): string {
  const m = (email ?? '').trim().toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/);
  return m ? m[1] : '';
}

/** Registrable-ish host: drops www./tickets./purchase. so subdomains match the org's mail domain. */
export function siteDomain(url: string | null | undefined): string {
  try {
    const host = new URL(url ?? '').hostname.toLowerCase().replace(/^www\./, '');
    const parts = host.split('.');
    // Keep two labels, or three for .co.uk-style and .ab.ca-style suffixes.
    const keep = parts.length > 2 && parts[parts.length - 2].length <= 3 && parts[parts.length - 1].length === 2 ? 3 : 2;
    return parts.slice(-keep).join('.');
  } catch {
    return '';
  }
}

export function sourceDomains(sources: ReadonlyArray<{ url: string }>): string[] {
  return [...new Set(sources.map((s) => siteDomain(s.url)).filter((d) => d && !FREE_MAIL.has(d)))];
}

const matches = (domain: string, sites: string[]) => !!domain && sites.some((s) => domain === s || domain.endsWith(`.${s}`));

/**
 * How sure we can be that this person is with the organization, strongest
 * first. Admin sees this beside every claim; it is recomputed there, never
 * read from what the claimant wrote.
 */
export function claimEvidence(input: { accountEmail: string; workEmail: string; sources: ReadonlyArray<{ url: string }> }): ClaimEvidence {
  const sites = sourceDomains(input.sources);
  if (!sites.length) return 'no-source';
  if (matches(emailDomain(input.accountEmail), sites)) return 'account-domain';
  if (matches(emailDomain(input.workEmail), sites)) return 'work-domain';
  const work = emailDomain(input.workEmail);
  return !work || FREE_MAIL.has(work) ? 'free-mail' : 'other-domain';
}

export const EVIDENCE_COPY: Record<ClaimEvidence, { label: string; tone: 'ok' | 'signal' | 'attention' | 'critical'; next: string }> = {
  'account-domain': { label: 'Signed in at the organization’s domain', tone: 'ok', next: 'Strongest proof. Approve unless something looks off.' },
  'work-domain': { label: 'Work email at the organization’s domain', tone: 'signal', next: 'Reply to the work email to confirm before approving.' },
  'other-domain': { label: 'Email at a different domain', tone: 'attention', next: 'Could be an agency. Confirm with the organization’s published address.' },
  'free-mail': { label: 'Personal email only', tone: 'attention', next: 'Confirm through the address on the organization’s own website.' },
  'no-source': { label: 'Listing has no official site to compare', tone: 'attention', next: 'Check by phone or the organization’s social accounts.' },
};

export interface ClaimDraft { name: string; role: string; workEmail: string; phone: string; note: string; agree: boolean }

/** First problem with a claim form, or '' when it can be sent. */
export function claimProblem(d: ClaimDraft): string {
  if (d.name.trim().length < 2) return 'Add your name.';
  if (!d.role) return 'Choose your role.';
  if (!emailDomain(d.workEmail)) return 'Add the email you use for this organization.';
  if (!d.agree) return 'Confirm you’re allowed to manage this listing.';
  return '';
}

/** What the claimant is told while they wait, by evidence. */
export function claimTimeline(evidence: ClaimEvidence): string {
  return evidence === 'account-domain'
    ? 'You’re signed in with your organization’s email, so this is usually approved the same day.'
    : evidence === 'work-domain'
      ? 'We’ll send a quick confirmation to your work email, then approve. Usually within a day.'
      : 'We’ll confirm through the contact details on your own website, usually within two business days.';
}
