import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { X, FileText, Camera, ShieldCheck, Home, ArrowRight, Settings2, Lock } from 'lucide-react';
import { useCountUp } from '@/src/hooks/useCountUp';
import type { Incident } from '@/src/types';
import { useHomeLocation } from '@/src/hooks/useHomeLocation';
import { usePropertyAssessments } from '@/src/hooks/usePropertyAssessments';
import { distanceMeters, type TrafficCamera } from '@/src/hooks/useTrafficCameras';
import { findSafetyCamerasNear, type SafetyCamera } from '@/src/hooks/useSafetyCameras';

/**
 * The signed-in resident's own briefing.
 *
 * Everyone can open the area panel for any community. This is the one screen
 * that could only have been produced for one person, and its structure says so:
 * sections are ordered as rings measured outward from their own front door —
 * their address, a few minutes' walk, the ride to work, their community, the
 * city. The radius is the section heading, because the distance *is* the
 * information. Nothing here is a generic dashboard tile.
 *
 * Two rules the whole component follows:
 *
 *  1. It is built only from what this person chose to give us. Nothing is
 *     inferred from an IP address, a device or a browsing trail, and the
 *     footer says so, naming each input.
 *  2. A section with no data does not render. There are no zero states dressed
 *     up as insight and no "—" placeholders; an empty ring means that ring was
 *     quiet, which is itself worth showing plainly rather than padding.
 *
 * The motion carries the same idea rather than decorating it: on open the
 * masthead radar sweeps once, then the rings resolve outward in order and the
 * spine draws down between them, so the document appears to assemble from
 * their address outward. Figures count up as their ring lands. All of it is
 * gated on prefers-reduced-motion, where every element simply starts resolved.
 */

const T = {
  paper: '#F7F3EA',
  panel: '#FFFDF8',
  ink: '#1C2B3A',
  inkSoft: '#5A6B7D',
  line: '#D9D2C3',
  bow: '#2E8B7A',
  amber: '#C77F18',
  navy: '#24466B',
} as const;

const BAND = [
  { max: 0.10, label: 'Hot', color: '#DC2626' },
  { max: 0.25, label: 'High', color: '#EA580C' },
  { max: 0.50, label: 'Elevated', color: '#B8860B' },
  { max: 1.01, label: 'Calm', color: '#2E8B7A' },
] as const;

/** Rings, in metres. The walk is what people can picture; the rest follows. */
const WALK_M = 400;
const RIDE_M = 1000;

export interface BriefingAreaStats {
  crime: number;
  disorder: number;
  year: number;
  rank: number;
  count: number;
}

interface PersonalBriefingProps {
  open: boolean;
  onClose: () => void;
  displayName: string;
  /** Saved street address, or '' when they only gave a neighbourhood. */
  address: string;
  /** Resolved community name for the saved location. */
  communityName: string;
  uid: string;
  memberSince?: number;
  digestOptIn?: boolean;
  incidents: Incident[];
  areaStats: BriefingAreaStats | null;
  safetyCameras: SafetyCamera[];
  trafficCameras: TrafficCamera[];
  onOpenArea: () => void;
  onOpenSettings: () => void;
  onSelectIncident: (incident: Incident) => void;
}

function titleCase(value: string): string {
  return value.replace(/\b[\w']+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/**
 * "180 m" below a kilometre, "1.4 km" above — nobody thinks in 1,400 metres.
 *
 * Anything inside 25 m is their own address, and rounding that to "0 m" reads
 * as a broken figure rather than as the striking fact it is.
 */
export function formatDistance(metres: number): string {
  if (metres < 25) return 'at home';
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}

/** Roughly how long it takes to walk that far, at 80 m/min. */
export function walkingMinutes(metres: number): number {
  return Math.max(1, Math.round(metres / 80));
}

export function bandFor(rank: number, total: number): { label: string; color: string } {
  const pct = total > 0 ? rank / total : 1;
  return BAND.find((b) => pct <= b.max) ?? BAND[BAND.length - 1];
}

/**
 * A stable reference for this person's briefing.
 *
 * Deliberately derived from the account id rather than being random, so the
 * same person sees the same reference every time and can quote it to us. It
 * is a hash, not the id itself — the id should not be sitting on screen.
 */
export function briefingRef(uid: string, issuedAt: number): string {
  let h = 0;
  for (let i = 0; i < uid.length; i += 1) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  const day = new Date(issuedAt);
  const stamp = `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, '0')}${String(day.getDate()).padStart(2, '0')}`;
  return `CW-${stamp}-${h.toString(36).toUpperCase().padStart(5, '0').slice(-5)}`;
}

/**
 * Section heading. The radius is the label, because the distance is the point.
 *
 * `order` places the ring in the reveal sequence, so the document resolves
 * outward from the reader's address rather than appearing all at once.
 */
function Ring({
  radius, title, children, accent = T.bow, order = 0, still = false,
}: {
  radius: string; title: string; children: React.ReactNode;
  accent?: string; order?: number; still?: boolean;
}) {
  const delay = still ? 0 : 0.28 + order * 0.13;
  return (
    <motion.section
      className="relative pl-6 sm:pl-7"
      initial={still ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Spine: draws downward as the ring lands, joining it to the next. */}
      <motion.span
        aria-hidden="true"
        className="absolute left-[7px] top-3 bottom-0 w-px origin-top sm:left-[9px]"
        style={{ background: T.line }}
        initial={still ? false : { scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ delay: delay + 0.1, duration: 0.5, ease: 'easeOut' }}
      />
      <motion.span
        aria-hidden="true"
        className="absolute left-0 top-1.5 grid h-[15px] w-[15px] place-items-center rounded-full sm:left-[2px]"
        style={{ background: T.paper, border: `2px solid ${accent}` }}
        initial={still ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay, type: 'spring', stiffness: 420, damping: 18 }}
      >
        <span className="h-[3px] w-[3px] rounded-full" style={{ background: accent }} />
      </motion.span>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>
        {radius}
      </p>
      <h3 className="mt-0.5 font-display text-[1.05rem] font-extrabold tracking-[-0.01em] sm:text-[1.15rem]" style={{ color: T.ink }}>
        {title}
      </h3>
      <div className="mt-2.5 pb-7">{children}</div>
    </motion.section>
  );
}

/**
 * A single number and what it means.
 *
 * `count` animates the value up when it is a plain figure; `value` is used
 * verbatim for anything already formatted (a dollar amount, a year).
 */
function Figure({
  count, value, label, tone = T.ink, prefix = '', still = false,
}: {
  count?: number; value?: string; label: string; tone?: string; prefix?: string; still?: boolean;
}) {
  const animated = useCountUp(count ?? 0, 900, !still && count !== undefined);
  const shown = value ?? `${prefix}${(still ? (count ?? 0) : animated).toLocaleString()}`;
  return (
    <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: T.line, background: T.panel }}>
      <p className="font-display text-[1.4rem] font-extrabold leading-none tabular-nums" style={{ color: tone }}>{shown}</p>
      <p className="mt-1 text-[11px] font-semibold leading-tight" style={{ color: T.inkSoft }}>{label}</p>
    </div>
  );
}

export default function PersonalBriefing({
  open, onClose, displayName, address, communityName, uid, memberSince, digestOptIn,
  incidents, areaStats, safetyCameras, trafficCameras,
  onOpenArea, onOpenSettings, onSelectIncident,
}: PersonalBriefingProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // Everything below animates outward from the reader's address. Where motion
  // is unwelcome, every element simply starts resolved.
  const still = useReducedMotion() ?? false;
  // Frozen at open so the reference and the "issued" line do not change while
  // it is on screen.
  const issuedAtRef = useRef<number>(Date.now());
  if (!open) issuedAtRef.current = Date.now();

  const { home, isResolving } = useHomeLocation(address, open);
  const { data: propertyData } = usePropertyAssessments(open && communityName ? communityName : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  const firstName = (displayName || '').trim().split(/\s+/)[0] || 'neighbour';
  const issuedAt = issuedAtRef.current;

  /** Community reports this person filed. Their own record, not a leaderboard. */
  const myReports = useMemo(
    () => incidents.filter((i) => i.authorUid === uid).sort((a, b) => b.timestamp - a.timestamp),
    [incidents, uid],
  );

  /** Everything within a walk of their door, nearest first. */
  const nearby = useMemo(() => {
    if (!home) return [];
    return incidents
      .filter((i) => i.data_source !== 'demo' && Number.isFinite(i.lat) && Number.isFinite(i.lng))
      .map((incident) => ({ incident, distanceM: distanceMeters(home.lat, home.lng, incident.lat, incident.lng) }))
      .filter((x) => x.distanceM <= WALK_M)
      .sort((a, b) => a.distanceM - b.distanceM);
  }, [incidents, home]);

  const nearbySafety = useMemo(
    () => (home ? findSafetyCamerasNear(home.lat, home.lng, safetyCameras, RIDE_M) : []),
    [home, safetyCameras],
  );

  const nearbyTraffic = useMemo(() => {
    if (!home) return [];
    return trafficCameras
      .map((camera) => ({ camera, distanceM: distanceMeters(home.lat, home.lng, camera.lat, camera.lng) }))
      .filter((x) => x.distanceM <= RIDE_M)
      .sort((a, b) => a.distanceM - b.distanceM);
  }, [home, trafficCameras]);

  const latestValue = propertyData.length > 0 ? propertyData[propertyData.length - 1] : null;
  const band = areaStats ? bandFor(areaStats.rank, areaStats.count) : null;
  const areaLabel = communityName ? titleCase(communityName) : 'your area';

  /**
   * The one number the whole document is about, chosen by what we actually
   * know. A resolved address gives the walk; without one the community's
   * standing is the strongest true statement we can lead with.
   */
  const thesis: { figure: number; label: string } | null = home
    ? {
        figure: nearby.length,
        label: nearby.length === 0
          ? `reports inside your ${walkingMinutes(WALK_M)}-minute walk — the quietest thing this can say`
          : `report${nearby.length === 1 ? '' : 's'} inside your ${walkingMinutes(WALK_M)}-minute walk`,
      }
    : areaStats
      ? { figure: areaStats.rank, label: `of ${areaStats.count} Calgary communities by reported volume` }
      : null;
  const thesisCount = useCountUp(thesis?.figure ?? 0, 1100, !still && thesis !== null);

  if (!open) return null;

  const body = (
    <div
      className="fixed inset-0 z-[1200] flex items-stretch justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Safety briefing for ${firstName}`}
    >
      <motion.button
        type="button"
        aria-label="Close briefing"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
        style={{ background: 'rgba(12,22,33,0.55)', backdropFilter: 'blur(3px)' }}
        initial={still ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      />

      <motion.div
        className="relative flex h-full w-full max-w-[44rem] flex-col overflow-hidden shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-3xl"
        style={{ background: T.paper }}
        initial={still ? false : { opacity: 0, y: 24, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* ── Masthead ──────────────────────────────────────────────────────
            The one part of the product with this person's name printed on it.
            The radar is not decoration: it is the document's structure stated
            once, and it sweeps their address before the rings resolve. */}
        <header
          className="relative shrink-0 overflow-hidden px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-7 sm:pb-6 sm:pt-6"
          style={{ background: `linear-gradient(135deg, ${T.ink} 0%, ${T.navy} 100%)` }}
        >
          {/* The radar is the one place this document spends its boldness:
              large enough to read as the instrument the briefing is named
              after, quiet enough in opacity that the headline stays first. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-24 h-[19rem] w-[19rem] sm:-right-16 sm:-top-28 sm:h-[23rem] sm:w-[23rem]"
          >
            <svg viewBox="0 0 200 200" width="100%" height="100%" fill="none">
              <defs>
                <linearGradient id="cw-sweep" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor={T.bow} stopOpacity="0" />
                  <stop offset="100%" stopColor={T.bow} stopOpacity="0.9" />
                </linearGradient>
              </defs>
              {/* Four standing rings — the four radii the document is built from. */}
              {[28, 52, 76, 99].map((r, i) => (
                <circle key={r} cx="100" cy="100" r={r} stroke={T.bow} strokeWidth="1.25"
                  opacity={0.34 - i * 0.05} />
              ))}
              {/* Cross-hairs, so it reads as an instrument rather than a ripple. */}
              <line x1="100" y1="1" x2="100" y2="199" stroke={T.bow} strokeWidth="0.75" opacity="0.16" />
              <line x1="1" y1="100" x2="199" y2="100" stroke={T.bow} strokeWidth="0.75" opacity="0.16" />
              {/* One outward pulse per ring, staggered to match the sections. */}
              {!still && [0, 1, 2].map((i) => (
                <motion.circle
                  key={`p${i}`} cx="100" cy="100" r="28" stroke={T.bow} strokeWidth="1.5" fill="none"
                  initial={{ scale: 0.3, opacity: 0.6 }}
                  animate={{ scale: 3.6, opacity: 0 }}
                  style={{ transformOrigin: '100px 100px' }}
                  transition={{ delay: 0.15 + i * 0.5, duration: 2.2, ease: 'easeOut' }}
                />
              ))}
              {/* The sweep: two passes, then it rests. A looping radar would
                  imply the page is still working after it has finished. */}
              {!still && (
                <motion.g
                  style={{ transformOrigin: '100px 100px' }}
                  initial={{ rotate: 0 }}
                  animate={{ rotate: 720 }}
                  transition={{ duration: 2.6, ease: [0.33, 0, 0.2, 1] }}
                >
                  <motion.path
                    d="M100 100 L100 1 A99 99 0 0 1 170 30 Z"
                    fill="url(#cw-sweep)"
                    initial={{ opacity: 0.5 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 2.6, times: [0, 1], ease: 'easeIn' }}
                  />
                  <line x1="100" y1="100" x2="100" y2="1" stroke={T.bow} strokeWidth="1.75"
                    strokeLinecap="round" opacity="0.75" />
                </motion.g>
              )}
              <circle cx="100" cy="100" r="3.5" fill={T.bow} opacity="0.8" />
            </svg>
          </span>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close briefing"
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 grid h-9 w-9 place-items-center rounded-full transition-opacity hover:opacity-80 sm:right-5 sm:top-5"
            style={{ background: 'rgba(255,253,248,0.14)', color: T.paper }}
          >
            <X size={17} />
          </button>

          <motion.div
            initial={still ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: '#7FB5A6' }}>
              Prepared for you
            </p>
            <h2
              className="mt-2 font-display font-extrabold leading-[1.05] tracking-[-0.03em] pr-11"
              style={{ color: '#FFFDF8', fontSize: 'clamp(1.6rem, 6.2vw, 2.35rem)' }}
            >
              {firstName}&rsquo;s safety briefing
            </h2>
            <p className="mt-2.5 flex items-start gap-1.5 text-[12.5px] font-medium leading-snug" style={{ color: '#B9CBD8' }}>
              <Home size={13} className="mt-[2px] shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                Measured from <span className="font-bold" style={{ color: '#FFFDF8' }}>{address || areaLabel}</span>
              </span>
            </p>
          </motion.div>

          {/* The thesis: the single number this whole document is about. */}
          {thesis && (
            <motion.div
              className="mt-4 flex items-baseline gap-2.5"
              initial={still ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <span
                className="font-display font-extrabold leading-none tabular-nums"
                style={{ color: '#7FB5A6', fontSize: 'clamp(2.4rem, 10vw, 3.4rem)' }}
              >
                {still ? thesis.figure : thesisCount}
              </span>
              <span className="min-w-0 pb-1 text-[12.5px] font-semibold leading-tight" style={{ color: '#B9CBD8' }}>
                {thesis.label}
              </span>
            </motion.div>
          )}

          <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#8FA9BC' }}>
            <span>
              Issued {new Date(issuedAt).toLocaleDateString('en-CA', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <span aria-hidden="true">&middot;</span>
            <span>{briefingRef(uid, issuedAt)}</span>
          </div>
        </header>

        {/* ── Rings ─────────────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-6 sm:px-7">
          {/* Ring 1 — the walk. Only this person can see this list. */}
          {home && (
            <Ring order={0} still={still} radius={`Within ${WALK_M} m · about a ${walkingMinutes(WALK_M)}-minute walk`} title={
              nearby.length === 0
                ? 'Nothing reported on your block'
                : `${nearby.length} report${nearby.length === 1 ? '' : 's'} inside your walk`
            }>
              {nearby.length === 0 ? (
                <p className="text-[13.5px] leading-relaxed" style={{ color: T.inkSoft }}>
                  No incident in the current window sits within a few minutes&rsquo; walk of your address.
                  That is the quietest thing this briefing can tell you.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {nearby.slice(0, 5).map(({ incident, distanceM }, i) => (
                    <motion.li
                      key={incident.id}
                      initial={still ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.42 + i * 0.07, duration: 0.35, ease: 'easeOut' }}
                    >
                      <button
                        type="button"
                        onClick={() => { onSelectIncident(incident); onClose(); }}
                        className="flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:opacity-90"
                        style={{ borderColor: T.line, background: T.panel }}
                      >
                        <span
                          className="mt-[3px] shrink-0 rounded-md px-1.5 py-1 font-mono text-[10px] font-bold tabular-nums"
                          style={{ background: `${T.bow}1f`, color: '#1F6154' }}
                        >
                          {formatDistance(distanceM)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-bold leading-snug line-clamp-2" style={{ color: T.ink }}>
                            {incident.title}
                          </span>
                          <span className="block text-[11px]" style={{ color: T.inkSoft }}>
                            {titleCase(incident.category)} &middot; {formatDistanceToNow(incident.timestamp)} ago
                          </span>
                        </span>
                      </button>
                    </motion.li>
                  ))}
                  {nearby.length > 5 && (
                    <li className="pt-0.5 text-[11.5px] font-semibold" style={{ color: T.inkSoft }}>
                      and {nearby.length - 5} more within the same walk
                    </li>
                  )}
                </ul>
              )}
            </Ring>
          )}

          {/* Ring 2 — enforcement and eyes, at commuting range. */}
          {home && (nearbySafety.length > 0 || nearbyTraffic.length > 0) && (
            <Ring order={1} still={still} radius={`Within ${RIDE_M / 1000} km`} title="Cameras around you" accent={T.amber}>
              <div className="grid grid-cols-2 gap-2">
                <Figure count={nearbySafety.length} still={still} label="Safety cameras that ticket" tone={T.amber} />
                <Figure count={nearbyTraffic.length} still={still} label="Public traffic cameras" tone={T.navy} />
              </div>

              {nearbySafety.length > 0 && (
                <ul className="mt-2.5 space-y-1.5">
                  {nearbySafety.slice(0, 3).map(({ camera, distanceM }) => (
                    <li
                      key={camera.id}
                      className="flex items-start gap-2.5 rounded-xl border px-3 py-2.5"
                      style={{ borderColor: T.line, background: T.panel }}
                    >
                      <Camera size={14} className="mt-[2px] shrink-0" style={{ color: T.amber }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-bold leading-snug" style={{ color: T.ink }}>
                          {camera.intersection}
                        </span>
                        <span className="block text-[11px]" style={{ color: T.inkSoft }}>
                          {formatDistance(distanceM)} away
                          {camera.direction ? ` · watches ${camera.direction.toLowerCase()} traffic` : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                  {nearbySafety.length > 3 && (
                    <li className="pt-0.5 text-[11.5px] font-semibold" style={{ color: T.inkSoft }}>
                      and {nearbySafety.length - 3} more inside {RIDE_M / 1000} km
                    </li>
                  )}
                </ul>
              )}

              <p className="mt-2.5 text-[12px] leading-relaxed" style={{ color: T.inkSoft }}>
                Safety cameras ticket for running the red <strong style={{ color: T.ink }}>and</strong> for
                speeding through the green. Calgary does not publish mobile photo radar locations, so this is
                the fixed set only.
              </p>
            </Ring>
          )}

          {/* Ring 3 — the community. */}
          {(areaStats || latestValue) && (
            <Ring order={2} still={still} radius={communityName ? titleCase(communityName) : 'Your community'} title="How your community reads">
              {areaStats && band && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em]"
                      style={{ background: `${band.color}1f`, color: band.color }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: band.color }} />
                      {band.label}
                    </span>
                    <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color: T.inkSoft }}>
                      #{areaStats.rank} of {areaStats.count} communities by volume
                    </span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <Figure count={areaStats.crime} still={still} label={`Criminal offences · ${areaStats.year}`} />
                    <Figure count={areaStats.disorder} still={still} label={`Disorder calls · ${areaStats.year}`} />
                  </div>
                </>
              )}

              {latestValue && (
                <div className="mt-2 rounded-xl border px-3 py-2.5" style={{ borderColor: T.line, background: T.panel }}>
                  <p className="font-display text-[1.4rem] font-extrabold leading-none tabular-nums" style={{ color: T.ink }}>
                    ${Math.round(latestValue.avgValue).toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold leading-snug" style={{ color: T.inkSoft }}>
                    Average residential assessment here in {latestValue.year} &middot; {latestValue.sampleCount.toLocaleString()} properties
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => { onOpenArea(); onClose(); }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition-opacity hover:opacity-90"
                style={{ background: T.ink, color: T.paper }}
              >
                Open the full area report <ArrowRight size={14} />
              </button>
            </Ring>
          )}

          {/* Ring 4 — what they put in. */}
          <Ring order={3} still={still} radius="Your record" title={
            myReports.length === 0 ? 'You have not filed a report yet' : `${myReports.length} report${myReports.length === 1 ? '' : 's'} filed by you`
          } accent={T.navy}>
            {myReports.length === 0 ? (
              <p className="text-[13.5px] leading-relaxed" style={{ color: T.inkSoft }}>
                The map is only as good as what neighbours put into it. The next thing you notice near
                {address ? ' your address' : ' you'} is worth a minute.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {myReports.slice(0, 3).map((incident) => (
                  <li key={incident.id}>
                    <button
                      type="button"
                      onClick={() => { onSelectIncident(incident); onClose(); }}
                      className="flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:opacity-90"
                      style={{ borderColor: T.line, background: T.panel }}
                    >
                      <ShieldCheck size={14} className="mt-[3px] shrink-0" style={{ color: T.navy }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold leading-snug line-clamp-2" style={{ color: T.ink }}>{incident.title}</span>
                        <span className="block text-[11px]" style={{ color: T.inkSoft }}>
                          {formatDistanceToNow(incident.timestamp)} ago
                          {incident.report_count > 1 ? ` · ${incident.report_count} neighbours confirmed it` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {memberSince && (
              <p className="mt-2.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: T.inkSoft }}>
                Watching since {new Date(memberSince).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}
              </p>
            )}
          </Ring>

          {/* Address given but not found in the register — say so rather than
              silently dropping the two rings that depend on it. */}
          {address && !home && !isResolving && (
            <div className="mb-7 rounded-xl border px-3.5 py-3" style={{ borderColor: T.line, background: T.panel }}>
              <p className="text-[12.5px] leading-relaxed" style={{ color: T.inkSoft }}>
                We could not match <span className="font-bold" style={{ color: T.ink }}>{address}</span> to the
                city&rsquo;s property register, so the distance sections are missing. Picking your address from
                the suggestions in settings fixes it.
              </p>
            </div>
          )}

          {/* ── Provenance ───────────────────────────────────────────────────
              Naming every input is the point: it should be obvious that this
              was assembled from things they handed over, not gathered. */}
          <div className="mb-8 rounded-2xl border px-4 py-3.5" style={{ borderColor: T.line, background: T.panel }}>
            <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: T.bow }}>
              <Lock size={11} aria-hidden="true" /> How this was built
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: T.inkSoft }}>
              From three things you gave us: your name, your saved location and the reports you filed.
              Distances are worked out in your browser against the city&rsquo;s public property register —
              your coordinates are never sent to us or stored. Crime, camera and assessment figures are
              City of Calgary open data, the same numbers anyone can look up.
              {digestOptIn
                ? ' You are signed up for the weekly digest, so a shorter version of this lands in your inbox.'
                : ' You are not signed up for the weekly digest.'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={() => { onOpenSettings(); onClose(); }}
                className="inline-flex items-center gap-1.5 text-[12px] font-bold underline underline-offset-2 transition-opacity hover:opacity-70"
                style={{ color: T.ink }}
              >
                <Settings2 size={13} /> Change what you share
              </button>
              <a
                href="/privacy"
                className="inline-flex items-center gap-1.5 text-[12px] font-bold underline underline-offset-2 transition-opacity hover:opacity-70"
                style={{ color: T.ink }}
              >
                <FileText size={13} /> Privacy policy
              </a>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(body, document.body);
}

