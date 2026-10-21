/**
 * What a data source's health actually means for the admin.
 *
 * Every scheduled source runs on GitHub Actions cron. GitHub treats schedules
 * as best-effort and throttles busy repositories: in October 2026 the
 * "every 30 minutes" ingest and the "every 5 minutes" ENMAX job both ran
 * roughly every 3–5½ hours, and every run succeeded. Treating each missed
 * window as an outage turned the desk red all day with nothing to fix.
 *
 * So a source that is merely late (inside SCHEDULER_SLACK_MINUTES of its last
 * check-in) is "late": expected, shown calmly, never urgent. It only becomes
 * "stale" when GitHub has skipped it for longer than its worst observed gap.
 * A failed run is still "down" straight away, because that is a real fault.
 *
 * Pure, so the rules are tested without Firestore or a browser.
 */

import type { DataSourceOperationalStatus } from '../config/dataSources';

/** Longest gap GitHub's scheduler has been seen to leave (≈5½h), plus margin. */
export const SCHEDULER_SLACK_MINUTES = 8 * 60;

export type FeedVerdict =
  /** Checked in on time, or a browser probe answered. */
  | 'live'
  /** Missed its cron window but within GitHub's normal scheduling slack. */
  | 'late'
  /** Answered, but slowly. */
  | 'slow'
  /** Optional source waiting on credentials. */
  | 'setup'
  /** No check-in for longer than GitHub has ever delayed it. */
  | 'stale'
  /** The last run or probe failed. */
  | 'down'
  /** Not reported yet. */
  | 'waiting';

export interface FeedHealthInput {
  status: DataSourceOperationalStatus;
  healthMode: 'scheduled' | 'direct';
  optional?: boolean;
  staleAfterMinutes?: number;
  lastChecked: number | null;
  error?: string | null;
}

export interface FeedReading {
  verdict: FeedVerdict;
  /** Belongs in "Needs attention". */
  actionable: boolean;
  /** Belongs at the top of it. */
  urgent: boolean;
  /** One plain line for the row. */
  note: string;
}

const hours = (ms: number) => {
  const h = ms / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(ms / 60_000))} min` : `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)}h`;
};

export function readFeed(source: FeedHealthInput, now = Date.now()): FeedReading {
  const age = source.lastChecked ? now - source.lastChecked : null;
  if (source.status === 'disabled') {
    return source.optional
      ? { verdict: 'setup', actionable: false, urgent: false, note: 'Optional · waiting on credentials' }
      : { verdict: 'down', actionable: true, urgent: true, note: source.error ?? 'Configuration is incomplete' };
  }
  if (source.status === 'idle' || source.status === 'checking') {
    return { verdict: 'waiting', actionable: false, urgent: false, note: source.status === 'checking' ? 'Checking now' : 'No report yet' };
  }
  if (source.status === 'slow') return { verdict: 'slow', actionable: false, urgent: false, note: 'Answered slowly' };

  if (source.healthMode === 'scheduled' && age !== null) {
    const window = (source.staleAfterMinutes ?? 90) * 60_000;
    if (age > SCHEDULER_SLACK_MINUTES * 60_000) {
      return { verdict: 'stale', actionable: !source.optional, urgent: !source.optional, note: `No run for ${hours(age)} · longer than GitHub normally delays it` };
    }
    // A failed run is a real fault, late or not.
    if (source.status === 'error') {
      return { verdict: 'down', actionable: !source.optional, urgent: !source.optional, note: source.error ?? 'Last run failed' };
    }
    if (age > window) return { verdict: 'late', actionable: false, urgent: false, note: `Last run ${hours(age)} ago · GitHub runs schedules late` };
    return { verdict: 'live', actionable: false, urgent: false, note: 'On schedule' };
  }

  if (source.status === 'error') {
    // A live map layer is fetched from the City by each visitor's browser. It
    // is worth knowing about, but the map hides the layer and retries on its
    // own, so it is not a page-the-owner emergency.
    if (source.healthMode === 'direct') {
      return { verdict: 'down', actionable: true, urgent: false, note: `${source.error ?? 'Not responding'} · the map hides this layer until it answers` };
    }
    return { verdict: 'down', actionable: !source.optional, urgent: !source.optional, note: source.error ?? 'Last run failed' };
  }
  return { verdict: 'live', actionable: false, urgent: false, note: 'Answering' };
}

export interface FeedSummary {
  total: number;
  live: number;
  late: number;
  setup: number;
  problems: number;
  urgent: number;
}

export function summarizeFeeds(sources: readonly FeedHealthInput[], now = Date.now()): FeedSummary {
  const readings = sources.map((source) => readFeed(source, now));
  return {
    total: sources.length,
    live: readings.filter((r) => r.verdict === 'live' || r.verdict === 'slow').length,
    late: readings.filter((r) => r.verdict === 'late').length,
    setup: readings.filter((r) => r.verdict === 'setup').length,
    problems: readings.filter((r) => r.actionable).length,
    urgent: readings.filter((r) => r.urgent).length,
  };
}
