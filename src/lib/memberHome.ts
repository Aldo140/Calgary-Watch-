/**
 * The signed-in reader's home on /plans: what's set up, what arrives when,
 * and what happened near them. Pure, so every case is tested without
 * Firestore.
 *
 * The page leans on three ideas, gently:
 *   - Progress you can see. Setup is a short checklist with a ring, and every
 *     step names the badge it earns, so the next step is always obvious.
 *   - Show the payoff before asking. The sign-up form previews the exact
 *     email the reader is building, with their area and interests in it.
 *   - One email, told honestly. Both lists arrive together on Monday, and the
 *     page says so in the same words the email uses.
 */

import type { BadgeId } from './badges';
import type { ExampleReport } from './homeClaims';
import type { Point } from './eventPicks';
import { calgaryDateTimeFormat } from './calgaryTz';

export type SetupStepId = 'home' | 'monday' | 'events' | 'interests' | 'plan' | 'share';

export interface SetupStep {
  id: SetupStepId;
  label: string;
  /** Why it's worth doing, in a line. */
  why: string;
  done: boolean;
  badge: BadgeId;
}

export interface SetupInput {
  hasHomeArea: boolean;
  weekly: boolean;
  events: boolean;
  interestCount: number;
  goingCount: number;
  reportCount?: number;
  submissionCount?: number;
}

export function setupSteps(input: SetupInput): SetupStep[] {
  return [
    { id: 'home', label: 'Set your home area', why: 'Everything starts near home.', done: input.hasHomeArea, badge: 'neighbour' },
    { id: 'monday', label: 'Get the Monday safety brief', why: 'What was reported near you, in two minutes.', done: input.weekly, badge: 'monday-reader' },
    { id: 'events', label: 'Get event picks by email', why: 'Things to do that match what you’re into.', done: input.events, badge: 'on-the-list' },
    { id: 'interests', label: 'Pick three interests', why: 'Sharper picks, here and by email.', done: input.interestCount >= 3, badge: 'tuned-in' },
    { id: 'plan', label: 'Make your first plan', why: 'Tap “I’m going” and get a reminder.', done: input.goingCount >= 1, badge: 'first-plans' },
    {
      id: 'share', label: 'Share something with neighbours', why: 'Add an event, or post a report on the live map.',
      done: (input.reportCount ?? 0) >= 1 || (input.submissionCount ?? 0) >= 1, badge: 'scout',
    },
  ];
}

export function setupPercent(steps: readonly SetupStep[]): number {
  return steps.length ? Math.round((steps.filter((s) => s.done).length / steps.length) * 100) : 0;
}

// ── What arrives, and when ──────────────────────────────────────────────────

/** Matches the workflow crons: Monday 15:00 UTC, Thursday 14:00 UTC (Calgary is UTC-6). */
const SEND_HOUR_CALGARY = { monday: 9, thursday: 8 } as const;

export type EmailPlanKind = 'combined' | 'monday' | 'thursday' | 'none';

export interface EmailPlan {
  kind: EmailPlanKind;
  /** The email's name, as the email itself says it. */
  name: string;
  /** One line on what's inside. */
  inside: string;
  /** "Mondays, 9 a.m." */
  cadence: string;
  /** Next send instant, epoch ms, or null when nothing is on. */
  next: number | null;
}

/** Day-of-week (0 = Sunday) and hour in Calgary for an instant. */
function calgaryClock(at: number): { dow: number; hour: number } {
  const parts = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at));
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  return { dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd), hour };
}

/** Next instant that is `dow` at `hour`:00 in Calgary, strictly after `now`. */
export function nextSend(now: number, dow: number, hour: number): number {
  const clock = calgaryClock(now);
  let days = (dow - clock.dow + 7) % 7;
  if (days === 0 && clock.hour >= hour) days = 7;
  const startOfHour = now - (now % 3_600_000);
  return startOfHour + (days * 24 + (hour - clock.hour)) * 3_600_000;
}

export function emailPlan(weekly: boolean, events: boolean, now: number): EmailPlan {
  if (weekly && events) {
    return {
      kind: 'combined', name: 'Your week', cadence: 'Mondays, 9 a.m.',
      inside: 'Safety near home and your event picks, together in one email.',
      next: nextSend(now, 1, SEND_HOUR_CALGARY.monday),
    };
  }
  if (weekly) {
    return {
      kind: 'monday', name: 'The Monday brief', cadence: 'Mondays, 9 a.m.',
      inside: 'What was reported within a walk, 3 km and 10 km of home.',
      next: nextSend(now, 1, SEND_HOUR_CALGARY.monday),
    };
  }
  if (events) {
    return {
      kind: 'thursday', name: 'Thursday picks', cadence: 'Thursdays, 8 a.m.',
      inside: 'Up to eight things to do, matched to your interests.',
      next: nextSend(now, 4, SEND_HOUR_CALGARY.thursday),
    };
  }
  return { kind: 'none', name: 'No emails yet', cadence: '', inside: 'Your picks and plans stay here either way.', next: null };
}

// ── Near home, live ────────────────────────────────────────────────────────

const R = 6_371_000;
function metres(a: Point, b: Point): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface NearReport extends ExampleReport { distanceM: number | null }

/**
 * Recent public reports near home: within `radius` of the home point, or in
 * the same neighbourhood by name when there is no point. Newest first.
 */
export function nearHome(recent: readonly ExampleReport[], home: Point | null, area: string, radius = 2_500): NearReport[] {
  const name = area.trim().toLowerCase();
  return recent
    .map((r) => ({ ...r, distanceM: home && typeof r.lat === 'number' && typeof r.lng === 'number' ? Math.round(metres(home, { lat: r.lat, lng: r.lng })) : null }))
    .filter((r) => (r.distanceM !== null ? r.distanceM <= radius : !!name && (r.neighborhood ?? '').trim().toLowerCase() === name))
    .sort((a, b) => b.timestamp - a.timestamp);
}

/** "Morning" / "Afternoon" / "Evening", by the Calgary clock. */
export function partOfDay(now: number): string {
  const { hour } = calgaryClock(now);
  return hour < 5 ? 'Evening' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
}
