import { BEST_CATEGORIES, type BestPlace } from '../content/bestOf';
import { sourceOf } from './bestOf';
import { PICK_CHECKS, PICKS, type CwPick, type PickCheck } from '../content/cwPicks';
import { DESK_COMPANIES } from '../content/pickDesks';
import { LOCAL_SERVICES, offersService, serviceById, type LocalService } from '../data/localServices';
import type { DiscoveryEntity } from '../types/discovery';

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

export type ContactVia = 'search' | 'best' | 'desk';
export type ContactKind = 'call' | 'site';

/** A short, stable id for a company inside a list, safe for analytics (no spaces, ≤32 chars). */
export function placeKey(place: { name: string }): string {
  return place.name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’']/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
}

const today = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Every check present with a real date on or before today. */
export function pickChecksComplete(pick: CwPick, now = Date.now()): boolean {
  return (Object.keys(PICK_CHECKS) as PickCheck[]).every(k => /^\d{4}-\d{2}-\d{2}$/.test(pick.checks[k] ?? '') && pick.checks[k] <= today(now));
}

// ─── Shelves ────────────────────────────────────────────────────────────────

/** A company on a service's shelf: from a cited Best of Calgary list or a Local profile. */
export interface Contender {
  key: string;
  name: string;
  website?: string;
  phone?: string;
  /** One line about them, with where it came from. */
  fact?: { text: string; source: string; label: string };
  /** Their CalgaryWatch profile, when they have one. */
  path?: string;
  area?: string;
  verified?: boolean;
  /** Every other published fact, for proof chips. */
  facts?: string[];
}

/** Everything the Pick desk for one service shows. */
export interface Shelf {
  service: LocalService;
  contenders: Contender[];
  /** The Best of Calgary list behind it, for "sources and tips". */
  bestSlug?: string;
  live: { pick: CwPick; contender: Contender } | null;
}

const collator = new Intl.Collator('en-CA', { sensitivity: 'base', ignorePunctuation: true });
const sortName = (n: string) => n.replace(/^the\s+/i, '');

function fromBest(p: BestPlace, sourceLabel: (id: string) => { url: string; label: string } | undefined): Contender {
  const f = p.facts[0];
  const src = f ? (f.self ? { url: f.source, label: 'their site' } : sourceLabel(f.source)) : undefined;
  return { key: placeKey(p), name: p.name, website: p.website, phone: p.phone, area: p.area, verified: p.verified, facts: p.facts.slice(1).map(x => x.text),
    ...(f && src ? { fact: { text: f.text, source: src.url, label: src.label } } : {}) };
}

const citedSource = (id: string) => { const s = sourceOf(id); return s ? { url: s.url, label: s.publisher } : undefined; };

/**
 * One service's shelf: its cited Best list plus the Local profiles that offer
 * it, A–Z, one row per company. Only companies with a way to reach them.
 */
export function shelfFor(serviceId: string, entities: readonly DiscoveryEntity[] = [], now = Date.now(), sourceLabel: (id: string) => { url: string; label: string } | undefined = citedSource): Shelf | null {
  const service = serviceById(serviceId);
  if (!service) return null;
  const best = service.best ? BEST_CATEGORIES.find(c => c.slug === service.best) : undefined;
  const out = new Map<string, Contender>();
  for (const p of best?.places ?? []) out.set(placeKey(p), fromBest(p, sourceLabel));
  for (const p of DESK_COMPANIES[service.id]?.places ?? []) if (!out.has(placeKey(p))) out.set(placeKey(p), fromBest(p, sourceLabel));
  for (const e of entities) {
    if (e.kind !== 'business' || e.developmentOnly || !offersService(e, service)) continue;
    const key = placeKey({ name: e.title });
    const prev = out.get(key);
    const path = `/local/${e.slug}`;
    if (prev) { prev.path = path; continue; }
    if (!e.website && !e.phone) continue;
    out.set(key, { key, name: e.title, website: e.website, phone: e.phone, area: e.neighbourhood, path,
      ...(e.summary ? { fact: { text: e.summary, source: path, label: 'profile' } } : {}) });
  }
  const contenders = [...out.values()].sort((a, b) => Number(!!b.verified) - Number(!!a.verified) || collator.compare(sortName(a.name), sortName(b.name)));
  const pick = PICKS[service.id];
  const contender = pick ? contenders.find(c => c.name === pick.place) : undefined;
  const live = pick && contender && pick.until >= today(now) && pickChecksComplete(pick, now) ? { pick, contender } : null;
  return { service, contenders, ...(best ? { bestSlug: best.slug } : {}), live };
}

/** Every service, in Local's order, for the /picks hub. */
export function allShelves(entities: readonly DiscoveryEntity[] = [], now = Date.now()): Shelf[] {
  return LOCAL_SERVICES.map(s => shelfFor(s.id, entities, now)!).filter(Boolean);
}

/** The service a search names: "plumber", "snow removal", "window cleaners", "best electrician". */
export function serviceForQuery(q: string): LocalService | undefined {
  const norm = (t: string) => t.normalize('NFKD').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').filter(w => w && !['best', 'top', 'good', 'calgary', 'yyc', 'in', 'near', 'me', 'a', 'the', 'company', 'companies', 'service', 'services', 'emergency', 'local', 'cheap', 'affordable'].includes(w))
    .map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).join(' ');
  const key = norm(q);
  if (!key) return undefined;
  const best = BEST_CATEGORIES.find(c => c.kind === 'service' && c.keywords.some(k => norm(k) === key));
  if (best) return LOCAL_SERVICES.find(s => s.best === best.slug);
  return LOCAL_SERVICES.find(s => [s.label, ...s.trades, ...s.match].some(m => norm(m) === key));
}

export const pickDeskPath = (serviceId: string) => `/picks/${serviceId}`;

/** Questions that fit any hire, for services without their own. Plain advice, never about one business. */
export const GENERIC_ASK = [
  'Can I have the quote in writing, and what would change it?',
  'Are you insured, and can you send the certificate?',
  'Who does the work: you, a crew, or a subcontractor?',
];

/** Three questions worth asking on the phone for this service. */
export const askFor = (service: LocalService): string[] => service.ask?.length ? service.ask : GENERIC_ASK;

export function telHref(phone: string): string {
  return `tel:+1${phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')}`;
}

// ─── This device's memory ───────────────────────────────────────────────────

/** A contact remembered on this device only, so a desk can say "you called them Tuesday". Never sent anywhere. */
export interface RecentContact { list: string; key: string; name: string; contact: ContactKind; at: number; checkIn: boolean }
const RECENT_KEY = 'cw-pick-recent';
const RECENT_DAYS = 30;

export function recentContacts(list?: string, now = Date.now()): RecentContact[] {
  try {
    const all = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentContact[];
    return all.filter(r => r && typeof r.at === 'number' && now - r.at < RECENT_DAYS * DAY && (!list || r.list === list)).sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export function rememberContact(r: RecentContact): void {
  try {
    const rest = recentContacts(undefined, r.at).filter(x => !(x.list === r.list && x.key === r.key));
    localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...rest].slice(0, 12)));
  } catch { /* private mode: the desk just won't remember */ }
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

export function buildFollowup(input: { list: string; place: { name: string }; email: string; uid?: string | null; via: ContactVia; contact: ContactKind; now?: number; key?: string }): PickFollowup | null {
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
export async function recordPickContact(input: { list: string; place: { name: string }; via: ContactVia; contact: ContactKind; followupEmail?: string }): Promise<'saved' | 'tap-only' | 'invalid'> {
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

/** The company a review link names, if it's still on that service's shelf. */
export function placeFromLink(list: string, place: string, entities: readonly DiscoveryEntity[] = []): { shelf: Shelf; contender: Contender } | null {
  const shelf = shelfFor(list, entities);
  const contender = shelf?.contenders.find(c => c.key === place);
  return shelf && contender ? { shelf, contender } : null;
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

// ─── Concierge ──────────────────────────────────────────────────────────────

/** What the reader is dealing with, from the desk's "What's going on?" choice. */
export type Need = 'urgent' | 'quote' | 'routine';

export interface Proof { id: 'always-on' | 'since' | 'licensed' | 'upfront' | 'award' | 'verified'; label: string }

/**
 * Short proof chips for a card, read from the company's own published facts
 * (and awards we cite). Words like "Says" stay in the fact; a chip only names
 * what the text claims, so it never says more than the source.
 */
export function proofsFor(c: Pick<Contender, 'fact' | 'verified'> & { facts?: string[] }): Proof[] {
  const text = [c.fact?.text ?? '', ...(c.facts ?? [])].join(' ');
  const out: Proof[] = [];
  if (/24\/7|24 hours|around the clock|emergency line/i.test(text)) out.push({ id: 'always-on', label: 'Says 24/7' });
  const since = text.match(/since (\d{4})/i);
  if (since) out.push({ id: 'since', label: `Since ${since[1]}` });
  if (/licensed/i.test(text)) out.push({ id: 'licensed', label: 'Says licensed' });
  if (/upfront|flat-rate|flat rate/i.test(text)) out.push({ id: 'upfront', label: 'Upfront pricing' });
  if (/award/i.test(text)) out.push({ id: 'award', label: 'Award named' });
  if (c.verified) out.push({ id: 'verified', label: 'Verified on CalgaryWatch' });
  return out;
}

/** Calgary's hour (0–23) right now. */
export const calgaryHour = (now = Date.now()) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', hourCycle: 'h23' }).format(now));
/** Most offices are closed: before 8 am, after 6 pm. */
export const afterHours = (now = Date.now()) => { const h = calgaryHour(now); return h < 8 || h >= 18; };

/**
 * The shelf in the order that fits the need. Urgent: companies that say they
 * answer around the clock, with a phone, first. Quote: those publishing
 * upfront pricing first. Routine: A–Z as listed. Stable otherwise.
 */
export function orderFor(contenders: readonly Contender[], need: Need | null): Contender[] {
  if (!need || need === 'routine') return [...contenders];
  const score = (c: Contender) => {
    const p = new Set(proofsFor(c).map(x => x.id));
    return need === 'urgent' ? (p.has('always-on') ? 2 : 0) + (c.phone ? 1 : 0) : (p.has('upfront') ? 2 : 0) + (c.website ? 1 : 0);
  };
  return contenders.map((c, i) => ({ c, i, s: score(c) })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.c);
}
