import type { ActionCodeSettings, User } from 'firebase/auth';
import type { SignupIntent } from './claimInvite';

export type AuthMode = 'signin' | 'signup' | 'reset';

/**
 * What a page can ask of the sign-in dialog: which form to open on, an email
 * it already knows, and why the person is being asked (a headline and a line
 * under it), so the dialog reads as the next step of what they were doing.
 */
export type AuthRequest = { mode?: AuthMode; email?: string; name?: string; title?: string; intro?: string; verify?: boolean; signupAs?: SignupIntent; organizer?: boolean };
// `signupAs`: only claim pages pass it. A new account made from that dialog is labelled
// an organizer sign-up; `organizer` is what the dialog itself sees, to word itself for one.
// `verify`: the page needs a verified email (claims, applications, submissions), so the
// dialog stays on "Check your inbox" after sign-up. Everywhere else it closes and the
// account companion nudges later, so saving a plan never waits on an inbox.

/** How this browser last signed in, so returning people are steered to the same method. */
export type LastSignIn = { method: 'google' | 'email'; email?: string };
const LAST_KEY = 'cw-last-sign-in';

export function readLastSignIn(): LastSignIn | null {
  try {
    const value = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as LastSignIn | null;
    return value && (value.method === 'google' || value.method === 'email') ? { method: value.method, email: typeof value.email === 'string' ? value.email : undefined } : null;
  } catch { return null; }
}

export function rememberSignIn(value: LastSignIn): void {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(value)); } catch { /* private mode: nothing to remember */ }
}

/** Mail providers Calgarians use most. A near miss of one is almost always a typo. */
const COMMON_DOMAINS = ['gmail.com', 'hotmail.com', 'hotmail.ca', 'outlook.com', 'live.com', 'live.ca', 'yahoo.com', 'yahoo.ca', 'icloud.com', 'me.com', 'msn.com', 'shaw.ca', 'telus.net', 'protonmail.com', 'proton.me', 'aol.com', 'ucalgary.ca', 'mtroyal.ca'];

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = next;
    }
  }
  return row[b.length];
}

/**
 * "jo@gmial.com" → "jo@gmail.com". A mistyped address can never be verified,
 * which locks the person out of claims, so catch it before the account exists.
 */
export function suggestEmail(email: string): string {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1) return '';
  const domain = value.slice(at + 1);
  if (domain.length < 4 || COMMON_DOMAINS.includes(domain)) return '';
  let best = ''; let bestScore = 3;
  for (const known of COMMON_DOMAINS) {
    const score = distance(domain, known);
    if (score < bestScore) { best = known; bestScore = score; }
  }
  return best && bestScore <= (domain.length > 6 ? 2 : 1) ? `${value.slice(0, at)}@${best}` : '';
}

/** Where to open someone's inbox from the verify screen, for the big webmail providers. */
export function inboxLink(email: string): { label: string; href: string } | null {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  if (domain === 'gmail.com' || domain === 'googlemail.com') return { label: 'Open Gmail', href: 'https://mail.google.com/mail/u/0/#search/in%3Aanywhere+calgarywatch' };
  if (/^(hotmail|outlook|live|msn)\.(com|ca)$/.test(domain)) return { label: 'Open Outlook', href: 'https://outlook.live.com/mail/0/' };
  if (/^yahoo\.(com|ca)$/.test(domain)) return { label: 'Open Yahoo Mail', href: 'https://mail.yahoo.com/' };
  if (domain === 'icloud.com' || domain === 'me.com') return { label: 'Open iCloud Mail', href: 'https://www.icloud.com/mail' };
  if (domain === 'proton.me' || domain === 'protonmail.com') return { label: 'Open Proton Mail', href: 'https://mail.proton.me/' };
  return null;
}

export function authCode(error: unknown): string {
  return error instanceof Error ? (error as Error & { code?: string }).code ?? '' : '';
}

/**
 * Firestore and Storage rules read `email_verified` from the ID token, which
 * keeps its old value after the user clicks the verification link. `reload()`
 * only refreshes the profile, so mint a new token whenever the two disagree.
 */
export async function syncVerifiedToken(user: User): Promise<void> {
  if (!user.emailVerified) return;
  const token = await user.getIdTokenResult();
  if (token.claims.email_verified !== true) await user.getIdToken(true);
}

/**
 * Verification and reset emails bring the reader back to the page they were
 * on, so an organizer lands on their half-finished claim. Only real site
 * pages qualify: anything else uses Firebase's default page.
 */
export function returnLink(href: string): ActionCodeSettings | undefined {
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return undefined;
    url.hash = '';
    return { url: url.toString() };
  } catch { return undefined; }
}

/** A return link the Firebase project doesn't allow must never stop the email itself. */
export function continueUriRefused(error: unknown): boolean {
  return ['auth/unauthorized-continue-uri', 'auth/invalid-continue-uri', 'auth/missing-continue-uri'].includes(authCode(error));
}

export function emailProblem(email: string): string {
  if (!email.trim()) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
  return '';
}

/**
 * A name a person actually gave us. "Anonymous" is the placeholder profile
 * sync writes when an account has none (Firestore rules need a non-empty
 * string), so it never counts as one.
 */
export function realName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return name && !/^(anonymous|calgary neighbour)$/i.test(name) ? name.slice(0, 80) : '';
}

export function nameProblem(name: string): string {
  if (!realName(name)) return 'Enter your name.';
  return '';
}

export function passwordProblem(password: string): string {
  if (!password) return 'Enter your password.';
  if (password.length < 6) return 'Use at least 6 characters.';
  return '';
}

export function authErrorMessage(error: unknown): string {
  const code = authCode(error);
  if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(code)) return 'That email or password doesn’t match. Try again or reset your password.';
  if (code === 'auth/email-already-in-use') return 'An account already uses this email. Sign in with its existing method instead.';
  if (code === 'auth/operation-not-allowed') return 'Email sign-in isn’t available right now. Continue with Google, or email aldo@calgarywatch.ca and we’ll set you up.';
  if (code === 'auth/user-disabled') return 'This account has been turned off. Email aldo@calgarywatch.ca if you think that’s a mistake.';
  if (code === 'auth/missing-password') return 'Enter your password.';
  if (code === 'auth/password-does-not-meet-requirements') return 'Choose a stronger password: mix letters, numbers and a symbol.';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the Google window. Allow pop-ups for calgarywatch.ca, or sign in with email.';
  if (code === 'auth/account-exists-with-different-credential') return 'This email already has an account. Sign in with email and password instead.';
  if (code === 'auth/weak-password') return 'That password is too short. Use at least 6 characters.';
  if (code === 'auth/invalid-email') return 'Enter a valid email address.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes, then try again.';
  if (code === 'auth/network-request-failed') return 'We couldn’t reach the sign-in service. Check your connection and try again.';
  if (code === 'auth/unauthorized-domain') return 'Sign-in is not available on this web address.';
  if (code === 'auth/popup-closed-by-user') return 'The Google sign-in window was closed before sign-in finished.';
  return 'That didn’t work. Please try again.';
}
