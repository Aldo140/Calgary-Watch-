import { useEffect, useId, useMemo, useState } from 'react';
import type { Incident } from '@/src/types';
import type { MapTimeWindow } from '@/src/lib/mapTimeWindow';
import { categoryColor } from '@/src/lib/tokens';
import {
  BRIEFING_WINDOW_WORD,
  emptyBriefingLine,
  shortAgo,
  summarizeNowBriefing,
} from '@/src/lib/nowBriefing';
import { cn } from '@/src/lib/utils';
import { QUADRANT_VIEW, summarizeQuadrants, type Quadrant } from '@/src/lib/cityQuadrants';
import '@/src/styles/map-feed.css';

export interface NowBriefingProps {
  incidents: Incident[];
  window: MapTimeWindow;
  /** A neighbourhood the reader picked; the headline then reads "near <area>". */
  areaName?: string;
  /** Fixed clock for tests and screenshots; otherwise the card ticks each minute. */
  now?: number;
  onSelectCategory?: (c: string) => void;
  /** The category currently filtering the feed, so its row reads as pressed. */
  selectedCategory?: string;
  className?: string;
  /** Shows the "Across Calgary" board; tapping a quadrant flies the map there. */
  onQuadrant?: (q: Quadrant) => void;
}

/**
 * "Right now in Calgary" / "Tonight near Beltline".
 *
 * One honest sentence before anything else: how many reports are in the
 * chosen window, what kind, how fresh, and who posted them. Every figure is
 * computed from the incidents passed in (see src/lib/nowBriefing.ts); an empty
 * window says so instead of reaching for reassurance.
 */
export default function NowBriefing({
  incidents,
  window,
  areaName,
  now: fixedNow,
  onSelectCategory,
  selectedCategory,
  className,
  onQuadrant,
}: NowBriefingProps) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (fixedNow !== undefined) return;
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [fixedNow]);
  const now = fixedNow ?? tick;

  const summary = useMemo(() => summarizeNowBriefing(incidents, window, now), [incidents, window, now]);
  const word = BRIEFING_WINDOW_WORD[window];
  const place = areaName?.trim() ? `near ${areaName.trim()}` : 'in Calgary';
  const headingId = useId();
  const { total, community, official } = summary;
  const communityPct = total ? Math.round((community / total) * 100) : 0;
  const quadrants = useMemo(() => summarizeQuadrants(incidents), [incidents]);
  const quadMax = Math.max(1, ...quadrants.map((q) => q.total));

  return (
    <section className={cn('lv-brief', className)} aria-labelledby={headingId}>
      <p className="lv-brief-eyebrow">
        <span className="lv-feed-pulse" aria-hidden="true" />
        Live briefing
      </p>
      <h2 id={headingId} className="lv-brief-title">
        <mark>{word}</mark> {place}
      </h2>

      {total > 0 ? (
        <>
          <p className="lv-brief-stat" aria-live="polite">
            <b>{total}</b>
            <span>
              {total === 1 ? 'report' : 'reports'} on the map
              {summary.latestTimestamp !== null && (
                <small>Latest: {shortAgo(summary.latestTimestamp, now)}</small>
              )}
            </span>
          </p>

          <ul className="lv-brief-cats" aria-label="Reports by category">
            {summary.byCategory.map((c) => {
              const pressed = selectedCategory === c.category;
              const body = (
                <>
                  <i style={{ background: categoryColor(c.category) }} aria-hidden="true" />
                  {c.label}
                  <b>{c.count}</b>
                </>
              );
              return (
                <li key={c.category}>
                  {onSelectCategory ? (
                    <button
                      type="button"
                      aria-pressed={pressed}
                      title={pressed ? 'Show every category' : `Show only ${c.label.toLowerCase()} reports`}
                      onClick={() => onSelectCategory(pressed ? 'all' : c.category)}
                    >
                      {body}
                    </button>
                  ) : (
                    <span>{body}</span>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="lv-brief-mix">
            <div className="lv-brief-bar" aria-hidden="true">
              {community > 0 && <span className="lv-brief-bar-community" style={{ width: `${communityPct}%` }} />}
              {official > 0 && <span className="lv-brief-bar-official" style={{ width: `${100 - communityPct}%` }} />}
            </div>
            <p>
              <span><i className="lv-brief-dot-community" aria-hidden="true" />{community} from neighbours</span>
              <span><i className="lv-brief-dot-official" aria-hidden="true" />{official} from public sources</span>
            </p>
          </div>
        </>
      ) : (
        <p className="lv-brief-empty" aria-live="polite">{emptyBriefingLine(window)}</p>
      )}

      {onQuadrant && !areaName && total > 0 && (
        <div className="lv-quads">
          <p className="lv-quads-head">Across Calgary <span>tap to look</span></p>
          <div className="lv-quads-grid">
            {quadrants.map((q) => (
              <button
                key={q.quadrant}
                type="button"
                className="lv-quad"
                data-q={q.quadrant}
                data-empty={q.total === 0 ? 'true' : undefined}
                onClick={() => onQuadrant(q.quadrant)}
                aria-label={`${QUADRANT_VIEW[q.quadrant].name}: ${q.total} ${q.total === 1 ? 'report' : 'reports'}, ${q.crime} crime. Show on the map`}
              >
                <span className="lv-quad-top" aria-hidden="true">
                  <b>{q.quadrant}</b>
                  <span>{q.total}</span>
                </span>
                <span className="lv-quad-bar" aria-hidden="true"><i style={{ width: `${(q.total / quadMax) * 100}%` }} /></span>
                <span className="lv-quad-sub" aria-hidden="true">
                  {q.total === 0 ? 'Nothing posted' : `${q.crime} crime · ${q.latest}`}
                </span>
              </button>
            ))}
          </div>
          <p className="lv-quads-note">More people, more posts: a busier quadrant isn't a less safe one.</p>
        </div>
      )}

      <p className="lv-brief-note">
        CalgaryWatch doesn't hear police radio. These are reports from neighbours and public sources.{' '}
        <a href="/coverage">How we count</a>
      </p>
    </section>
  );
}
