/**
 * Plain-language layer for the owner editor. Business owners never see field
 * keys, JSON or validation jargon: every field gets a friendly label, a hint,
 * a readable value for the review screen and a kind error message.
 */
import { ownerEditPatch, ownerEditableFields } from './ownerListingEdits';
import type { DiscoveryEntity } from '../types/discovery';

export type FieldCopy = { label: string; hint?: string; placeholder?: string };

export const FIELD_COPY: Record<string, FieldCopy> = {
  title: { label: 'Business name', hint: 'As it appears on your sign.' },
  summary: {
    label: 'One-line intro',
    hint: 'Shows under your name in search and on cards. One friendly sentence works best.',
    placeholder: 'Natural food and treats for cats and dogs, with free parking.',
  },
  description: {
    label: 'About your business',
    hint: 'A few sentences in your own words: what you sell, who it’s for and what makes you different.',
  },
  services: {
    label: 'What you offer',
    hint: 'Separate with commas.',
    placeholder: 'Natural dog food, Raw diets, Treats',
  },
  phone: { label: 'Phone number', hint: 'People on phones can tap it to call you.', placeholder: '403-555-0123' },
  email: { label: 'Email', hint: 'Where customers can write to you.', placeholder: 'hello@yourshop.ca' },
  website: { label: 'Website', hint: 'Paste your homepage. We’ll add https:// if it’s missing.', placeholder: 'yourshop.ca' },
  address: { label: 'Street address', hint: 'So people can find you on the map.', placeholder: '123 4 St SW, Calgary, AB' },
  hours: { label: 'Opening hours', hint: 'People check this before they head over. Leave a day blank if you’re not sure.' },
  socials: { label: 'Social links', hint: 'Paste a link or just type your @handle.' },
  offer: {
    label: 'Special offer',
    hint: 'Optional. Shows as a highlight on your page.',
    placeholder: '10% off everything on the first Tuesday of every month',
  },
  venue: { label: 'Venue name' },
  neighbourhood: { label: 'Neighbourhood', placeholder: 'Mission' },
  categories: { label: 'Categories', hint: 'Separate with commas.' },
  tags: { label: 'Search words', hint: 'Words people might search for. Separate with commas.', placeholder: 'pet store, dog food' },
  priceLevel: { label: 'Price level', hint: '1 is budget, 4 is premium.' },
  coordinates: { label: 'Map pin', hint: 'Only change this if your map pin is in the wrong place.' },
  start: { label: 'Starts' },
  end: { label: 'Ends' },
  pricing: { label: 'Price' },
  priceRange: { label: 'Ticket prices' },
  tickets: { label: 'Ticket link', placeholder: 'https://' },
  cancelled: { label: 'Cancelled' },
  organizer: { label: 'Organizer name' },
  amenities: { label: 'Amenities', hint: 'Separate with commas.' },
  parking: { label: 'Parking' },
  transit: { label: 'Transit' },
  petFriendly: { label: 'Pet friendly' },
  familyFriendly: { label: 'Family friendly' },
  occurrences: { label: 'Market dates' },
};

export const fieldLabel = (field: string) => FIELD_COPY[field]?.label ?? field;

export type ProfileStep = { id: string; title: string; short: string; why: string; fields: string[] };

/** The guided order for a business profile. Every owner-editable business field appears exactly once. */
export const PROFILE_STEPS: ProfileStep[] = [
  { id: 'about', title: 'About you', short: 'About', why: 'This is the first thing people read. Say it the way you’d say it at the counter.', fields: ['title', 'summary', 'description', 'services'] },
  { id: 'contact', title: 'How to reach you', short: 'Contact', why: 'Make it easy to call, write or drop by.', fields: ['phone', 'email', 'website', 'address'] },
  { id: 'hours', title: 'Opening hours', short: 'Hours', why: 'Your page shows “Open now” or “Closed” from these, so visitors don’t make a wasted trip.', fields: ['hours'] },
  { id: 'links', title: 'Social links', short: 'Links', why: 'Let people follow you and see what’s new.', fields: ['socials'] },
  { id: 'offer', title: 'Offers & extras', short: 'Offers', why: 'A deal or a regular event gives people a reason to visit this week.', fields: ['offer', 'neighbourhood', 'tags', 'categories', 'priceLevel', 'coordinates', 'venue'] },
];
/** The business fields the guided steps cover (the owner-editable set). */
export const ownerProfileFields = () => ownerEditableFields('business');
/** Fields that sit behind “More details” inside their step. */
export const EXTRA_FIELDS = new Set(['neighbourhood', 'tags', 'categories', 'priceLevel', 'coordinates', 'venue']);

const filled = (v: unknown) =>
  v === undefined || v === null ? false
    : typeof v === 'string' ? Boolean(v.trim())
      : Array.isArray(v) ? v.length > 0
        : typeof v === 'object' ? Object.values(v as object).some((x) => (typeof x === 'string' ? x.trim() : x != null))
          : true;

/** A step counts as done when its main (non-extra) fields have something in them. */
export function stepDone(step: ProfileStep, entity: Record<string, unknown>): boolean {
  const main = step.fields.filter((f) => !EXTRA_FIELDS.has(f) && f !== 'offer' && f !== 'services');
  return (main.length ? main : step.fields.filter((f) => !EXTRA_FIELDS.has(f))).every((f) => filled(entity[f]));
}

export const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT: Record<string, string> = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

/** "Mon–Sat 9am–7pm", "Sun 11am–5pm": consecutive days with the same hours fold together. */
export function hoursLines(hours: Record<string, string> | undefined): string[] {
  if (!hours) return [];
  const out: string[] = [];
  let run: { from: string; to: string; value: string } | undefined;
  const flush = () => {
    if (run) out.push(`${run.from === run.to ? SHORT[run.from] : `${SHORT[run.from]}–${SHORT[run.to]}`} ${run.value}`);
    run = undefined;
  };
  for (const day of WEEK) {
    const value = hours[day]?.trim();
    if (!value) { flush(); continue; }
    if (run && run.value.toLowerCase() === value.toLowerCase()) run.to = day;
    else { flush(); run = { from: day, to: day, value }; }
  }
  flush();
  for (const [key, value] of Object.entries(hours)) if (!WEEK.includes(key) && value?.trim()) out.push(`${key} ${value.trim()}`);
  return out;
}

/** What today's row says, in Calgary time. */
export function todaysHours(hours: Record<string, string> | undefined, now = Date.now()): { day: string; value?: string } {
  const day = new Intl.DateTimeFormat('en-CA', { weekday: 'long', timeZone: 'America/Edmonton' }).format(now);
  return { day, value: hours?.[day]?.trim() || undefined };
}

const SOCIAL_HOSTS: Record<string, string> = {
  instagram: 'https://www.instagram.com/',
  tiktok: 'https://www.tiktok.com/@',
  x: 'https://x.com/',
  twitter: 'https://x.com/',
  threads: 'https://www.threads.net/@',
  facebook: 'https://www.facebook.com/',
  youtube: 'https://www.youtube.com/@',
};
export const SOCIAL_NAMES: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', twitter: 'X', threads: 'Threads', website: 'Website', linkedin: 'LinkedIn',
};

/** Turns "@shop", "instagram.com/shop" or "http://…" into the https link the site needs. Leaves anything else alone. */
export function normalizeLink(text: string, network?: string): string {
  const v = text.trim();
  if (!v) return '';
  if (/^https:\/\//i.test(v)) return v;
  if (/^http:\/\//i.test(v)) return `https://${v.slice(7)}`;
  if (network && SOCIAL_HOSTS[network] && /^@?[\w.]+$/.test(v) && !/\.(com|ca|net|org)$/i.test(v))
    return SOCIAL_HOSTS[network] + v.replace(/^@/, '');
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) return `https://${v}`;
  return v;
}

/** A link shown without the noise: "instagram.com/pawsitivelynatural". */
export const shortLink = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');

/** Human-readable lines for one field value. Never JSON. */
export function friendlyValue(field: string, value: unknown): string[] {
  if (value === undefined || value === null || value === '') return ['(empty)'];
  if (field === 'hours') {
    const lines = hoursLines(value as Record<string, string>);
    return lines.length ? lines : ['(no hours)'];
  }
  if (field === 'socials') {
    const entries = Object.entries(value as Record<string, string>).filter(([, v]) => v);
    return entries.length ? entries.map(([k, v]) => `${SOCIAL_NAMES[k] ?? k}: ${shortLink(v)}`) : ['(no links)'];
  }
  if (field === 'coordinates') {
    const p = value as { lat?: number; lng?: number };
    return [`${p.lat?.toFixed(5)}, ${p.lng?.toFixed(5)}`];
  }
  if (field === 'priceRange') {
    const [a, b] = value as number[];
    return [`$${a}–$${b}`];
  }
  if (field === 'occurrences') return [`${(value as unknown[]).length} market date${(value as unknown[]).length === 1 ? '' : 's'}`];
  if (field === 'priceLevel') return ['$'.repeat(Number(value) || 1)];
  if (typeof value === 'boolean') return [value ? 'Yes' : 'No'];
  if (Array.isArray(value)) return [value.join(', ') || '(empty)'];
  if (field === 'website' || field === 'tickets') return [shortLink(String(value))];
  if (field === 'start' || field === 'end')
    return [new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Edmonton' }).format(new Date(String(value)))];
  return [String(value)];
}

/** A kind, specific message for a value the server would refuse, or undefined when it's fine. */
export function fieldProblem(entity: DiscoveryEntity, field: string, value: unknown): string | undefined {
  try {
    ownerEditPatch(entity, { [field]: value });
    return undefined;
  } catch (e) {
    const raw = (e as Error).message;
    if (field === 'socials') return 'Each link needs to be a full web address. Try pasting it from your browser, or type your @handle.';
    if (field === 'website' || field === 'tickets') return 'That doesn’t look like a web address yet. Try something like yourshop.ca.';
    if (field === 'email') return 'That email doesn’t look quite right. Check for a missing @ or dot.';
    if (field === 'title' || field === 'address') return 'This one can’t be empty.';
    if (/maximum/.test(raw)) return `That’s a bit long. ${raw.replace(/^Check \w+ \(/, '(').replace(/\)\.?$/, ')')}`;
    return raw;
  }
}
