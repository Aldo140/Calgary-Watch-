/**
 * Privacy-safe product analytics.
 *
 * The existing `page_views` collection records that a page was seen, which
 * cannot answer whether the map is *useful* — did anyone open their watch, view
 * a report, contribute? This logs those funnel steps. The hard rule is that an
 * event may carry *that* something happened but never *where* someone lives or
 * *what* they wrote: no address, no report text, no exact coordinates. Distance
 * is coarsened to a band. The sanitizer enforces this by construction so a
 * careless call site cannot leak, and the matching Firestore rule refuses any
 * document that still carries a forbidden field.
 */

export type ProductEventName =
  | 'watch_opened'
  | 'notification_opened'
  | 'report_viewed'
  | 'report_started'
  | 'report_submitted'
  | 'feedback_added'
  | 'digest_enabled';

/** Keys that could identify a place or a person, dropped unconditionally. */
const FORBIDDEN_KEYS = new Set(['address', 'description', 'title', 'email', 'name', 'lat', 'lng']);

/** Longest string an event prop may carry — enough for an enum, not free text. */
const MAX_STRING = 32;

/** Coarse distance bands. A raw metre value is itself locating, so never kept. */
function distanceBucket(metres: number): string {
  if (metres < 500) return '0-500m';
  if (metres < 1000) return '500m-1km';
  if (metres < 2000) return '1-2km';
  return '2km+';
}

/**
 * Reduce arbitrary props to the safe subset: short enum-like strings and finite
 * numbers, with `distanceM` replaced by a coarse `distanceBucket`. Everything
 * else — forbidden keys, long strings, non-finite numbers, objects — is dropped.
 */
export function sanitizeEventProps(props: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(props)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (key === 'distanceM') {
      if (typeof value === 'number' && Number.isFinite(value)) out.distanceBucket = distanceBucket(value);
      continue;
    }
    if (typeof value === 'string') {
      if (value.length > 0 && value.length <= MAX_STRING) out[key] = value;
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

/**
 * Record one funnel event. A no-op when Firebase is not configured, and never
 * throws into the UI — analytics must not be able to break a click.
 *
 * Firebase is imported lazily so this module stays free of `import.meta.env`
 * and can be unit-tested for its sanitization under plain Node. The write is
 * fire-and-forget.
 */
export function logProductEvent(name: ProductEventName, props: Record<string, unknown> = {}): void {
  const payload = { name, ...sanitizeEventProps(props), ts: Date.now() };
  void (async () => {
    try {
      const [{ auth, db }, { addDoc, collection }] = await Promise.all([
        import('@/src/firebase'),
        import('firebase/firestore'),
      ]);
      if (!db) return;
      await addDoc(collection(db, 'product_events'), { ...payload, uid: auth?.currentUser?.uid ?? null });
    } catch {
      /* analytics is best-effort; a failed write must never surface to the reader */
    }
  })();
}
