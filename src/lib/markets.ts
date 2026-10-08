/**
 * Market HQ: vendor rosters, weekly lineups, vendor applications and vendor
 * messages for market organizers.
 *
 * Two ways to run it, same tools: a market's verified organizer (an approved
 * listing claim) runs it themselves, or CalgaryWatch runs it for them (admin
 * can do everything an organizer can). The admin work feeds the public side:
 * a published lineup shows on the listing and in event picks, so organizers
 * get less admin and more foot traffic from the same work.
 *
 * Privacy split: the vendor roster and lineups are public (they are what
 * shoppers see); vendor contact details live in a separate organizer-only
 * collection and never reach a public page.
 *
 * Pure, so the rules are tested without Firestore.
 */

export const VENDORS = 'market_vendors';
export const VENDOR_CONTACTS = 'market_vendor_contacts';
export const LINEUPS = 'market_lineups';
export const APPLICATIONS = 'vendor_applications';
export const MESSAGES = 'vendor_messages';
export const SERVICE = 'market_service_requests';

export const VENDOR_CATEGORIES = ['Produce', 'Baked goods', 'Meat and fish', 'Dairy and eggs', 'Prepared food', 'Drinks', 'Crafts and makers', 'Flowers and plants', 'Health and beauty', 'Services', 'Other'] as const;
export type VendorCategory = typeof VENDOR_CATEGORIES[number];

export interface Vendor {
  marketId: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  website: string;
  instagram: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface VendorContact {
  marketId: string;
  vendorSlug: string;
  contactName: string;
  email: string;
  phone: string;
  /** Asked not to get messages (replied STOP to the organizer). */
  optedOut: boolean;
  updatedAt: number;
}

export interface Lineup {
  marketId: string;
  occurrenceId: string;
  /** ISO start of the market date, for ordering and for the email senders. */
  start: string;
  vendorSlugs: string[];
  /** "This week at the market": what's in season, specials, music. */
  note: string;
  published: boolean;
  updatedAt: number;
}

export interface VendorApplication {
  uid: string;
  marketId: string;
  marketTitle: string;
  businessName: string;
  category: string;
  description: string;
  website: string;
  instagram: string;
  contactName: string;
  email: string;
  phone: string;
  /** Free text: which dates, how often, stall needs. */
  availability: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: number;
}

export type MessageAudience = 'all' | 'date';

export interface VendorMessage {
  marketId: string;
  marketTitle: string;
  audience: MessageAudience;
  /** For audience 'date': the lineup's occurrence. */
  occurrenceId: string;
  subject: string;
  body: string;
  replyTo: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  createdBy: string;
  createdAt: number;
  sentCount?: number;
  sentAt?: number;
  error?: string;
}

export function vendorSlug(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'vendor';
}

export function vendorId(marketId: string, slug: string): string {
  return `${marketId}__${slug}`;
}

/** Recipients for a message: active vendors with an email who haven't opted out, deduped. */
export function messageRecipients(
  msg: Pick<VendorMessage, 'audience' | 'occurrenceId'>,
  vendors: ReadonlyArray<Pick<Vendor, 'slug' | 'active'>>,
  contacts: ReadonlyArray<Pick<VendorContact, 'vendorSlug' | 'email' | 'optedOut'>>,
  lineups: ReadonlyArray<Pick<Lineup, 'occurrenceId' | 'vendorSlugs'>>,
): string[] {
  const active = new Set(vendors.filter((v) => v.active).map((v) => v.slug));
  const scope = msg.audience === 'date'
    ? new Set(lineups.find((l) => l.occurrenceId === msg.occurrenceId)?.vendorSlugs ?? [])
    : active;
  const out = new Set<string>();
  for (const c of contacts) {
    const email = c.email.trim().toLowerCase();
    if (!c.optedOut && active.has(c.vendorSlug) && scope.has(c.vendorSlug) && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) out.add(email);
  }
  return [...out].sort();
}

export interface ApplicationDraft {
  businessName: string; category: string; description: string; website: string; instagram: string;
  contactName: string; email: string; phone: string; availability: string; agree: boolean;
}

export function applicationProblem(d: ApplicationDraft): string {
  if (d.businessName.trim().length < 2) return 'Add your business name.';
  if (!d.category) return 'Choose what you sell.';
  if (d.description.trim().length < 10) return 'Tell the organizer a little about what you sell.';
  if (d.contactName.trim().length < 2) return 'Add a contact name.';
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(d.email.trim())) return 'Add an email the organizer can reach you at.';
  if (!d.agree) return 'Confirm the organizer may contact you about this market.';
  return '';
}

/** Shopper-facing summary of a lineup: "14 vendors, including A, B and C". */
export function lineupSummary(names: readonly string[], max = 3): string {
  if (!names.length) return '';
  const shown = names.slice(0, max);
  const list = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
  return names.length > max ? `${names.length} vendors, including ${list}` : `${names.length} vendor${names.length === 1 ? '' : 's'}: ${list}`;
}

/** The plain-text footer every vendor message carries (CASL: who, where, how to stop). */
export function vendorMessageFooter(marketTitle: string, replyTo: string, mailingAddress: string): string {
  return [
    '--',
    `You're getting this because you're a vendor at ${marketTitle}. Sent by the organizer through CalgaryWatch.`,
    `To stop these messages, reply STOP to ${replyTo}.`,
    `CalgaryWatch · ${mailingAddress}`,
  ].join('\n');
}
