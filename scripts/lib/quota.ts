/**
 * Firestore's free plan has a daily read/write quota. When it runs out every
 * scheduled job fails at once and the inbox fills with failure emails, though
 * nothing is broken: the quota resets at midnight Pacific and the next run
 * catches up on whatever was missed. These helpers let a job say so in a
 * warning annotation instead of failing red.
 *
 * Only RESOURCE_EXHAUSTED is treated this way. Every other error still fails
 * the run.
 */

export function isQuotaExhausted(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return e?.code === 8 || e?.code === 'resource-exhausted' || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(e?.message ?? error));
}

/** Log a GitHub warning and end the process successfully. */
export function exitForQuota(job: string): never {
  console.log(`::warning title=${job} skipped::Firestore daily quota is exhausted. Nothing was lost; the next scheduled run catches up after the quota resets (midnight Pacific).`);
  process.exit(0);
}
