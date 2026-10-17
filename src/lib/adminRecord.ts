/** Read-only presentation adapters. Stored legacy records are not TypeScript objects. */
export function adminTimestamp(value: unknown): number | undefined {
  let ms: number;
  try {
    if (typeof value === "number") ms = value;
    else if (typeof value === "string") ms = Date.parse(value);
    else if (
      value &&
      typeof value === "object" &&
      "toMillis" in value &&
      typeof value.toMillis === "function"
    )
      ms = value.toMillis();
    else if (
      value &&
      typeof value === "object" &&
      "seconds" in value &&
      typeof value.seconds === "number"
    )
      ms = value.seconds * 1000;
    else return undefined;
  } catch {
    return undefined;
  }
  return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? ms : undefined;
}
export const adminText = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;
export const adminObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
