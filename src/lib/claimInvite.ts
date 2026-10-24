/**
 * Personal claim links for organizers we write to.
 *
 * Outreach links to `/claim/{entityId}?invite=…`, where `invite` carries who
 * the email went to: their name when we know it, the address we wrote to,
 * the organization's name, and which batch it came from. The claim page reads
 * it once, keeps it for the tab, takes it out of the address bar, and uses it
 * to greet the person and fill in the form. The same page is where organizer
 * accounts are made, so the account is created with that work email.
 *
 * The invite is not signed and proves nothing: anyone can make one. It is a
 * convenience for the person who opens it, never claim evidence. Admin review
 * still decides every claim from the listing's own sources.
 */

export type ClaimInvite = {
  /** Contact's name, when the outreach knows it ("Kendra Hutchinson"). */
  name?: string;
  /** The address the invitation went to: becomes the work email and account email. */
  email?: string;
  /** The organization as we addressed it ("Vertigo Theatre"). */
  org?: string;
  /** Where the link was sent from: "outreach" (automated), "outlook" (a manual batch), … */
  via?: string;
};

export const INVITE_PARAM = 'invite';
const SITE = 'https://calgarywatch.ca';
const LIMITS = { name: 80, email: 120, org: 120, via: 24 } as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  // Control characters and markup never belong in a greeting.
  const text = value.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return text || undefined;
}

/** The fields an invite may carry, trimmed and validated. Anything else is dropped. */
export function normalizeInvite(raw: unknown): ClaimInvite | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const email = clean(r.email ?? r.e, LIMITS.email)?.toLowerCase();
  const out: ClaimInvite = {
    name: clean(r.name ?? r.n, LIMITS.name),
    email: email && EMAIL.test(email) ? email : undefined,
    org: clean(r.org ?? r.o, LIMITS.org),
    via: clean(r.via ?? r.v, LIMITS.via)?.toLowerCase().replace(/[^a-z0-9-]/g, '') || undefined,
  };
  for (const k of Object.keys(out) as Array<keyof ClaimInvite>) if (!out[k]) delete out[k];
  return Object.keys(out).length ? out : null;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

/**
 * Short keys and base64url keep the link tidy in an email and keep a plain
 * address out of the URL people see. It is encoding, not encryption.
 */
export function encodeInvite(invite: ClaimInvite): string {
  const n = normalizeInvite(invite);
  if (!n) return '';
  return toBase64Url(JSON.stringify({ n: n.name, e: n.email, o: n.org, v: n.via }));
}

export function decodeInvite(value: string | null | undefined): ClaimInvite | null {
  if (!value || value.length > 800 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try { return normalizeInvite(JSON.parse(fromBase64Url(value))); } catch { return null; }
}

/** The claim page for one listing, personal when we know who it's for. */
export function personalClaimUrl(entityId: string, invite?: ClaimInvite | null, base = SITE): string {
  const url = `${base}/claim/${encodeURIComponent(entityId)}`;
  const token = invite ? encodeInvite(invite) : '';
  return token ? `${url}?${INVITE_PARAM}=${token}` : url;
}

/**
 * Role inboxes ("info@", "hello@") aren't a person: greet the team instead.
 * Only a real-looking first name from the contact name is used.
 */
export function inviteGreetingName(invite: ClaimInvite | null | undefined): string {
  const first = invite?.name?.split(' ')[0] ?? '';
  return /^[\p{L}][\p{L}'’-]{1,30}$/u.test(first) && !/^(team|info|hello|admin|media|office|events?|the)$/i.test(first) ? first : '';
}

/**
 * How an account came to exist, written once to `users/{uid}` so admin can
 * tell organizers from residents. Only the claim page sets "organizer".
 */
export type SignupIntent = { as: 'organizer'; entityId: string; via?: string };

export function signupFields(intent: SignupIntent | null | undefined): Record<string, string> {
  if (!intent || intent.as !== 'organizer' || !intent.entityId) return {};
  return { signupAs: 'organizer', signupEntityId: intent.entityId.slice(0, 120), signupVia: clean(intent.via, LIMITS.via) ?? 'claim' };
}
