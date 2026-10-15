/** Firebase web, Admin SDK and nested callable errors use different quota codes. */
export function isFirestoreQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return /quota exceeded|resource.exhausted/i.test(String(error));
  const e = error as { code?: unknown; message?: unknown; cause?: unknown };
  return e.code === 8 || /(?:^|\/)(?:resource-exhausted|RESOURCE_EXHAUSTED)$/.test(String(e.code))
    || /quota exceeded|resource.exhausted/i.test(String(e.message ?? '')) || (e.cause !== undefined && e.cause !== error && isFirestoreQuotaError(e.cause));
}
export const QUOTA_COOLDOWN_MS = 60_000;
export function firestoreActionError(error: unknown, atomic = false): string {
  if (isFirestoreQuotaError(error)) return `Firestore quota has been exceeded. ${atomic ? 'No changes were applied.' : 'The operation did not finish; refresh to check whether any earlier steps were applied.'} Try again after quota resets (around midnight Pacific) or after billing/quota is increased.`;
  return error instanceof Error ? error.message : 'Could not save changes. Refresh before retrying.';
}
