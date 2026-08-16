/**
 * Time window control for the incident feed.
 *
 * The map already decays community reports after 24 hours, but the feed showed
 * everything it had loaded, so a collision from twenty minutes ago sat in the
 * same list as a road restriction from six days ago with nothing to separate
 * them. Timestamps were on every record and simply unused.
 *
 * This narrows data the client already holds — no extra requests, no change to
 * ingest or to what the map itself renders. It defaults to "all" so the feed
 * opens exactly as it did before and the reader chooses to narrow.
 */

import { Clock } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export type TimeWindow = '24h' | '7d' | 'all';

const OPTIONS: { id: TimeWindow; label: string; hint: string }[] = [
  { id: '24h', label: 'Today', hint: 'Reports from the last 24 hours' },
  { id: '7d', label: 'This week', hint: 'Reports from the last 7 days' },
  { id: 'all', label: 'All', hint: 'Everything currently loaded' },
];

export function TimeWindowFilter({
  value,
  onChange,
  counts,
  className,
}: {
  value: TimeWindow;
  onChange: (v: TimeWindow) => void;
  /** Optional per-window totals, shown so the choice is informed rather than blind. */
  counts?: Partial<Record<TimeWindow, number>>;
  className?: string;
}) {
  return (
    <div
      className={cn('flex items-center gap-1.5 min-w-0', className)}
      role="group"
      aria-label="Filter reports by time"
    >
      <Clock size={13} className="shrink-0 text-slate-500" aria-hidden />
      <div className="flex gap-1 min-w-0">
        {OPTIONS.map((o) => {
          const active = value === o.id;
          const count = counts?.[o.id];
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              title={o.hint}
              aria-pressed={active}
              className={cn(
                // Square, mono, wide-tracked — these sat next to the squared
                // feed chips as the only rounded controls left on the rail.
                'inline-flex items-center gap-1.5 h-7 px-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] whitespace-nowrap',
                'transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#4A90D9]',
              )}
              style={
                // Explicit colours, not `bg-slate-900 text-white`: index.css
                // remaps both of those to light values, so the "active" pill
                // would render dark-on-cream and read as unselected.
                active
                  ? { background: '#06162F', color: '#F7F3EA' }
                  : { background: '#EDE7DA', color: '#5A5247' }
              }
            >
              {o.label}
              {count !== undefined && (
                <span className={cn('tabular-nums', active ? 'opacity-80' : 'opacity-60')}>{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
