import { memo } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CATEGORY_ICONS, type Incident } from '@/src/types';
import { MAP, categoryColor } from '@/src/lib/tokens';
import { formatDistance } from '@/src/lib/format';
import DemoBadge from '@/src/components/DemoBadge';
import { cn } from '@/src/lib/utils';

export interface IncidentRowProps {
  incident: Incident;
  /** Kilometres from the reader, or null when their location is unknown. */
  distanceKm: number | null;
  isActive: boolean;
  onSelect: (incident: Incident) => void;
}

/**
 * One incident, one row, one shape.
 *
 * This replaces the two designs the sheet used to carry — a glance row at the
 * peek snap and a full card when expanded — for the same piece of data.
 * Severity reads through the spine colour and the SOS ribbon, never through
 * height, so a wind warning and a break-in occupy the same space and the list
 * stays scannable. Description, image, reporter and verification move to
 * IncidentDetailPanel, where a reader who wants them is already headed.
 */
function IncidentRowBase({ incident, distanceKm, isActive, onSelect }: IncidentRowProps) {
  const Icon = CATEGORY_ICONS[incident.category] ?? AlertCircle;
  const colour = categoryColor(incident.category);
  const isEmergency = incident.category === 'emergency';
  const isOfficial = incident.data_source === 'official' || incident.data_source === 'system';

  const meta = [
    `${formatDistanceToNow(incident.timestamp)} ago`,
    distanceKm === null ? '' : formatDistance(distanceKm),
    incident.neighborhood || 'Calgary',
  ]
    .filter(Boolean)
    .join(' · ');

  const sourceLabel = isOfficial ? 'Official source' : 'Community report';

  return (
    <button
      type="button"
      onClick={() => onSelect(incident)}
      aria-current={isActive ? 'true' : undefined}
      className="relative mb-1.5 flex w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left transition-transform active:scale-[0.99]"
      style={{
        background: isEmergency ? `${MAP.danger}12` : MAP.panel,
        border: `1.5px solid ${isEmergency ? MAP.danger : isActive ? MAP.accent : MAP.line}`,
        boxShadow: isActive ? `0 0 0 2px ${MAP.accent}40` : undefined,
      }}
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-[3px]"
        style={{ background: colour }}
        aria-hidden="true"
      />

      <span
        className={cn('flex h-8 w-8 shrink-0 items-center justify-center', isEmergency && 'animate-pulse')}
        style={{ background: `${colour}18`, color: colour }}
      >
        <Icon size={14} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold leading-tight" style={{ color: MAP.ink }}>
          {incident.title}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px]" style={{ color: MAP.muted }}>
          {meta}
        </span>
        {incident.data_source === 'demo' && (
          <span className="mt-1 block">
            <DemoBadge size="xs" />
          </span>
        )}
      </span>

      {isEmergency && (
        <span
          className="shrink-0 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ background: MAP.danger, color: MAP.panel }}
        >
          SOS
        </span>
      )}

      {/* Filled dot for a neighbour's report, hollow for an official feed. The
          title carries the same information for anyone who cannot see shape. */}
      <span className="shrink-0" title={sourceLabel} aria-label={sourceLabel} role="img">
        <span
          className="block h-2 w-2 rounded-full"
          style={isOfficial ? { border: `1.5px solid ${MAP.muted}` } : { background: MAP.muted }}
        />
      </span>

      <ChevronRight size={14} className="shrink-0" style={{ color: MAP.muted }} aria-hidden="true" />
    </button>
  );
}

/**
 * Memoized because the sheet keeps a whole page of rows mounted at all times
 * (see MobileMapSheet — the always-mounted tree is what lets search focus run
 * synchronously inside a tap). `onSelect` must be a stable callback or this
 * does nothing.
 */
export default memo(IncidentRowBase);
