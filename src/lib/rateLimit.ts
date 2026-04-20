const STORAGE_KEY_PREFIX = 'cw-rl-';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_PER_HOUR = 3;
const MAX_PER_DAY = 10;

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;        // human-readable message if not allowed
  waitMinutes?: number;   // how long to wait
}

export function checkRateLimit(uid: string): RateLimitResult {
  const key = `${STORAGE_KEY_PREFIX}${uid}`;
  const now = Date.now();

  // Read and parse existing timestamps, pruning anything older than 24h
  let timestamps: number[] = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      timestamps = (JSON.parse(raw) as number[]).filter(t => now - t < DAY_MS);
    }
  } catch {
    timestamps = [];
  }

  // Check 24h limit
  if (timestamps.length >= MAX_PER_DAY) {
    const oldest = timestamps[0];
    const waitMs = DAY_MS - (now - oldest);
    return { allowed: false, reason: `Daily limit reached (${MAX_PER_DAY} posts/day). Try again in ${Math.ceil(waitMs / HOUR_MS)} hours.`, waitMinutes: Math.ceil(waitMs / 60000) };
  }

  // Check 1h limit
  const lastHour = timestamps.filter(t => now - t < HOUR_MS);
  if (lastHour.length >= MAX_PER_HOUR) {
    const oldest = lastHour[0];
    const waitMs = HOUR_MS - (now - oldest);
    return { allowed: false, reason: `Hourly limit reached (${MAX_PER_HOUR} posts/hour). Try again in ${Math.ceil(waitMs / 60000)} minutes.`, waitMinutes: Math.ceil(waitMs / 60000) };
  }

  return { allowed: true };
}

export function recordSubmission(uid: string): void {
  const key = `${STORAGE_KEY_PREFIX}${uid}`;
  const now = Date.now();
  let timestamps: number[] = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      timestamps = (JSON.parse(raw) as number[]).filter(t => now - t < DAY_MS);
    }
  } catch {
    timestamps = [];
  }
  timestamps.push(now);
  try {
    localStorage.setItem(key, JSON.stringify(timestamps));
  } catch { /* ignore storage errors */ }
}
