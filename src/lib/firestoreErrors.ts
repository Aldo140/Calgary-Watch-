/** Firebase web, Admin SDK and nested callable errors use different quota codes. */
export function isFirestoreQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return /quota exceeded|resource.exhausted/i.test(String(error));
  const e = error as { code?: unknown; message?: unknown; cause?: unknown };
  return e.code === 8 || /(?:^|\/)(?:resource-exhausted|RESOURCE_EXHAUSTED)$/.test(String(e.code))
    || /quota exceeded|resource.exhausted/i.test(String(e.message ?? '')) || (e.cause !== undefined && e.cause !== error && isFirestoreQuotaError(e.cause));
}
export const QUOTA_COOLDOWN_MS = 60_000;
export function isFirestorePermissionError(error: unknown): boolean {
  const e = error as {code?: unknown; message?: unknown} | null;
  return /(?:^|\/)(?:permission-denied|unauthenticated)$/.test(String(e?.code ?? ''))
    || /missing or insufficient permissions|permission.denied/i.test(String(e?.message ?? ''));
}
function isCallableAvailabilityError(error: unknown): boolean {
  const e = error as {code?: unknown; message?: unknown} | null;
  return /^(?:functions\/)?(?:internal|unavailable|deadline-exceeded|not-found)$/.test(String(e?.code ?? ''))
    || /^internal(?:\s*\[\d+\])?$/i.test(String(e?.message ?? ''));
}
export function firestoreActionError(error: unknown, atomic = false): string {
  if (isFirestoreQuotaError(error)) return `Firestore quota has been exceeded. ${atomic ? 'No changes were applied.' : 'The operation did not finish; refresh to check whether any earlier steps were applied.'} Try again after quota resets (around midnight Pacific) or after billing/quota is increased.`;
  if (isFirestorePermissionError(error)) return 'Access was denied. Sign in again and retry. If this persists, contact CalgaryWatch.';
  if (isCallableAvailabilityError(error)) return 'The organization service could not complete this request. Refresh to check its status before retrying. If this persists, contact CalgaryWatch.';
  return error instanceof Error ? error.message : 'Could not save changes. Refresh before retrying.';
}

export function adminFirestoreActionError(error: unknown, atomic = false): string {
  if (isFirestorePermissionError(error)) return 'Access was denied. Sign in again with an administrator account. If this persists, deploy the current Firestore rules.';
  if (isCallableAvailabilityError(error)) return 'The organization service could not complete this request. Refresh to check its status before retrying. If this persists, check the Firebase functions deployment and logs.';
  return firestoreActionError(error, atomic);
}
