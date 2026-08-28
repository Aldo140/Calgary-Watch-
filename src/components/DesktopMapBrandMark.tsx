import { MapPinned } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface DesktopMapBrandMarkProps {
  compact?: boolean;
  tone?: 'dark' | 'light';
}

/**
 * A small-format mark for the desktop map chrome. The full Calgary illustration
 * is intentionally not used here: its skyline, tower and plane collapse into
 * noise below roughly 40px. This mark keeps the product's two useful signals —
 * place and live status — legible at toolbar scale.
 */
export default function DesktopMapBrandMark({ compact = false, tone = 'light' }: DesktopMapBrandMarkProps) {
  const dark = tone === 'dark';

  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative grid shrink-0 place-items-center',
        compact ? 'size-9' : 'size-12',
        dark ? 'bg-[#F2EFE8] text-[#06162F]' : 'bg-[#06162F] text-[#F2EFE8]',
      )}
    >
      <MapPinned size={compact ? 18 : 23} strokeWidth={2.25} />
      <span
        className={cn(
          'absolute bottom-0 right-0 bg-[#2E8B7A]',
          compact ? 'size-2 border-2 border-[#FFFDF8]' : 'size-2.5 border-[3px] border-[#06162F]',
        )}
      />
    </span>
  );
}
