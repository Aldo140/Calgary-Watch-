/**
 * Time window control for the incident feed: Tonight · 24h · Yesterday ·
 * 7 days · All.
 *
 * The windows follow the Calgary clock (see src/lib/mapTimeWindow.ts), so
 * "Tonight" and "Yesterday" mean what a resident means by them. This narrows
 * data the client already holds: no extra requests, no change to ingest.
 *
 * Rendered as one segmented pill group, sentence case, in the site's collage
 * language: 2px ink outline, yellow for the chosen window.
 */

import { MAP_TIME_WINDOWS, type MapTimeWindow } from '@/src/lib/mapTimeWindow';
import { cn } from '@/src/lib/utils';
import '@/src/styles/map-feed.css';

/** Kept for existing importers; the feed and the map share one window type now. */
export type TimeWindow = MapTimeWindow;

export function TimeWindowFilter({
  value,
  onChange,
  counts,
  className,
  tone = 'paper',
}: {
  value: TimeWindow;
  onChange: (v: TimeWindow) => void;
  /** Optional per-window totals, shown so the choice is informed rather than blind. */
  counts?: Partial<Record<TimeWindow, number>>;
  className?: string;
  /** `navy` when the control sits on the live-sky masthead. */
  tone?: 'paper' | 'navy';
}) {
  return (
    <div
      className={cn('lv-tw', tone === 'navy' && 'lv-tw--navy', className)}
      role="group"
      aria-label="Filter reports by time"
    >
      {MAP_TIME_WINDOWS.map((o) => {
        const active = value === o.id;
        const count = counts?.[o.id];
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            title={o.hint}
            aria-pressed={active}
            className="lv-tw-opt"
          >
            {o.short}
            {count !== undefined && <span className="lv-tw-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
