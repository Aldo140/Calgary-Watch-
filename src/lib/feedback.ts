/**
 * Community report lifecycle.
 *
 * A report on the map used to carry a single "Confirmed" badge that claimed
 * more than it knew. Residents can say something truer: they saw it too, it is
 * still happening, or it looks resolved. This turns those answers into an honest
 * one-line status — how many neighbours backed it, when it was last seen active,
 * whether nearby residents call it resolved — without ever implying police
 * verification.
 *
 * Feedback is one deterministic record per user per incident (the doc id is the
 * user and the incident joined), so a report cannot be ballot-stuffed and the
 * aggregate is a straight count. Pure, so the whole lifecycle is testable
 * without Firestore.
 */

import { formatRelativeTime } from '@/src/lib/format';

export type FeedbackKind = 'saw_it' | 'still_happening' | 'resolved';

export interface IncidentFeedback {
  incidentId: string;
  uid: string;
  kind: FeedbackKind;
  createdAt: number;
  updatedAt: number;
}

/** One record per user per incident. The id encodes both so rules can enforce it. */
export function feedbackDocId(uid: string, incidentId: string): string {
  return `${uid}_${incidentId}`;
}

export interface FeedbackAggregate {
  /** Distinct users who left any feedback. */
  total: number;
  /** saw_it + still_happening — people vouching the report is real. */
  corroborations: number;
  stillHappening: number;
  resolved: number;
  /** Most recent active signal (saw_it/still_happening), or null. */
  lastActiveAt: number | null;
  /** Residents calling it resolved outnumber those saying it is active. */
  resolvedByResidents: boolean;
  /** Both active and resolved signals present — needs a moderator's eye. */
  disputed: boolean;
}

/** How recent an active signal must be to read as "last seen active …". */
const ACTIVE_RECENCY_MS = 3 * 60 * 60 * 1000;

export function aggregateFeedback(docs: IncidentFeedback[], _now: number): FeedbackAggregate {
  // Collapse to one record per user, latest write winning — the doc id already
  // guarantees this in Firestore, but a query result is defended here too.
  const latest = new Map<string, IncidentFeedback>();
  for (const d of docs) {
    const prev = latest.get(d.uid);
    if (!prev || d.updatedAt > prev.updatedAt) latest.set(d.uid, d);
  }

  let sawIt = 0;
  let stillHappening = 0;
  let resolved = 0;
  let lastActiveAt: number | null = null;
  for (const d of latest.values()) {
    if (d.kind === 'saw_it') sawIt += 1;
    else if (d.kind === 'still_happening') stillHappening += 1;
    else resolved += 1;
    if (d.kind === 'saw_it' || d.kind === 'still_happening') {
      lastActiveAt = lastActiveAt === null ? d.updatedAt : Math.max(lastActiveAt, d.updatedAt);
    }
  }

  const corroborations = sawIt + stillHappening;
  return {
    total: latest.size,
    corroborations,
    stillHappening,
    resolved,
    lastActiveAt,
    resolvedByResidents: resolved > 0 && resolved >= corroborations,
    disputed: stillHappening + sawIt > 0 && resolved > 0,
  };
}

/**
 * One honest line for the report, strongest true signal first: resolved beats a
 * recent sighting, which beats a bare count, which beats silence. Never claims
 * verification — only what neighbours have said.
 */
export function feedbackSummary(agg: FeedbackAggregate, now: number): string {
  if (agg.total === 0) return 'No recent confirmation';
  if (agg.resolvedByResidents) return 'Reported resolved by nearby residents';
  if (agg.lastActiveAt !== null && now - agg.lastActiveAt <= ACTIVE_RECENCY_MS) {
    return `Last seen active ${formatRelativeTime(agg.lastActiveAt, now)}`;
  }
  if (agg.corroborations > 0) {
    return `Backed by ${agg.corroborations} ${agg.corroborations === 1 ? 'neighbour' : 'neighbours'}`;
  }
  return 'No recent confirmation';
}
