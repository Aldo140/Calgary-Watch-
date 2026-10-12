/**
 * The "CW pick": one angle on the week that a list of reports cannot show.
 *
 * Every Monday email used to be the same shape with different numbers in it,
 * and a reader learns the shape in three weeks and stops reading. The list of
 * reports is the substance and stays, but each edition now leads with the most
 * telling thing about that reader's week: how close the nearest report was,
 * whether the week was mostly after dark, a run of quiet days, who reported it.
 *
 * Every angle is computed from the same summary the email already lists, so
 * nothing here can say something the reports below it do not support. There is
 * no invented trend, no ranking of neighbourhoods against each other, and no
 * playful framing of crime: these are awareness notes, written the way a
 * neighbour would say them.
 *
 * Angles are scored by how strong the signal is, then nudged by a per-week hash
 * so two equally strong angles take turns rather than one winning forever.
 * That rotation is deterministic: a re-send or a preview of the same week
 * always picks the same angle.
 */

import type { DigestSummary, ScoredIncident } from './digest';
import type { EventPicks, PickItem } from './eventPicks';
import { calgaryDateTimeFormat } from './calgaryTz';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DayCount {
  /** "Mon" */
  label: string;
  count: number;
  /** Start of the bucket. */
  start: number;
}

export type AngleVisual =
  | { kind: 'segments'; parts: Array<{ label: string; count: number; tone: 'gold' | 'bow' | 'coral' | 'soft' }> }
  | { kind: 'walk'; metres: number; minutes: number }
  | { kind: 'compare'; before: number; after: number; beforeLabel: string; afterLabel: string };

export interface DigestAngle {
  id: 'closest' | 'clock' | 'streak' | 'sources' | 'confirmed' | 'mix' | 'swing' | 'spread' | 'quiet' | 'busiest-day';
  /** Short label for the eyebrow, e.g. "The closest one". */
  kicker: string;
  /** The line set large: "240 m from home". */
  headline: string;
  /** One sentence of context. */
  body: string;
  /** Raw strength before rotation; higher is more telling. */
  score: number;
  visual?: AngleVisual;
}

function calgary(at: number, opts: Intl.DateTimeFormatOptions): string {
  return calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...opts }).format(new Date(at));
}

function hourOf(at: number): number {
  return Number(calgary(at, { hour: 'numeric', hour12: false })) % 24;
}

const dayLabel = (at: number) => calgary(at, { weekday: 'short' }).replace('.', '').slice(0, 3);
const longDay = (at: number) => calgary(at, { weekday: 'long' });

/** Small, stable string hash (FNV-1a), for week-by-week rotation. */
export function weekHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const dateKey = (at: number) => calgary(at, { year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * The measured window as Calgary calendar days, oldest first.
 *
 * The window runs Monday 09:00 to Monday 09:00, so it touches eight calendar
 * days. Bucketing by fixed 24-hour slices from `since` labelled each slice by
 * its midpoint, which put a report from 01:00 Monday under "Sun". Real dates
 * cost a column and are never wrong.
 */
export function weekDays(summary: Pick<DigestSummary, 'since' | 'until' | 'items'>): DayCount[] {
  const days: DayCount[] = [];
  const seen = new Set<string>();
  for (let t = summary.since; t <= summary.until + DAY_MS - 1; t += DAY_MS / 4) {
    const at = Math.min(t, summary.until);
    const key = dateKey(at);
    if (seen.has(key)) continue;
    seen.add(key);
    days.push({ label: dayLabel(at), start: at, count: 0 });
  }
  const index = new Map([...seen].map((key, i) => [key, i]));
  for (const item of summary.items) {
    const i = index.get(dateKey(item.incident.timestamp));
    if (i !== undefined) days[i].count += 1;
  }
  return days;
}

/** Longest run of consecutive days with nothing reported, and where it sits. */
function longestQuietRun(days: DayCount[]): { length: number; from: number; to: number } {
  let best = { length: 0, from: -1, to: -1 };
  let run = 0;
  days.forEach((day, i) => {
    run = day.count === 0 ? run + 1 : 0;
    if (run > best.length) best = { length: run, from: i - run + 1, to: i };
  });
  return best;
}

const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const say = (n: number) => (n >= 0 && n <= 10 ? words[n] : String(n));
const sayCap = (n: number) => say(n).replace(/^./, (c) => c.toUpperCase());

function within(summary: DigestSummary): string {
  return summary.scope === 'city' ? 'across Calgary' : summary.ringLabel;
}

/**
 * Every angle this week supports, strongest first after rotation.
 *
 * `max` caps the list; the email features the first and lists two more.
 */
export function digestAngles(summary: DigestSummary, max = 3): DigestAngle[] {
  const out: DigestAngle[] = [];
  const items: ScoredIncident[] = summary.items;
  const total = summary.total;

  if (summary.quiet) {
    const before = summary.previousTotal;
    out.push({
      id: 'quiet',
      kicker: 'A full week',
      headline: 'Nothing reported',
      body: before > 0
        ? `Last week ${say(before)} ${before === 1 ? 'report' : 'reports'} came in ${within(summary)}. This week, none did.`
        : `Seven days without a single report ${within(summary)}. Quiet is worth knowing too.`,
      score: 100,
      visual: before > 0 ? { kind: 'compare', before, after: 0, beforeLabel: 'Last week', afterLabel: 'This week' } : undefined,
    });
    return out.slice(0, max);
  }

  // ── How close the nearest one was ─────────────────────────────────────────
  const measured = items.filter((i) => i.distanceM !== null) as Array<ScoredIncident & { distanceM: number }>;
  if (measured.length) {
    const nearest = measured.reduce((a, b) => (a.distanceM <= b.distanceM ? a : b));
    const minutes = Math.max(1, Math.round(nearest.distanceM / 80));
    const metres = nearest.distanceM;
    out.push({
      id: 'closest',
      kicker: 'The closest one',
      headline: metres < 1000 ? `${Math.round(metres / 10) * 10} m from home` : `${(metres / 1000).toFixed(1)} km from home`,
      body: `“${nearest.incident.title}” was about a ${minutes}-minute walk away, on ${longDay(nearest.incident.timestamp)}.`,
      score: metres <= 300 ? 80 : metres <= 800 ? 64 : 42,
      visual: { kind: 'walk', metres, minutes },
    });
  }

  // ── When it happened ──────────────────────────────────────────────────────
  if (total >= 3) {
    const parts = [
      { label: 'Overnight', from: 0, to: 6, tone: 'soft' as const },
      { label: 'Morning', from: 6, to: 12, tone: 'gold' as const },
      { label: 'Afternoon', from: 12, to: 18, tone: 'bow' as const },
      { label: 'Evening', from: 18, to: 24, tone: 'coral' as const },
    ].map((p) => ({ ...p, count: items.filter((i) => { const h = hourOf(i.incident.timestamp); return h >= p.from && h < p.to; }).length }));
    const after = parts[0].count + parts[3].count;
    const top = parts.reduce((a, b) => (a.count >= b.count ? a : b));
    const share = top.count / total;
    if (after / total >= 0.6) {
      out.push({
        id: 'clock', kicker: 'When it happened',
        headline: 'Mostly after dark',
        body: `${after === total ? `All ${say(total)}` : `${sayCap(after)} of ${say(total)}`} reports came in between 6 p.m. and 6 a.m. A porch light and a locked car still do a lot.`,
        score: 40 + Math.round((after / total) * 30),
        visual: { kind: 'segments', parts: parts.map(({ label, count, tone }) => ({ label, count, tone })) },
      });
    } else if (share >= 0.5) {
      out.push({
        id: 'clock', kicker: 'When it happened',
        headline: `Mostly in the ${top.label.toLowerCase()}`,
        body: `${top.count === total ? `All ${say(total)}` : `${sayCap(top.count)} of ${say(total)}`} reports landed in the ${top.label.toLowerCase()}.`,
        score: 30 + Math.round(share * 30),
        visual: { kind: 'segments', parts: parts.map(({ label, count, tone }) => ({ label, count, tone })) },
      });
    }
  }

  // ── A run of quiet days ───────────────────────────────────────────────────
  const days = weekDays(summary);
  const run = longestQuietRun(days);
  if (run.length >= 3 && total > 0) {
    const span = run.length === 7 ? 'all week' : `${days[run.from].label} to ${days[run.to].label}`;
    out.push({
      id: 'streak', kicker: 'A quiet stretch',
      headline: `${sayCap(run.length)} days in a row with nothing`,
      body: `Nothing was reported ${within(summary)} from ${span}. Everything this week clustered around the other days.`,
      score: 30 + run.length * 6,
    });
  }

  // ── The busiest single day ────────────────────────────────────────────────
  const busiest = days.reduce((a, b) => (a.count >= b.count ? a : b));
  if (total >= 4 && busiest.count / total >= 0.4) {
    out.push({
      id: 'busiest-day', kicker: 'One day stood out',
      headline: `${longDay(busiest.start)} had ${say(busiest.count)}`,
      body: `That’s ${Math.round((busiest.count / total) * 100)}% of the week on a single day. The strip above shows the rest.`,
      score: 28 + Math.round((busiest.count / total) * 30),
    });
  }

  // ── Who reported it ───────────────────────────────────────────────────────
  if (total >= 2) {
    const neighbours = items.filter((i) => i.incident.data_source === 'community').length;
    const official = total - neighbours;
    if (neighbours >= 2) {
      out.push({
        id: 'sources', kicker: 'Who spoke up',
        headline: `${sayCap(neighbours)} came from neighbours`,
        body: `The other ${say(official)} came from official feeds. Neighbour reports are what make the map local, so thank you if one of them was you.`,
        score: 34 + neighbours * 4,
        visual: { kind: 'segments', parts: [{ label: 'Neighbours', count: neighbours, tone: 'gold' }, { label: 'Official feeds', count: official, tone: 'bow' }] },
      });
    } else if (official === total && total >= 3) {
      out.push({
        id: 'sources', kicker: 'Who reported it',
        headline: 'All from official feeds',
        body: `Every report ${within(summary)} came from police, 311 or 511 this week. Seen something they missed? Neighbours can add it.`,
        score: 26,
      });
    }
  }

  // ── Confirmed by neighbours ───────────────────────────────────────────────
  const confirmed = summary.highlights.reduce<ScoredIncident | null>((best, item) => (
    (item.corroborations ?? 0) >= 2 && (!best || (item.corroborations ?? 0) > (best.corroborations ?? 0)) ? item : best
  ), null);
  if (confirmed) {
    out.push({
      id: 'confirmed', kicker: 'Seen by more than one',
      headline: `${sayCap(confirmed.corroborations ?? 0)} neighbours confirmed one`,
      body: `“${confirmed.incident.title}” was confirmed by ${say(confirmed.corroborations ?? 0)} people who saw it too.`,
      score: 50 + (confirmed.corroborations ?? 0) * 3,
    });
  }

  // ── What kind of week ─────────────────────────────────────────────────────
  if (total >= 3 && summary.byCategory.length) {
    const lead = summary.byCategory.reduce((a, b) => (a.count >= b.count ? a : b));
    const share = lead.count / total;
    if (share >= 0.5) {
      const label = lead.label.toLowerCase();
      out.push({
        id: 'mix', kicker: 'What kind of week',
        headline: share === 1 ? `All ${label}` : `Mostly ${label}`,
        body: `${lead.count === total ? `All ${say(total)}` : `${sayCap(lead.count)} of ${say(total)}`} reports were ${label}. ${lead.category === 'traffic' || lead.category === 'infrastructure' ? 'Worth a look before you drive.' : 'The list below has the details.'}`,
        score: 22 + Math.round(share * 20),
      });
    }
  }

  // ── Compared with last week ───────────────────────────────────────────────
  if (!summary.widenedToCity && summary.previousTotal > 0 && Math.abs(summary.delta) >= 3) {
    const fewer = summary.delta < 0;
    out.push({
      id: 'swing', kicker: 'Compared with last week',
      headline: fewer ? `${Math.abs(summary.delta)} fewer reports` : `${summary.delta} more reports`,
      body: fewer
        ? `Down from ${summary.previousTotal} to ${total}. A calmer week ${within(summary)}.`
        : `Up from ${summary.previousTotal} to ${total}. Nothing to panic about; the list below says what it was.`,
      score: 30 + Math.min(30, Math.abs(summary.delta) * 3),
      visual: { kind: 'compare', before: summary.previousTotal, after: total, beforeLabel: 'Last week', afterLabel: 'This week' },
    });
  }

  // ── Where it landed, city-wide ────────────────────────────────────────────
  if (summary.scope === 'city' && total >= 5) {
    const areas = new Set(items.map((i) => (i.incident.neighborhood ?? '').trim().toLowerCase()).filter(Boolean)).size;
    if (areas >= 3) {
      out.push({
        id: 'spread', kicker: 'Where it landed',
        headline: `${areas} communities`,
        body: `This week’s ${total} reports were spread across ${areas} Calgary communities. Add yours and next Monday is about your blocks.`,
        score: 44,
      });
    }
  }

  const rotate = (a: DigestAngle) => a.score + (weekHash(`${summary.weekKey}:${a.id}`) % 18);
  return out.sort((a, b) => rotate(b) - rotate(a)).slice(0, max);
}

// ── Thursday ────────────────────────────────────────────────────────────────

export interface PicksGlance {
  days: DayCount[];
  free: number;
  nearby: number;
  total: number;
}

/** The next seven days as buckets of picks, plus the two numbers worth a tile. */
export function picksGlance(picks: EventPicks, list: PickItem[], at: number): PicksGlance {
  const all = [...picks.going, ...list];
  const days = Array.from({ length: 7 }, (_, d) => {
    const start = at + d * DAY_MS;
    const key = dateKey(start);
    return { label: dayLabel(start), start, count: all.filter((p) => dateKey(Date.parse(p.start)) === key).length };
  });
  return {
    days,
    free: all.filter((p) => p.free).length,
    nearby: all.filter((p) => p.distanceM !== null && p.distanceM < 3000).length,
    total: all.length,
  };
}
