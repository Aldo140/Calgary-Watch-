import { PICK_CHECKS, type BestCategory, type BestPlace, type CwPick, type PickCheck } from '../content/bestOf';

/**
 * CalgaryWatch Picks (docs/cw-picks.md): one vetted company per service list,
 * the A–Z list under it, and a follow-up loop that turns "who did you call?"
 * into reviews we collected ourselves.
 *
 * Three records, three privacy levels:
 *   1. pick_contact (product_events): a tap on Call or Website. Which list and
 *      which company, nothing about the reader. Always on; it's how we can tell
 *      a company "N Calgarians contacted you from CalgaryWatch this month".
 *   2. pick_followups: only when the reader ticks the box. Their email, the
 *      company, and a random key. Admin-only; deleted after the review or 60 days.
 *   3. pick_reviews: the reader's answer, keyed to the follow-up. Never public
 *      until a person at CalgaryWatch has read it (docs/cw-picks.md, moderation).
 */

export const PICK_FOLLOWUPS = 'pick_followups';
export const PICK_REVIEWS = 'pick_reviews';
/** Bump when the wording on the consent box changes; stored with every follow-up. */
export const CONSENT_VERSION = 'pick-v1';
export const FOLLOWUP_DAYS = 7;
const DAY = 86_400_000;

export const CONSENT_TEXT = 'Email me once in 7 days to ask how the job went. My answer helps neighbours and decides the CalgaryWatch Pick. One email, no list, and my address is deleted after.';

export type ContactVia = 'search' | 'best';
export type ContactKind = 'call' | 'site';

/** A short, stable id for a company inside a list, safe for analytics (no spaces, ≤32 chars). */
export function placeKey(place: Pick<BestPlace, 'name'>): string {
  return place.name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’']/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
}

const today = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Every check present with a real date on or before today. */
export function pickChecksComplete(pick: CwPick, now = Date.now()): boolean {
  return (Object.keys(PICK_CHECKS) as PickCheck[]).every(k => /^\d{4}-\d{2}-\d{2}$/.test(pick.checks[k] ?? '') && pick.checks[k] <= today(now));
}

/** The live Pick for a list: set, fully vetted, not lapsed, and naming a company on the list. */
export function activePick(c: BestCategory, now = Date.now()): { pick: CwPick; place: BestPlace } | null {
  if (c.kind !== 'service' || !c.pick) return null;
  const place = c.places.find(p => p.name === c.pick!.place);
  if (!place || c.pick.until < today(now) || !pickChecksComplete(c.pick, now)) return null;
  return { pick: c.pick, place };
}

export function telHref(phone: string): string {
  return `tel:+1${phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')}`;
}

// ─── Follow-ups ─────────────────────────────────────────────────────────────

/** Same pattern as isValidEmail in firestore.rules, so the rule never refuses what the form accepted. */
const EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function validEmail(email: string): boolean {
  return EMAIL.test(email.trim()) && email.trim().length <= 254;
}

export interface PickFollowup {
  list: string;
  place: string;
  /** The company's display name, for the email. */
  placeName: string;
  email: string;
  uid: string | null;
  consent: typeof CONSENT_VERSION;
  /** Unguessable; the review link carries it, and the rules check it. */
  key: string;
  via: ContactVia;
  contact: ContactKind;
  createdAt: number;
  dueAt: number;
  status: 'pending';
}

/** 24 url-safe random characters. */
export function newReviewKey(random: (n: number) => Uint8Array = n => crypto.getRandomValues(new Uint8Array(n))): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return [...random(24)].map(b => abc[b & 63]).join('');
}

export function buildFollowup(input: { list: string; place: BestPlace; email: string; uid?: string | null; via: ContactVia; contact: ContactKind; now?: number; key?: string }): PickFollowup | null {
  const email = input.email.trim().toLowerCase();
  if (!validEmail(email)) return null;
  const now = input.now ?? Date.now();
  return {
    list: input.list.slice(0, 40), place: placeKey(input.place), placeName: input.place.name.slice(0, 80), email,
    uid: input.uid ?? null, consent: CONSENT_VERSION, key: input.key ?? newReviewKey(), via: input.via, contact: input.contact,
    createdAt: now, dueAt: now + FOLLOWUP_DAYS * DAY, status: 'pending',
  };
}

/** Records the tap (anonymous) and, with consent, the follow-up. Never throws into the UI. */
export async function recordPickContact(input: { list: string; place: BestPlace; via: ContactVia; contact: ContactKind; followupEmail?: string }): Promise<'saved' | 'tap-only' | 'invalid'> {
  const { logProductEvent } = await import('./productEvents');
  logProductEvent('pick_contact', { list: input.list, place: placeKey(input.place), via: input.via, contact: input.contact, followup: input.followupEmail ? 'yes' : 'no' });
  if (!input.followupEmail) return 'tap-only';
  try {
    const [{ auth, db }, { doc, setDoc, collection }] = await Promise.all([import('../firebase'), import('firebase/firestore')]);
    const f = buildFollowup({ list: input.list, place: input.place, email: input.followupEmail, uid: auth?.currentUser?.uid ?? null, via: input.via, contact: input.contact });
    if (!f) return 'invalid';
    if (!db) return 'tap-only';
    await setDoc(doc(collection(db, PICK_FOLLOWUPS)), f);
    return 'saved';
  } catch {
    return 'tap-only';
  }
}

// ─── Reviews ────────────────────────────────────────────────────────────────

export type Hired = 'yes' | 'no' | 'not-yet';

export interface PickReview {
  followup: string;
  key: string;
  list: string;
  place: string;
  hired: Hired;
  /** 1–5 when hired. */
  stars: number | null;
  /** Would you hire them again? */
  again: boolean | null;
  /** Arrived when they said, price matched the quote. */
  onTime: boolean | null;
  onPrice: boolean | null;
  text: string;
  createdAt: number;
  status: 'new';
}

export const REVIEW_TEXT_MAX = 600;

/** The link in the email. List and company ride along so the page can name them; the rules check all four against the follow-up. */
export function reviewPath(followupId: string, key: string, list: string, place: string): string {
  const q = new URLSearchParams({ f: followupId, k: key, l: list, p: place });
  return `/review?${q.toString()}`;
}

/** The company a review link names, if it's still on that list. */
export function placeFromLink(list: string, place: string, categories: readonly BestCategory[]): { c: BestCategory; place: BestPlace } | null {
  const c = categories.find(x => x.slug === list);
  const p = c?.places.find(x => placeKey(x) === place);
  return c && p ? { c, place: p } : null;
}

/** The reader's answers as a document the rules accept, or a reason it isn't one. */
export function buildReview(input: Omit<PickReview, 'createdAt' | 'status' | 'text'> & { text: string; now?: number }): PickReview | string {
  if (!/^[A-Za-z0-9]{10,40}$/.test(input.followup) || !/^[A-Za-z0-9_-]{24}$/.test(input.key)) return 'This link is incomplete. Open it again from the email.';
  if (input.hired === 'yes' && (input.stars === null || input.stars < 1 || input.stars > 5)) return 'Pick a star rating.';
  const text = input.text.replace(/\s+/g, ' ').trim().slice(0, REVIEW_TEXT_MAX);
  // Reviews are about the work. Contact details and links stay out.
  if (/@|https?:|www\.|\d{3}[\s.-]?\d{3}[\s.-]?\d{4}/i.test(text)) return 'Leave out emails, phone numbers and links.';
  const hired = input.hired === 'yes';
  return {
    followup: input.followup, key: input.key, list: input.list.slice(0, 40), place: input.place.slice(0, 32), hired: input.hired,
    stars: hired ? input.stars : null, again: hired ? input.again : null, onTime: hired ? input.onTime : null, onPrice: hired ? input.onPrice : null,
    text, createdAt: input.now ?? Date.now(), status: 'new',
  };
}

// ─── The email ──────────────────────────────────────────────────────────────

export interface FollowupEmail { to: string; subject: string; text: string; html: string }

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** The one email a follow-up sends. Plain, short, one question. */
export function followupEmail(f: Pick<PickFollowup, 'email' | 'placeName' | 'list' | 'place'>, followupId: string, key: string, opts: { origin?: string; listLabel?: string; mailingAddress?: string } = {}): FollowupEmail {
  const origin = opts.origin ?? 'https://calgarywatch.ca';
  const link = `${origin}${reviewPath(followupId, key, f.list, f.place)}`;
  const what = opts.listLabel ? opts.listLabel.toLowerCase() : 'a local company';
  const subject = `How did ${f.placeName} do?`;
  const lines = [
    'Hi,',
    '',
    `A week ago you contacted ${f.placeName} from CalgaryWatch’s list of ${what}, and asked us to check in.`,
    '',
    'Did you hire them, and how did it go? It takes 30 seconds:',
    link,
    '',
    'Your answer goes to us first. We read every one, and they decide which company earns the CalgaryWatch Pick. We never publish your name or email.',
    '',
    'This is the only email you’ll get about it. We delete your address once you answer, or in 60 days.',
    '',
    'Thanks for helping neighbours find good people,',
    'CalgaryWatch',
    ...(opts.mailingAddress ? ['', opts.mailingAddress] : []),
  ];
  const html = `<div style="font:16px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#10213a;max-width:560px">
<p>Hi,</p>
<p>A week ago you contacted <b>${esc(f.placeName)}</b> from CalgaryWatch’s list of ${esc(what)}, and asked us to check in.</p>
<p><b>Did you hire them, and how did it go?</b> It takes 30 seconds.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#0d2a4f;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">Tell us how it went</a></p>
<p style="color:#4a5b72;font-size:14px">Your answer goes to us first. We read every one, and they decide which company earns the CalgaryWatch Pick. We never publish your name or email. This is the only email you’ll get about it, and we delete your address once you answer, or in 60 days.</p>
<p>Thanks for helping neighbours find good people,<br>CalgaryWatch</p>
${opts.mailingAddress ? `<p style="color:#8090a5;font-size:12px">${esc(opts.mailingAddress)}</p>` : ''}
</div>`;
  return { to: f.email, subject, text: lines.join('\n'), html };
}
