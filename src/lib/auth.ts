import type { ActionCodeSettings, User } from 'firebase/auth';

export type AuthMode = 'signin' | 'signup' | 'reset';

/** What a page can ask of the sign-in dialog: which form to open on, and an email it already knows. */
export type AuthRequest = { mode?: AuthMode; email?: string };

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
