import { forwardRef, useLayoutEffect, useRef } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Incident } from '@/src/types';
import { buildPopupContent, reporterFirstName } from '@/src/components/map/canvas/markerKit';
import { compassFrom, distanceLabel } from '@/src/lib/nearMe';
import { getDistance } from '@/src/lib/geo';
import '@/src/styles/map-near.css';

/**
 * The report a phone reader tapped, docked at the bottom of the screen.
 *
 * On a phone the pin's popup opened over the top bar and the right rail, so
 * the title was hidden behind them. Here the card sits in the same navy dock
 * as "What's near me", and the map moves the pin into the clear space above
 * it. Swipe the card, or use the arrows, to step through the reports the map
 * is showing; each step moves the map to that pin.
 */
const ReportPeek = forwardRef<HTMLElement, {
  list: Incident[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDetails: (incident: Incident) => void;
  onArea: (neighborhood: string) => void;
  /** The map's window, as the count pill says it. */
  windowLabel: string;
  userLocation: { lat: number; lng: number } | null;
  now: number;
}>(function ReportPeek({ list, index, onIndex, onClose, onDetails, onArea, windowLabel, userLocation, now }, ref) {
  const incident = list[index];
  const hostRef = useRef<HTMLDivElement>(null);
  const dir = useRef(0);

  // The same card the desktop popup shows, so both read alike.
  useLayoutEffect(() => {
    if (!incident || !hostRef.current) return;
    hostRef.current.replaceChildren(buildPopupContent(incident, { reporterFirstName: reporterFirstName(incident) }, now));
  }, [incident, now]);

  if (!incident) return null;
  const total = list.length;
  const step = (d: number) => {
    const next = index + d;
    if (next < 0 || next >= total) return;
    dir.current = d;
    onIndex(next);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 || info.velocity.x < -400) step(1);
    else if (info.offset.x > 60 || info.velocity.x > 400) step(-1);
  };
  const away = userLocation
    ? `${distanceLabel(getDistance(userLocation.lat, userLocation.lng, incident.lat, incident.lng))} ${compassFrom(userLocation, incident)} of you`
    : null;

  return (
    <motion.section
      ref={ref}
      className="lv-nearsheet lv-peek lv-sky"
      role="dialog"
      aria-label={`Report: ${incident.title}`}
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
    >
      <div className="lv-peek-head">
        <p className="lv-nearsheet-eyebrow">
          <span>{total > 1 ? `${index + 1} of ${total}` : 'Report'}</span>
          <span aria-hidden="true">·</span>
          <span>{windowLabel}</span>
          {away && (<><span aria-hidden="true">·</span><span className="lv-peek-away">{away}</span></>)}
        </p>
        {total > 1 && (
          <span className="lv-peek-steps">
            <button type="button" className="lv-nearsheet-x" onClick={() => step(-1)} disabled={index === 0} aria-label="Previous report">
              <ChevronLeft size={18} strokeWidth={2.6} />
            </button>
            <button type="button" className="lv-nearsheet-x" onClick={() => step(1)} disabled={index === total - 1} aria-label="Next report">
              <ChevronRight size={18} strokeWidth={2.6} />
            </button>
          </span>
        )}
        <button type="button" className="lv-nearsheet-x" onClick={onClose} aria-label="Close report">
          <X size={18} strokeWidth={2.6} />
        </button>
      </div>

      <AnimatePresence initial={false} mode="popLayout" custom={dir.current}>
        <motion.div
          key={incident.id}
          className="lv-peek-card"
          custom={dir.current}
          variants={{
            enter: (d: number) => ({ x: d * 60, opacity: 0 }),
            center: { x: 0, opacity: 1 },
            exit: (d: number) => ({ x: d * -60, opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          drag={total > 1 ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.35}
          onDragEnd={onDragEnd}
        >
          <div
            ref={hostRef}
            onClick={(e) => {
              const btn = (e.target as HTMLElement).closest('button');
              if (!btn) return;
              if (btn.classList.contains('view-details-btn')) onDetails(incident);
              else if (btn.classList.contains('learn-more-btn') && incident.neighborhood) onArea(incident.neighborhood);
            }}
          />
        </motion.div>
      </AnimatePresence>

      {total > 1 && index === 0 && (
        <p className="lv-peek-hint" aria-hidden="true">Swipe the card for the next report</p>
      )}
    </motion.section>
  );
});

export default ReportPeek;
