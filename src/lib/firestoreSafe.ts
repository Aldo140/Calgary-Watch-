/**
 * Firestore's web SDK refuses any write that contains `undefined`
 * ("Unsupported field value: undefined"), while the callable path serialises
 * through JSON and silently drops it. Fallback writes go through this so an
 * optional field left unset (a suggestion's `cancelled`, a new listing's `id`)
 * means the same thing on both paths: absent.
 */
export function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.filter((v) => v !== undefined).map(withoutUndefined) as T;
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, withoutUndefined(v)]),
  ) as T;
}
