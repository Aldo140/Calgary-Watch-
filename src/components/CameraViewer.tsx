import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, RefreshCw, Video, X } from 'lucide-react';
import { distanceMeters, type TrafficCamera } from '@/src/hooks/useTrafficCameras';
import { formatDistance } from '@/src/lib/format';
import { MAP } from '@/src/lib/tokens';

/**
 * What the roads actually look like, at a size worth looking at.
 *
 * Calgary publishes 211 traffic cameras and this app plotted every one of them
 * as a map pin whose picture lived inside a Leaflet popup — a ~250px thumbnail
 * floating over the map, on a phone, with the map still trying to be the
 * subject behind it. That is a demo of a data source, not a way to answer "is
 * 16th Ave moving".
 *
 * Tapping a camera now opens this instead: one large frame that fills the
 * screen's width, and — the part that makes it worth building — arrows that
 * walk you through the cameras nearest the one you opened. Checking a route
 * means looking at several intersections in sequence, and doing that by
 * dismissing a popup, panning the map, hunting the next pin and tapping again
 * is the reason nobody did it. Here it is one thumb press.
 *
 * ── On the frames ──────────────────────────────────────────────────────────
 * These are stills. The city serves them cached, so advancing the frame means
 * changing the URL — hence an explicit refresh rather than a silent poll that
 * would quietly hammer someone else's servers. No capture time is printed over
 * the image: the city does not publish one, and stamping our own fetch time on
 * their picture would claim a freshness this app cannot vouch for.
 */

/** How many neighbours to offer, and how far out to look for them. */
const NEIGHBOUR_LIMIT = 12;
const NEIGHBOUR_RADIUS_M = 6000;

export interface CameraViewerProps {
  /** The camera that was tapped, or null when the viewer is closed. */
  camera: TrafficCamera | null;
  /** Every loaded camera, used to build the walk-through order. */
  cameras: TrafficCamera[];
  onClose: () => void;
  /** Move the map to whichever camera the reader lands on. */
  onFocus?: (camera: TrafficCamera) => void;
}

export default function CameraViewer({ camera, cameras, onClose, onFocus }: CameraViewerProps) {
  const [current, setCurrent] = useState<TrafficCamera | null>(camera);
  const [nonce, setNonce] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // A newly tapped pin replaces whatever was on screen, and every frame-state
  // flag resets with it — otherwise a working image sits under a new camera's
  // name, or a previous failure suppresses one that works.
  useEffect(() => {
    setCurrent(camera);
  }, [camera]);

  useEffect(() => {
    setNonce(Date.now());
    setFailed(false);
    setLoaded(false);
  }, [current?.id]);

  /**
   * The tapped camera and its nearest neighbours, in distance order.
   *
   * Distance rather than dataset order, because "next" should mean the next
   * intersection along, not the next row in a CSV.
   */
  const walk = useMemo(() => {
    if (!camera) return [];
    return cameras
      .map((c) => ({ c, d: distanceMeters(camera.lat, camera.lng, c.lat, c.lng) }))
      .filter((x) => x.d <= NEIGHBOUR_RADIUS_M)
      .sort((a, b) => a.d - b.d)
      .slice(0, NEIGHBOUR_LIMIT)
      .map((x) => x.c);
  }, [camera, cameras]);

  const index = current ? walk.findIndex((c) => c.id === current.id) : -1;

  const step = useCallback(
    (delta: number) => {
      if (index < 0 || walk.length < 2) return;
      const next = walk[(index + delta + walk.length) % walk.length];
      setCurrent(next);
      onFocus?.(next);
    },
    [index, walk, onFocus],
  );

  const refresh = useCallback(() => {
    setNonce(Date.now());
    setFailed(false);
    setLoaded(false);
  }, []);

  // Escape closes, arrows walk. A viewer over a draggable map must never trap
  // the reader, and the close button takes focus so the keyboard starts inside.
  useEffect(() => {
    if (!current) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [current, onClose, step]);

  if (!current || typeof document === 'undefined') return null;

  const distanceFromOpened =
    camera && camera.id !== current.id
      ? distanceMeters(camera.lat, camera.lng, current.lat, current.lng)
      : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center lg:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Traffic camera at ${current.location}`}
    >
      <button
        type="button"
        aria-label="Close camera view"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: 'rgba(6,22,47,0.72)', backdropFilter: 'blur(6px)' }}
      />

      <div
        className="relative w-full max-w-xl"
        style={{ background: MAP.panel, border: `1.5px solid ${MAP.inkDeep}` }}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2.5" style={{ background: MAP.inkDeep }}>
          <span className="flex min-w-0 items-center gap-2">
            <Video size={13} className="shrink-0" style={{ color: MAP.ok }} aria-hidden="true" />
            <span className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#AFC5DF' }}>
              City of Calgary · {current.quadrant}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={refresh}
              aria-label="Load a newer frame"
              className="grid h-8 w-8 place-items-center transition-transform active:scale-90"
              style={{ color: '#AFC5DF' }}
            >
              <RefreshCw size={14} aria-hidden="true" />
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close camera view"
              className="grid h-8 w-8 place-items-center transition-transform active:scale-90"
              style={{ color: '#F2EFE8' }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </span>
        </div>

        <div className="relative aspect-[3/2] w-full overflow-hidden" style={{ background: MAP.tint }}>
          {!failed && (
            <img
              key={`${current.id}-${nonce}`}
              src={`${current.imageUrl}?t=${nonce}`}
              alt={`Live traffic camera view at ${current.location}`}
              className="h-full w-full object-cover"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
          )}
          {failed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center" style={{ color: MAP.muted }}>
              <Video size={22} aria-hidden="true" />
              <p className="text-[12.5px] font-bold" style={{ color: MAP.inkDeep }}>This camera isn’t sending a picture</p>
              <p className="font-mono text-[10px]">It may be down for maintenance — try refresh, or step to the next one</p>
            </div>
          )}
          {!failed && !loaded && <div className="absolute inset-0 animate-pulse" style={{ background: MAP.tint }} aria-hidden="true" />}

          {walk.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous nearby camera"
                className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center transition-transform active:scale-90"
                style={{ background: 'rgba(6,22,47,0.62)', color: '#F2EFE8' }}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next nearby camera"
                className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center transition-transform active:scale-90"
                style={{ background: 'rgba(6,22,47,0.62)', color: '#F2EFE8' }}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <p className="text-[15px] font-black leading-tight" style={{ color: MAP.inkDeep }}>
            {current.location}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: MAP.muted }}>
            {walk.length > 1 ? `${index + 1} of ${walk.length} nearby` : 'Nearest camera'}
            {distanceFromOpened !== null && ` · ${formatDistance(distanceFromOpened / 1000)} from where you tapped`}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
