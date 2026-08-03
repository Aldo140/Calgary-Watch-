import { cn } from '@/src/lib/utils';

/**
 * Marks an incident as an illustrative sample rather than a real report.
 *
 * Deliberately quiet but never ambiguous. Calgary Watch is a safety map —
 * someone skimming it is deciding whether a block is safe — so a sample report
 * has to be legible as a sample at a glance, in every surface it appears in,
 * without shouting over the genuine reports around it.
 *
 * The treatment is a warm amber that sits outside the incident category palette
 * (red/orange/blue/purple/green all mean something already), paired with a
 * diagonal hatch so it reads as "not real data" even in greyscale or to a
 * colour-blind user.
 */

const HATCH =
  'repeating-linear-gradient(135deg, rgba(180,83,9,0.16) 0 3px, transparent 3px 7px)';

export type DemoBadgeSize = 'xs' | 'sm' | 'md';

interface DemoBadgeProps {
  size?: DemoBadgeSize;
  /** Adds a short plain-language explanation beside the chip. */
  withCaption?: boolean;
  className?: string;
}

const SIZES: Record<DemoBadgeSize, { chip: string; dot: string; caption: string }> = {
  xs: { chip: 'text-[7.5px] px-1.5 py-[2px] gap-1 tracking-[0.16em]', dot: 'h-1 w-1', caption: 'text-[8.5px]' },
  sm: { chip: 'text-[8.5px] px-2 py-[3px] gap-1.5 tracking-[0.18em]', dot: 'h-1.5 w-1.5', caption: 'text-[9.5px]' },
  md: { chip: 'text-[10px] px-2.5 py-1 gap-1.5 tracking-[0.18em]', dot: 'h-1.5 w-1.5', caption: 'text-[11px]' },
};

export default function DemoBadge({ size = 'sm', withCaption = false, className }: DemoBadgeProps) {
  const s = SIZES[size];
  return (
    <span className={cn('inline-flex items-center gap-2 min-w-0', className)}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center rounded-full font-black uppercase leading-none',
          s.chip
        )}
        style={{
          backgroundImage: HATCH,
          backgroundColor: 'rgba(245,158,11,0.14)',
          border: '1px solid rgba(180,83,9,0.45)',
          color: '#92400E',
        }}
      >
        <span className={cn('rounded-full', s.dot)} style={{ background: '#B45309' }} aria-hidden="true" />
        Example
      </span>
      {withCaption && (
        <span className={cn('font-medium truncate', s.caption)} style={{ color: '#8A7A5E' }}>
          Sample report — shows how reporting works
        </span>
      )}
      {/* Screen readers get the full meaning regardless of which variant renders. */}
      <span className="sr-only">
        This is an example report published by Calgary Watch to demonstrate the app. It is not a real
        incident and is excluded from all safety statistics.
      </span>
    </span>
  );
}
