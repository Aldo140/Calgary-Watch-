// Writes this run's Claude usage (see takeUsage in lib/claude.ts) to
// ops_usage/{Calgary date}, one counter set per task. The HQ dashboard sums
// these into spend per day, per task and month to date.

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { takeUsage } from '../lib/claude';
import { calgaryDate } from '../lib/time';

type Log = (m: string) => void;
export const USAGE_COLLECTION = 'ops_usage';

export async function flushUsage(db: Firestore | null, now: number, run: string, log: Log): Promise<void> {
  const tally = takeUsage();
  if (!tally.size) return;
  let usd = 0;
  const update: Record<string, unknown> = { date: calgaryDate(now), updatedAt: now };
  for (const [task, t] of tally) {
    usd += t.usd;
    update[`tasks.${task}.calls`] = FieldValue.increment(t.calls);
    update[`tasks.${task}.inputTokens`] = FieldValue.increment(t.inputTokens);
    update[`tasks.${task}.outputTokens`] = FieldValue.increment(t.outputTokens);
    update[`tasks.${task}.cacheReadTokens`] = FieldValue.increment(t.cacheReadTokens);
    update[`tasks.${task}.usd`] = FieldValue.increment(t.usd);
  }
  update.usd = FieldValue.increment(usd);
  update[`runs.${run}`] = FieldValue.increment(1);
  log(`claude usage this run: $${usd.toFixed(4)} across ${[...tally.values()].reduce((n, t) => n + t.calls, 0)} calls (${[...tally.keys()].join(', ')}).`);
  if (!db) return;
  // update() reads "tasks.posts.calls" as a nested path; set() would not. Make sure the day exists first.
  const ref = db.collection(USAGE_COLLECTION).doc(calgaryDate(now));
  await ref.set({ date: calgaryDate(now) }, { merge: true });
  await ref.update(update);
}
