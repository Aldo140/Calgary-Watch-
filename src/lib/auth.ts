export type AuthMode = 'signin' | 'signup' | 'reset';

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
  const code = error instanceof Error ? (error as Error & { code?: string }).code ?? '' : '';
  if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(code)) return 'That email or password doesn’t match. Try again or reset your password.';
  if (code === 'auth/email-already-in-use') return 'An account already uses this email. Sign in with its existing method instead.';
  if (code === 'auth/weak-password') return 'That password is too short. Use at least 6 characters.';
  if (code === 'auth/invalid-email') return 'Enter a valid email address.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes, then try again.';
  if (code === 'auth/network-request-failed') return 'We couldn’t reach the sign-in service. Check your connection and try again.';
  if (code === 'auth/unauthorized-domain') return 'Sign-in is not available on this web address.';
  if (code === 'auth/popup-closed-by-user') return 'The Google sign-in window was closed before sign-in finished.';
  return 'That didn’t work. Please try again.';
}
