import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Gauge, Navigation, ShieldCheck, TrendingDown, TrendingUp, Minus, Video, X } from 'lucide-react';
import { distanceMeters, type TrafficCamera } from '@/src/hooks/useTrafficCameras';
import { TRAFFIC_FLOW } from '@/src/lib/tokens';
import '@/src/styles/map-overlays.css';
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
            'lv-o lv-tf fixed z-[90] flex max-h-[62dvh] flex-col overflow-hidden',
            'inset-x-0 bottom-0',
            'md:absolute md:inset-x-auto md:bottom-auto md:left-4 md:right-auto md:top-[calc(var(--cw-chrome-h,4.5rem)+1rem)] md:z-[45] md:max-h-[calc(100dvh-8rem)] md:w-[24rem]',
            'lg:left-auto lg:right-6 lg:top-[calc(var(--cw-chrome-h,4.5rem)+4rem)]',
          )}
          style={{ willChange: 'transform' }}
          aria-label={`Traffic information for ${segment.name}`}
          aria-describedby="traffic-flow-privacy"
        >
          <div className="lv-o-grabber md:hidden" aria-hidden="true"><span /></div>
          <header className="lv-tf-head">
            <span className="lv-tf-src">
              <span aria-hidden="true"><Gauge size={17} /></span>
              <span>{isBaseline ? 'Typical road demand' : 'Aggregate traffic flow'}</span>
            </span>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close traffic details" className="lv-o-iconbtn">
              <X size={19} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </header>

          <div className="lv-tf-body overflow-y-auto">
            <div className="lv-tf-road">
              <span className="lv-tf-swatch" style={{ background: visual.color }} aria-hidden="true" />
              <div className="min-w-0">
                <h2>{segment.name}</h2>
                <p>{isBaseline ? 'Annual average—not a live speed reading' : relativeTime(segment.updatedAt)}</p>
              </div>
            </div>

            <div className="lv-tf-stat">
              <div className="min-w-0">
                <b>{headline}</b>
                <small>
                  {!isBaseline && <TrendIcon size={14} aria-hidden="true" />}
                  {isBaseline ? 'Measured typical weekday use' : segment.trend === 'unknown' ? 'Trend not yet available' : `${sentence(segment.trend)} trend`}
                </small>
              </div>
              {!isBaseline && segment.averageSpeedKph !== null && (
                <div className="lv-tf-num">
                  <strong>{Math.round(segment.averageSpeedKph)}</strong>
                  <span>km/h avg</span>
                </div>
              )}
              {isBaseline && segment.annualDailyVolume !== null && (
                <div className="lv-tf-num">
                  <strong>{Math.round(segment.annualDailyVolume).toLocaleString()}</strong>
                  <span>vehicles/day</span>
                </div>
              )}
            </div>

            {!isBaseline && (
              <dl className="lv-tf-grid hidden md:grid">
                <div>
                  <dt>Confidence</dt>
                  <dd>{Math.round(segment.confidence * 100)}%</dd>
                </div>
                <div>
                  <dt>Free flow</dt>
                  <dd>{segment.freeFlowSpeedKph ? `${Math.round(segment.freeFlowSpeedKph)} km/h` : '—'}</dd>
                </div>
                <div>
                  <dt>Of normal</dt>
                  <dd>{speedRatio === null ? '—' : `${speedRatio}%`}</dd>
                </div>
              </dl>
            )}

            <div id="traffic-flow-privacy" className="lv-tf-privacy">
              <ShieldCheck size={16} aria-hidden="true" />
              <p>
                {isBaseline
                  ? 'Typical road use is shown until a live aggregate provider is connected.'
                  : 'Aggregate measurements only. No individual vehicles, devices, faces, or licence plates are tracked.'}
              </p>
            </div>

            {nearby ? (
              <button type="button" onClick={() => onOpenCamera(nearby.camera)} className="lv-o-btn lv-o-btn-blue lv-tf-cam">
                <Video size={18} aria-hidden="true" />
                Check camera · {Math.round(nearby.distanceM)} m
                <Navigation size={15} aria-hidden="true" />
              </button>
            ) : (
              <p className="lv-tf-none">No public traffic camera is within 1.2 km of this segment.</p>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
