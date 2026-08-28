import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Gauge, Navigation, ShieldCheck, TrendingDown, TrendingUp, Minus, Video, X } from 'lucide-react';
import { distanceMeters, type TrafficCamera } from '@/src/hooks/useTrafficCameras';
import { MAP, TRAFFIC_FLOW } from '@/src/lib/tokens';
import { cn } from '@/src/lib/utils';
import type { TrafficSegmentState } from '@/src/types/trafficFlow';

interface TrafficFlowPanelProps {
  segment: TrafficSegmentState | null;
  cameras: TrafficCamera[];
  onClose: () => void;
  onOpenCamera: (camera: TrafficCamera) => void;
}

function centreOf(segment: TrafficSegmentState): [number, number] {
  const point = segment.geometry[Math.floor(segment.geometry.length / 2)];
  return point ?? [0, 0];
}

function nearestCamera(segment: TrafficSegmentState, cameras: TrafficCamera[]) {
  const [lat, lng] = centreOf(segment);
  return cameras
    .map((camera) => ({ camera, distanceM: distanceMeters(lat, lng, camera.lat, camera.lng) }))
    .filter((entry) => entry.distanceM <= 1200)
    .sort((a, b) => a.distanceM - b.distanceM)[0] ?? null;
}

function sentence(value: string): string {
  return value.replace('_', ' ').replace(/^./, (character) => character.toUpperCase());
}

function relativeTime(timestamp: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'Updated just now';
  if (minutes === 1) return 'Updated 1 minute ago';
  if (minutes < 60) return `Updated ${minutes} minutes ago`;
  return `Updated ${Math.round(minutes / 60)} hours ago`;
}

export default function TrafficFlowPanel({ segment, cameras, onClose, onOpenCamera }: TrafficFlowPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!segment) return;
    closeRef.current?.focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [segment, onClose]);

  const nearby = useMemo(() => segment ? nearestCamera(segment, cameras) : null, [segment, cameras]);
  const isBaseline = segment?.mode === 'baseline';
  const visual = segment
    ? isBaseline ? TRAFFIC_FLOW.baseline[segment.demand] : TRAFFIC_FLOW.observed[segment.condition]
    : null;
  const headline = segment
    ? isBaseline ? `${sentence(segment.demand)} typical demand` : `${sentence(segment.condition)} traffic`
    : '';
  const speedRatio = segment?.averageSpeedKph !== null && segment?.averageSpeedKph !== undefined && segment.freeFlowSpeedKph
    ? Math.round((segment.averageSpeedKph / segment.freeFlowSpeedKph) * 100)
    : null;
  const TrendIcon = segment?.trend === 'improving' ? TrendingUp : segment?.trend === 'worsening' ? TrendingDown : Minus;
  const transition = reducedMotion
    ? { duration: 0.01 }
    : { duration: 0.22, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] };

  return (
    <AnimatePresence>
      {segment && visual && (
        <motion.aside
          key={segment.id}
          initial={reducedMotion ? false : isMobile ? { y: '100%', opacity: 0 } : { x: 24, opacity: 0 }}
          animate={{ x: 0, y: 0, opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : isMobile ? { y: '100%', opacity: 0 } : { x: 24, opacity: 0 }}
          transition={transition}
          className={cn(
            'fixed z-[90] flex max-h-[58dvh] flex-col overflow-hidden border-[1.5px] bg-[#FFFDF8] shadow-[0_4px_8px_rgba(11,31,51,0.22)]',
            'inset-x-0 bottom-0 border-x-0 border-b-0',
            'md:absolute md:inset-x-auto md:bottom-auto md:left-4 md:right-auto md:top-[calc(var(--cw-chrome-h,4.5rem)+1rem)] md:z-[45] md:max-h-[calc(100dvh-8rem)] md:w-[23rem] md:border-[1.5px]',
            'lg:left-auto lg:right-6 lg:top-6',
          )}
          style={{ borderColor: MAP.inkDeep, willChange: 'transform' }}
          aria-label={`Traffic information for ${segment.name}`}
          aria-describedby="traffic-flow-privacy"
        >
          <div className="flex justify-center bg-[#06162F] pt-2 md:hidden" aria-hidden="true">
            <span className="h-1 w-10 bg-[rgba(242,239,232,0.36)]" />
          </div>
          <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 bg-[#06162F] pl-4 pr-1 md:min-h-11 md:px-3">
            <span className="flex min-w-0 items-center gap-2 text-[#F2EFE8]">
              <Gauge size={16} className="shrink-0 text-[#AFC5DF]" aria-hidden="true" />
              <span className="truncate font-mono text-[11px] font-bold uppercase tracking-[0.14em]">
                {isBaseline ? 'Typical road demand' : 'Aggregate traffic flow'}
              </span>
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close traffic details"
              className="grid h-11 w-11 shrink-0 place-items-center text-[#F2EFE8] transition-colors duration-200 hover:bg-[rgba(242,239,232,0.14)] active:bg-[rgba(242,239,232,0.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#AFC5DF] md:h-9 md:w-9"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </header>

          <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 md:p-4">
            <div className="flex items-start gap-3">
              <span
                className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                style={{ background: visual.color }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <h2 className="text-pretty text-[17px] font-black leading-tight" style={{ color: MAP.inkDeep }}>{segment.name}</h2>
                <p className="mt-1 text-[13px] leading-snug md:text-[12px]" style={{ color: MAP.muted }}>
                  {isBaseline ? 'Annual average—not a live speed reading' : relativeTime(segment.updatedAt)}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 border-y py-3" style={{ borderColor: MAP.line }}>
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold" style={{ color: MAP.inkDeep }}>{headline}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[12px] md:text-[11px]" style={{ color: MAP.muted }}>
                  {!isBaseline && <TrendIcon size={13} aria-hidden="true" />}
                  {isBaseline ? 'Measured typical weekday use' : segment.trend === 'unknown' ? 'Trend not yet available' : `${sentence(segment.trend)} trend`}
                </p>
              </div>
              {!isBaseline && segment.averageSpeedKph !== null && (
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[24px] font-black leading-none" style={{ color: MAP.inkDeep }}>{Math.round(segment.averageSpeedKph)}</p>
                  <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: MAP.muted }}>km/h avg</p>
                </div>
              )}
              {isBaseline && segment.annualDailyVolume !== null && (
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[22px] font-black leading-none" style={{ color: MAP.inkDeep }}>{Math.round(segment.annualDailyVolume).toLocaleString()}</p>
                  <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: MAP.muted }}>vehicles/day</p>
                </div>
              )}
            </div>

            {!isBaseline && (
              <dl className="mt-3 hidden grid-cols-3 divide-x border-y py-2.5 md:grid" style={{ borderColor: MAP.line }}>
                <div className="px-2 first:pl-0">
                  <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: MAP.muted }}>Confidence</dt>
                  <dd className="mt-1 text-[13px] font-extrabold" style={{ color: MAP.inkDeep }}>{Math.round(segment.confidence * 100)}%</dd>
                </div>
                <div className="px-2">
                  <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: MAP.muted }}>Free flow</dt>
                  <dd className="mt-1 text-[13px] font-extrabold" style={{ color: MAP.inkDeep }}>{segment.freeFlowSpeedKph ? `${Math.round(segment.freeFlowSpeedKph)} km/h` : '—'}</dd>
                </div>
                <div className="px-2">
                  <dt className="font-mono text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: MAP.muted }}>Of normal</dt>
                  <dd className="mt-1 text-[13px] font-extrabold" style={{ color: MAP.inkDeep }}>{speedRatio === null ? '—' : `${speedRatio}%`}</dd>
                </div>
              </dl>
            )}

            <div id="traffic-flow-privacy" className="mt-3 flex items-start gap-2">
              <ShieldCheck size={15} className="mt-0.5 shrink-0" style={{ color: MAP.ok }} aria-hidden="true" />
              <p className="text-[12.5px] leading-relaxed md:text-[11px]" style={{ color: MAP.muted }}>
                {isBaseline
                  ? 'Typical road use is shown until a live aggregate provider is connected.'
                  : 'Aggregate measurements only. No individual vehicles, devices, faces, or licence plates are tracked.'}
              </p>
            </div>

            {nearby ? (
              <button
                type="button"
                onClick={() => onOpenCamera(nearby.camera)}
                className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 bg-[#06162F] px-4 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#F2EFE8] transition-[background-color,transform] duration-200 hover:bg-[#16314D] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4A90D9] md:min-h-11"
              >
                <Video size={15} aria-hidden="true" />
                Check camera · {Math.round(nearby.distanceM)} m
                <Navigation size={13} aria-hidden="true" />
              </button>
            ) : (
              <p className="mt-3 hidden text-[11px] md:block" style={{ color: MAP.muted }}>No public traffic camera is within 1.2 km of this segment.</p>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
