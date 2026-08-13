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
                'inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[0.7rem] font-bold whitespace-nowrap',
                'transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500',
                active
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-500/10 text-slate-500 hover:text-slate-700 light:hover:bg-slate-200',
              )}
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
