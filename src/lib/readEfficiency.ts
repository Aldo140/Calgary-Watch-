/** No network/telemetry. Inspect subscriptionDiagnostics() in development. */
type Diagnostic = { active: number; opened: number };
const diagnostics = new Map<string, Diagnostic>();
export function subscriptionDiagnostics() { return Object.fromEntries([...diagnostics].map(([key, value]) => [key, { ...value }])); }
export function trackSubscription(key: string, start: () => () => void, enabled = Boolean(import.meta.env?.DEV)): () => void {
  if (!enabled) return start();
  const entry = diagnostics.get(key) ?? { active: 0, opened: 0 };
  diagnostics.set(key, entry); entry.active++; entry.opened++;
  if (entry.active > 1) console.warn(`[Firestore] duplicate subscription: ${key} (${entry.active})`);
  let stop: () => void;
  try { stop = start(); } catch (e) { entry.active--; throw e; }
  let stopped = false;
  return () => { if (stopped) return; stopped = true; entry.active--; stop(); };
}

/** One underlying listener per key, even when nav, page and dashboard all subscribe. */
export function createSharedLiveValue<T>(initial: T, start: (publish: (value: T) => void) => () => void) {
  let value = initial; let stop: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: T) => { value = next; for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener);
      try { if (!stop) stop = start(publish); } catch (error) { listeners.delete(listener); throw error; }
      let removed = false;
      return () => { if (removed) return; removed = true; listeners.delete(listener); if (!listeners.size) { stop?.(); stop = undefined; } };
    },
  };
}

/** Coalesces simultaneous loads and caches the result briefly. Use identity in private-data keys. */
export function createReadCache(clock: () => number = Date.now) {
  const entries = new Map<string, { value?: unknown; at?: number; pending?: Promise<unknown> }>();
  return {
    read<T>(key: string, load: () => Promise<T>, ttl = 60_000): Promise<T> {
      const entry = entries.get(key) ?? {}; entries.set(key, entry);
      if (entry.pending) return entry.pending as Promise<T>;
      if (entry.at !== undefined && clock() - entry.at < ttl) return Promise.resolve(entry.value as T);
      const pending = Promise.resolve().then(load).then(value => { entry.value = value; entry.at = clock(); return value; }).finally(() => { entry.pending = undefined; });
      entry.pending = pending; return pending;
    },
    invalidate: (key: string) => { entries.delete(key); },
  };
}
export const adminReadCache = createReadCache();
