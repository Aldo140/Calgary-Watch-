import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, ArrowRight, ArrowUpRight, Mail, Navigation, Plus, X } from 'lucide-react';
import { CATEGORY_ICONS } from '@/src/types';
import { categoryColor } from '@/src/lib/tokens';
import { shortAgo } from '@/src/lib/nowBriefing';
import { categoryMix, distanceLabel, NEAR_ME_RADIUS_KM, type NearIncident } from '@/src/lib/nearMe';
import '@/src/styles/map-near.css';

const CATEGORY_WORD: Record<string, string> = {
  emergency: 'Emergency', crime: 'Crime', traffic: 'Traffic', infrastructure: 'Infrastructure', weather: 'Weather',
};

/**
 * "What's near me", in the same navy as the bar and the sheet it replaces.
 *
 * On phones it takes the bottom of the screen (the report sheet steps aside
 * while it is open) and the map above it shows a 3 km ring around the
 * reader's pin. The count follows the map's own time window and type chips,
 * so it never disagrees with them. The card in view is ringed on the map with
 * a thread back to the reader's pin; swiping moves the ring, tapping the card
 * opens the report. On desktop it is a card at the bottom left.
 */
const NearMeSheet = forwardRef<HTMLElement, {
  reports: NearIncident[];
  /** False when location is off and distances are measured from downtown. */
  located: boolean;
  /** The map's window, as the count pill says it: "24h", "All loaded". */
  windowLabel: string;
  /** The map's category chip when one is on. */
  category: string;
  onClose: () => void;
  onOpenReport: (incident: NearIncident) => void;
  /** The card in view changed; the map marks that report. */
  onFocus: (index: number) => void;
  onPost: () => void;
  briefing?: { address: string; onOpen: () => void };
  digest?: { action: string; onOpen: () => void };
  now: number;
  /** Reports are still loading (slow connection): don't call the area quiet yet. */
  loading?: boolean;
}>(function NearMeSheet({
  reports, located, windowLabel, category, onClose, onOpenReport, onFocus, onPost, briefing, digest, now, loading = false,
}, ref) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const mix = categoryMix(reports);
  const total = reports.length;
  const kind = category !== 'all' ? `${(CATEGORY_WORD[category] ?? category).toLowerCase()} ` : '';

  useEffect(() => { onFocus(active); }, [active, onFocus]);
  // A new list (filter or window changed) starts again at the first card.
  useEffect(() => {
    setActive(0);
    trackRef.current?.scrollTo({ left: 0 });
  }, [reports.length, category, windowLabel]);

  const onScroll = useCallback(() => {
    const t = trackRef.current;
    const first = t?.firstElementChild as HTMLElement | null;
    if (!t || !first) return;
    const step = first.offsetWidth + 10;
    const i = Math.min(total - 1, Math.max(0, Math.round(t.scrollLeft / step)));
    setActive((prev) => (prev === i ? prev : i));
  }, [total]);

  const goTo = (i: number) => {
    const t = trackRef.current;
    const card = t?.children[i] as HTMLElement | undefined;
    if (t && card) t.scrollTo({ left: card.offsetLeft - t.offsetLeft - 16, behavior: 'smooth' });
  };

  return (
    <motion.section
      ref={ref}
      className="lv-nearsheet lv-sky"
      role="dialog"
      aria-label="What's near me"
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 260 }}
    >
      <div className="lv-nearsheet-head">
        <span className="lv-nearsheet-you" aria-hidden="true"><i /></span>
        <div className="min-w-0 flex-1">
          <p className="lv-nearsheet-eyebrow">
            <Navigation size={11} strokeWidth={2.8} aria-hidden="true" />
            <span>{located ? `${NEAR_ME_RADIUS_KM} km around you` : `${NEAR_ME_RADIUS_KM} km around downtown`}</span>
            <span aria-hidden="true">·</span>
            <span>{windowLabel}</span>
          </p>
          <h2 className="lv-nearsheet-title">
            {total === 0 && loading ? 'Checking nearby…' : total === 0 ? `No ${kind}reports nearby` : `${total} ${kind}report${total === 1 ? '' : 's'} nearby`}
          </h2>
        </div>
        <button type="button" className="lv-nearsheet-x" onClick={onClose} aria-label="Close what's near me">
          <X size={18} strokeWidth={2.6} />
        </button>
      </div>

      {total > 0 && (
        <div className="lv-nearsheet-mix" role="img" aria-label={mix.map((m) => `${m.count} ${CATEGORY_WORD[m.category] ?? m.category}`).join(', ')}>
          <span className="lv-nearsheet-bar" aria-hidden="true">
            {mix.map((m) => (
              <i key={m.category} style={{ flexGrow: m.count, background: categoryColor(m.category) }} />
            ))}
          </span>
          <span className="lv-nearsheet-legend" aria-hidden="true">
            {mix.slice(0, 3).map((m) => (
              <span key={m.category}><i style={{ background: categoryColor(m.category) }} />{m.count} {CATEGORY_WORD[m.category] ?? m.category}</span>
            ))}
          </span>
        </div>
      )}

      {!located && (
        <p className="lv-nearsheet-note">Location is off, so this measures from downtown. Allow location in your browser to measure from you.</p>
      )}

      {total === 0 && loading ? (
        <div className="lv-nearsheet-empty"><p>Reports are still loading. This fills in as soon as they arrive.</p></div>
      ) : total === 0 ? (
        <div className="lv-nearsheet-empty">
          <p>Nothing on the map within {NEAR_ME_RADIUS_KM} km{kind ? ` for ${kind.trim()}` : ''} in this window. A quiet map is normal, and it isn&rsquo;t proof nothing happened.</p>
          <button type="button" className="lv-nearsheet-cta" onClick={onPost}>
            <Plus size={16} strokeWidth={2.8} /> Post what you see
          </button>
        </div>
      ) : (
        <div className="lv-nearsheet-track" ref={trackRef} onScroll={onScroll}>
          {reports.map((r, i) => {
            const Icon = CATEGORY_ICONS[r.category] ?? AlertCircle;
            return (
              <button
                key={r.id}
                type="button"
                className="lv-nearcard"
                data-active={i === active || undefined}
                style={{ ['--c' as string]: categoryColor(r.category) }}
                onClick={() => (i === active ? onOpenReport(r) : goTo(i))}
                aria-label={`${i + 1} of ${total}: ${r.title}, ${distanceLabel(r._dist)} ${r._dir}. Open report`}
              >
                <span className="lv-nearcard-top">
                  <span className="lv-nearcard-n" aria-hidden="true"><Icon size={13} strokeWidth={2.6} /></span>
                  <span className="lv-nearcard-cat">{CATEGORY_WORD[r.category] ?? r.category}</span>
                  <span className="lv-nearcard-age">{shortAgo(r.timestamp, now)}</span>
                </span>
                <span className="lv-nearcard-title">{r.title}</span>
                <span className="lv-nearcard-foot">
                  <span className="lv-nearcard-dist"><b>{distanceLabel(r._dist)}</b> {r._dir}{r.neighborhood ? ` · ${r.neighborhood}` : ''}</span>
                  <ArrowUpRight size={16} strokeWidth={2.6} aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {(total > 1 || briefing || digest) && (
        <div className="lv-nearsheet-foot">
          {total > 1 && (
            <span className="lv-nearsheet-dots" aria-hidden="true">
              {reports.slice(0, 8).map((r, i) => <i key={r.id} data-on={i === active || undefined} />)}
              {total > 8 && <em>+{total - 8}</em>}
            </span>
          )}
          {briefing ? (
            <button type="button" className="lv-nearsheet-link" onClick={briefing.onOpen} title={`Measured from ${briefing.address}`}>
              My briefing <ArrowRight size={13} strokeWidth={2.8} />
            </button>
          ) : digest ? (
            <button type="button" className="lv-nearsheet-link" onClick={digest.onOpen}>
              <Mail size={13} strokeWidth={2.6} /> Weekly email · {digest.action}
            </button>
          ) : null}
        </div>
      )}
    </motion.section>
  );
});

export default NearMeSheet;
