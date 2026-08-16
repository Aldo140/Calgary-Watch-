import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { X, FileText, Camera, Video, Home, ArrowRight, Settings2, Compass, Sparkles } from 'lucide-react';
import type { Incident } from '@/src/types';
import { useHomeLocation } from '@/src/hooks/useHomeLocation';
import { usePropertyAssessments } from '@/src/hooks/usePropertyAssessments';
import { distanceMeters, type TrafficCamera } from '@/src/hooks/useTrafficCameras';
import { findSafetyCamerasNear, type SafetyCamera } from '@/src/hooks/useSafetyCameras';
import { useTrafficVolumes, volumeAt } from '@/src/hooks/useTrafficVolumes';
import { useCountUp } from '@/src/hooks/useCountUp';
import { publicAsset } from '@/src/lib/utils';
import BriefingRadar, { bearingDegrees, type RadarPoint } from '@/src/components/BriefingRadar';
import BriefingSparkline from '@/src/components/BriefingSparkline';

/**
 * What one neighbour's corner of Calgary looks like this week.
 *
 * ── On the design ──────────────────────────────────────────────────────────
 * This screen used to be a dossier: navy, radar, "issued", a reference code.
 * Professional, and completely wrong for what Calgary Watch is. Nobody joins a
 * neighbourhood watch to receive intelligence briefings; they join because they
 * live somewhere and want to know how it is doing. The tone now matches that —
 * a greeting, plain sentences, and their own name at the top.
 *
 * The material is Calgary's. The city built its schools, courthouse and city
 * hall out of Paskapoo sandstone and called itself the Sandstone City, so the
 * page is set on sandstone with foothill green and a warm gold rule rather
 * than on the cream-and-terracotta that any city would get. Ranges are stated
 * in the city's own terms — a fifteen-minute walk, your community, your part in
 * it — instead of in radii.
 *
 * ── Two rules the content follows ──────────────────────────────────────────
 *  1. Built only from what this person chose to give us: their name, their
 *     saved location, and the reports they filed. Nothing is inferred from an
 *     IP address, a device or a browsing trail, and the closing note names each
 *     input so the claim can be checked rather than trusted.
 *  2. A section with no data does not render. No zero states dressed as
 *     insight, no "—" placeholders. A quiet week is worth saying plainly.
 */

const T = {
  page: '#F5EFE4',
  card: '#FFFCF6',
  ink: '#2A2420',
  soft: '#6E6357',
  line: '#E4DACA',
  edge: '#D6C9B4',
  teal: '#2E8B7A',
  deep: '#1F3D37',
  deep2: '#2F5F52',
  gold: '#B0793C',
  clay: '#B0503A',
} as const;

/**
 * A fifteen-minute walk, at a comfortable 80 m a minute.
 *
 * The ring was five minutes, which on most Calgary blocks caught the houses
 * either side and nothing else. Fifteen minutes is the distance people
 * actually think of as "round here" — the walk to the shops, the school, the
 * station — and it is the same span the fifteen-minute-neighbourhood idea uses.
 */
export const WALK_M = 1200;
export const WALK_MIN = 15;

/** The wider sweep the map's locate button flips through. */
export const NEARBY_KM = 3;

/**
 * How far out to look, in order, until there is something to say.
 *
 * A fifteen-minute walk is the ring people care about, but plenty of Calgary
 * addresses are genuinely quiet at that range — a real one tested here had
 * nothing inside 1.2 km and four things between 2.2 and 2.8. Leading with "0"
 * there is accurate and useless: it reports the radius we chose rather than
 * the neighbourhood they live in.
 *
 * So the page widens until it finds something and says which ring it used. The
 * number at the top always describes what is actually shown below it.
 */
export const RINGS: ReadonlyArray<{ metres: number; label: string }> = [
  { metres: WALK_M, label: `within a ${WALK_MIN}-minute walk` },
  { metres: 3_000, label: 'within 3 km' },
  { metres: 10_000, label: 'within 10 km' },
];

/**
 * The first ring holding anything, with what is in it.
 *
 * Falls back to the widest ring when everything is empty, so the caller always
 * has a radius to draw and a phrase to print.
 */
export function selectRing<T extends { distanceM: number }>(
  items: T[],
  rings: ReadonlyArray<{ metres: number; label: string }> = RINGS,
): { metres: number; label: string; items: T[]; widened: boolean } {
  for (let i = 0; i < rings.length; i += 1) {
    const inRing = items.filter((x) => x.distanceM <= rings[i].metres);
    if (inRing.length > 0 || i === rings.length - 1) {
      return { ...rings[i], items: inRing, widened: i > 0 };
    }
  }
  const last = rings[rings.length - 1];
  return { ...last, items: [], widened: true };
}

const BAND = [
  { max: 0.10, label: 'Busy', color: '#B0503A' },
  { max: 0.25, label: 'Above average', color: '#C0762A' },
  { max: 0.50, label: 'Middling', color: '#8A7430' },
  { max: 1.01, label: 'Quiet', color: '#2E8B7A' },
] as const;

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
  photoURL?: string;
  address: string;
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
  /** Opens the map's 3 km flip-through, which this page links out to. */
  onOpenNearby: () => void;
}

function titleCase(value: string): string {
  return value.replace(/\b[\w']+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** "180 m" below a kilometre, "1.4 km" above. Under 25 m is their own door. */
export function formatDistance(metres: number): string {
  if (metres < 25) return 'at home';
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}

/** Roughly how long it takes to walk that far, at 80 m a minute. */
export function walkingMinutes(metres: number): number {
  return Math.max(1, Math.round(metres / 80));
}

/**
 * Where a report came from.
 *
 * The walk section counts every source the map carries — neighbours, Calgary
 * Police, 311, 511 Alberta, ENMAX — but the headline used to call all of it
 * "things your neighbours reported", which was both wrong and made a busy
 * block look empty. Naming the source per row shows the mix instead of hiding
 * it, and is what makes an official record readable as official.
 *
 * Reporter names are deliberately not used here. They are on the public map
 * already, but a page addressed to one person listing their neighbours by name
 * reads very differently, and adds nothing.
 */
export function sourceLabel(incident: Pick<Incident, 'data_source' | 'source_name'>): string {
  if (incident.data_source === 'community') return 'A neighbour';
  return incident.source_name?.trim() || 'City of Calgary';
}

export function bandFor(rank: number, total: number): { label: string; color: string } {
  const pct = total > 0 ? rank / total : 1;
  return BAND.find((b) => pct <= b.max) ?? BAND[BAND.length - 1];
}

/**
 * A stable reference for this person's page.
 *
 * Derived from the account id rather than random, so the same person sees the
 * same reference and can quote it to us. It is a hash, not the id — the id
 * should not be sitting on screen.
 */
export function briefingRef(uid: string, issuedAt: number): string {
  let h = 0;
  for (let i = 0; i < uid.length; i += 1) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  const day = new Date(issuedAt);
  const stamp = `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, '0')}${String(day.getDate()).padStart(2, '0')}`;
  return `CW-${stamp}-${h.toString(36).toUpperCase().padStart(5, '0').slice(-5)}`;
}

/** Greets by the clock, because a person reading this is having a day. */
export function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/**
 * A section of the page.
 *
 * Sections are separated by a rule with a small gold mark rather than strung
 * on a vertical spine. The spine made the page read as an instrument readout;
 * a rule reads as a printed page, which is what this is.
 */
function Section({
  eyebrow, title, children, order = 0, still = false,
}: {
  eyebrow: string; title: string; children: React.ReactNode; order?: number; still?: boolean;
}) {
  const delay = still ? 0 : 0.2 + order * 0.11;
  return (
    <motion.section
      className="relative pt-7 first:pt-1"
      initial={still ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center gap-2.5">
        <span className="h-[3px] w-[18px] shrink-0" style={{ background: T.gold }} aria-hidden="true" />
        <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ color: T.gold }}>
          {eyebrow}
        </span>
        {/* The rule carries the eyebrow across the column, the way the map's
            panels do it, so a section reads as a band rather than a paragraph. */}
        <span className="h-px flex-1" style={{ background: T.line }} aria-hidden="true" />
      </div>
      <h3
        className="mt-2 font-display text-[1.3rem] font-extrabold leading-tight tracking-[-0.02em] sm:text-[1.5rem]"
        style={{ color: T.ink }}
      >
        {title}
      </h3>
      <div className="mt-3.5">{children}</div>
    </motion.section>
  );
}

function Stat({
  count, value, label, tone = T.ink, still = false,
}: {
  count?: number; value?: string; label: string; tone?: string; still?: boolean;
}) {
  const animated = useCountUp(count ?? 0, 900, !still && count !== undefined);
  const shown = value ?? (still ? (count ?? 0) : animated).toLocaleString();
  return (
    <div className="px-3.5 py-3" style={{ background: T.card, border: `1px solid ${T.line}` }}>
      <p className="font-display text-[1.5rem] font-extrabold leading-none tabular-nums" style={{ color: tone }}>
        {shown}
      </p>
      <p className="mt-1.5 text-[11.5px] font-semibold leading-tight" style={{ color: T.soft }}>{label}</p>
    </div>
  );
}

/** A report, as a row you can open. */
function ReportRow({
  incident, badge, sub, icon, onOpen, index = 0, still = false,
}: {
  incident: Incident; badge?: string; sub: string; icon?: React.ReactNode;
  onOpen: () => void; index?: number; still?: boolean;
}) {
  return (
    <motion.li
      initial={still ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: still ? 0 : 0.42 + index * 0.06, duration: 0.34, ease: 'easeOut' }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:opacity-90"
        style={{ background: T.card, border: `1px solid ${T.line}` }}
      >
        {badge !== undefined ? (
          <span
            className="mt-[2px] shrink-0 rounded-lg px-2 py-1 font-mono text-[10px] font-bold tabular-nums"
            style={{ background: 'rgba(46,139,122,0.12)', color: '#1F6154' }}
          >
            {badge}
          </span>
        ) : icon}
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold leading-snug line-clamp-2" style={{ color: T.ink }}>
            {incident.title}
          </span>
          <span className="mt-0.5 block text-[11.5px]" style={{ color: T.soft }}>{sub}</span>
        </span>
      </button>
    </motion.li>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function PersonalBriefing({
  open, onClose, displayName, photoURL, address, communityName, uid, memberSince, digestOptIn,
  incidents, areaStats, safetyCameras, trafficCameras,
  onOpenArea, onOpenSettings, onSelectIncident, onOpenNearby,
}: PersonalBriefingProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const issuedAtRef = useRef<number>(Date.now());
  if (!open) issuedAtRef.current = Date.now();

  const still = useReducedMotion() ?? false;
  const { home, isResolving } = useHomeLocation(address, open);
  const { data: propertyData } = usePropertyAssessments(open && communityName ? communityName : null);
  const volumes = useTrafficVolumes(open);

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
  const areaLabel = communityName ? titleCase(communityName) : 'your area';

  const myReports = useMemo(
    () => incidents.filter((i) => i.authorUid === uid).sort((a, b) => b.timestamp - a.timestamp),
    [incidents, uid],
  );

  /**
   * Every report the map carries, by distance from their door.
   *
   * Deliberately not restricted to community posts: police records, 311
   * service requests, 511 road closures and utility outages are all things
   * happening on their street, and excluding them is what made this section
   * read empty on a block that plainly was not.
   */
  const byDistance = useMemo(() => {
    if (!home) return [];
    return incidents
      .filter((i) => i.data_source !== 'demo' && Number.isFinite(i.lat) && Number.isFinite(i.lng))
      .map((incident) => ({ incident, distanceM: distanceMeters(home.lat, home.lng, incident.lat, incident.lng) }))
      .sort((a, b) => a.distanceM - b.distanceM);
  }, [incidents, home]);

  /** The tightest ring that actually has something in it. */
  const ring = useMemo(() => selectRing(byDistance), [byDistance]);
  const nearby = ring.items;

  const radarPoints = useMemo<RadarPoint[]>(() => {
    if (!home) return [];
    return nearby.map(({ incident, distanceM }) => ({
      incident, distanceM,
      bearing: bearingDegrees(home.lat, home.lng, incident.lat, incident.lng),
    }));
  }, [home, nearby]);

  const nearbySafety = useMemo(
    () => (home ? findSafetyCamerasNear(home.lat, home.lng, safetyCameras, WALK_M) : []),
    [home, safetyCameras],
  );

  const nearbyTraffic = useMemo(() => {
    if (!home) return [];
    return trafficCameras
      .map((camera) => ({ camera, distanceM: distanceMeters(home.lat, home.lng, camera.lat, camera.lng) }))
      .filter((x) => x.distanceM <= WALK_M)
      .sort((a, b) => a.distanceM - b.distanceM);
  }, [home, trafficCameras]);

  const latestValue = propertyData.length > 0 ? propertyData[propertyData.length - 1] : null;
  const band = areaStats ? bandFor(areaStats.rank, areaStats.count) : null;

  /**
   * The one number this page is about.
   *
   * While a saved address is still resolving there is no honest headline yet,
   * so it shows nothing rather than flashing the community rank and then
   * replacing it with a count of reports. The two mean entirely different
   * things and swapping one for the other mid-read is worse than a beat of
   * blank space.
   */
  const addressPending = Boolean(address) && !home && isResolving;
  /**
   * A giant "0" reads as a broken widget rather than as good news, so the
   * all-clear is a sentence instead of a figure.
   */
  const allClear = Boolean(home) && nearby.length === 0;
  const headline: { figure: number; label: string; sub: string } | null = addressPending || allClear
    ? null
    : home
    ? {
        figure: nearby.length,
        label: nearby.length === 1 ? 'thing reported near you' : 'things reported near you',
        sub: ring.label,
      }
    : areaStats
      ? {
          figure: areaStats.rank,
          label: `of ${areaStats.count} Calgary communities`,
          sub: 'by how much gets reported',
        }
      : null;
  const headlineCount = useCountUp(headline?.figure ?? 0, 1000, !still && headline !== null);

  if (!open) return null;

  const body = (
    <div
      className="fixed inset-0 z-[1200] flex items-stretch justify-center sm:items-center sm:p-6"
      role="dialog" aria-modal="true" aria-label={`Your neighbourhood, ${firstName}`}
    >
      <motion.button
        type="button" aria-label="Close" onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
        style={{ background: 'rgba(30,24,18,0.55)', backdropFilter: 'blur(3px)' }}
        initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
      />

      <motion.div
        className="relative flex h-full w-full max-w-[44rem] flex-col overflow-hidden shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
        style={{ background: T.page }}
        initial={still ? false : { opacity: 0, y: 22, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* ── Greeting ──────────────────────────────────────────────────────
            Their name and their street, in a sentence, the way a neighbour
            would open. */}
        <header
          className="relative shrink-0 overflow-hidden px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 sm:pb-7 sm:pt-7"
          style={{ background: `linear-gradient(155deg, ${T.deep} 0%, ${T.deep2} 100%)` }}
        >
          {/* The city, inked into the masthead the way the feed rail does it.
              The linocut is black ink, so on this dark ground it needs the
              invert to read at all. Same technique as the sidebar, different
              hue — this page is the warm one and should stay recognisably so. */}
          <img
            src={publicAsset('images/illustration/calgary-bow-emblem.webp')}
            alt=""
            width={900} height={900} loading="lazy"
            className="pointer-events-none absolute -right-10 -top-8 w-44 opacity-[0.13] sm:w-52"
            style={{ filter: 'invert(1)' }}
            aria-hidden="true"
          />

          {/* Foothill contour — a warm landform, not a targeting reticle. */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 opacity-[0.16]">
            <svg viewBox="0 0 400 100" width="100%" height="100%" preserveAspectRatio="none" fill="none" stroke={T.page} strokeWidth="1">
              <path d="M0 78 Q 52 44 104 62 T 208 52 T 312 68 T 400 46" />
              <path d="M0 92 Q 60 62 124 78 T 246 66 T 400 82" opacity="0.7" />
            </svg>
          </span>

          <button
            ref={closeRef} type="button" onClick={onClose} aria-label="Close"
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 grid h-9 w-9 place-items-center rounded-full transition-opacity hover:opacity-80 sm:right-6 sm:top-6"
            style={{ background: 'rgba(245,239,228,0.16)', color: T.page }}
          >
            <X size={17} />
          </button>

          <motion.div
            initial={still ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-3">
              {photoURL ? (
                <img
                  src={photoURL} alt="" referrerPolicy="no-referrer"
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                  style={{ boxShadow: `0 0 0 2px rgba(245,239,228,0.35)` }}
                />
              ) : (
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-[15px] font-extrabold"
                  style={{ background: 'rgba(245,239,228,0.18)', color: T.page }}
                >
                  {firstName.charAt(0).toUpperCase()}
                </span>
              )}
              <p className="font-mono text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ color: '#93C4B4' }}>
                {greetingFor(new Date(issuedAt))}, {firstName}
              </p>
            </div>

            <h2
              className="mt-3.5 font-display font-extrabold leading-[1.06] tracking-[-0.03em] pr-10"
              style={{ color: '#FDFAF3', fontSize: 'clamp(1.75rem, 6.6vw, 2.5rem)' }}
            >
              Here&rsquo;s your corner of Calgary
            </h2>

            <p className="mt-3 flex items-start gap-1.5 text-[13px] font-medium leading-snug" style={{ color: '#C3D6CE' }}>
              <Home size={13} className="mt-[2px] shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                Everything below is measured from{' '}
                <span className="font-bold" style={{ color: '#FDFAF3' }}>{address || areaLabel}</span>
              </span>
            </p>
          </motion.div>

          {allClear && (
            <motion.p
              className="mt-5 text-[15px] font-semibold leading-snug"
              style={{ color: '#C3D6CE' }}
              initial={still ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <span style={{ color: '#E8B871' }}>All quiet.</span> Nothing has been reported near you —
              by anyone.
            </motion.p>
          )}

          {headline && (
            <motion.div
              className="mt-5 flex items-baseline gap-3"
              initial={still ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <span
                className="font-display font-extrabold leading-none tabular-nums"
                style={{ color: '#E8B871', fontSize: 'clamp(2.5rem, 10vw, 3.5rem)' }}
              >
                {still ? headline.figure : headlineCount}
              </span>
              <span className="min-w-0 pb-1.5 text-[13px] font-semibold leading-tight" style={{ color: '#C3D6CE' }}>
                {headline.label}
                <span className="block font-normal">{headline.sub}</span>
              </span>
            </motion.div>
          )}
        </header>

        {/* ── Page ──────────────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-6 sm:px-8">
          {home && (
            <Section
              order={0} still={still}
              eyebrow={ring.label}
              title={
                nearby.length === 0
                  ? 'A quiet stretch around you'
                  : ring.widened
                    ? "What's happening in your wider neighbourhood"
                    : "What's happening near you"
              }
            >
              {ring.widened && nearby.length > 0 && (
                <p className="mb-3 text-[13.5px] leading-relaxed" style={{ color: T.soft }}>
                  Nothing at all inside a {WALK_MIN}-minute walk of your door — no neighbour reports, no
                  police records, no road or utility work. So this is the ring around that:{' '}
                  <strong style={{ color: T.ink }}>{ring.label}</strong>.
                </p>
              )}

              {nearby.length === 0 ? (
                <p className="text-[14.5px] leading-relaxed" style={{ color: T.soft }}>
                  Nothing has been reported anywhere near you — not by a neighbour, not by police, not by
                  311 or the road and utility feeds. That is the best thing this page can tell you.
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="mx-auto w-full max-w-[16rem] shrink-0 sm:mx-0 sm:w-[15rem] sm:max-w-none">
                      <BriefingRadar
                        points={radarPoints}
                        radiusM={ring.metres}
                        radiusLabel={ring.metres >= 1000 ? `${(ring.metres / 1000).toFixed(1)} km` : `${ring.metres} m`}
                        still={still}
                        onSelect={(incident) => { onSelectIncident(incident); onClose(); }}
                      />
                    </div>
                    <p className="text-[13.5px] leading-relaxed" style={{ color: T.soft }}>
                      Your home is the middle. Every dot is something real — a neighbour&rsquo;s report, a
                      police record, road work, an outage — placed at the direction and distance it
                      actually happened. North is up, and a dot on the outer ring is the full{' '}
                      {ring.metres >= 1000 ? `${(ring.metres / 1000).toFixed(1)} km` : `${ring.metres} m`}{' '}
                      away. Tap one to read it.
                    </p>
                  </div>

                  <ul className="mt-4 space-y-2">
                    {nearby.slice(0, 5).map(({ incident, distanceM }, i) => (
                      <ReportRow
                        key={incident.id} incident={incident} index={i} still={still}
                        badge={formatDistance(distanceM)}
                        sub={`${sourceLabel(incident)} · ${titleCase(incident.category)} · ${formatDistanceToNow(incident.timestamp)} ago`}
                        onOpen={() => { onSelectIncident(incident); onClose(); }}
                      />
                    ))}
                  </ul>
                  {nearby.length > 5 && (
                    <p className="mt-2.5 text-[12.5px] font-semibold" style={{ color: T.soft }}>
                      and {nearby.length - 5} more {ring.label}
                    </p>
                  )}
                </>
              )}

              {/* The way through to the map's wider sweep. */}
              <button
                type="button"
                onClick={() => { onOpenNearby(); onClose(); }}
                className="mt-4 flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-transform active:scale-[0.99]"
                style={{ background: T.ink, color: T.page }}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Compass size={18} className="shrink-0" style={{ color: '#E8B871' }} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-black leading-tight">Look further out</span>
                    <span className="block text-[11.5px] opacity-75">
                      Flip through everything within {NEARBY_KM} km, one at a time
                    </span>
                  </span>
                </span>
                <ArrowRight size={17} className="shrink-0" />
              </button>
            </Section>
          )}

          {home && (nearbySafety.length > 0 || nearbyTraffic.length > 0) && (
            <Section
              order={1} still={still} eyebrow="On your streets"
              title={`Cameras within your walk`}
            >
              <div className="grid grid-cols-2 gap-2.5">
                <Stat count={nearbySafety.length} still={still} tone={T.gold} label="Safety cameras that ticket" />
                <Stat count={nearbyTraffic.length} still={still} tone={T.deep2} label="Public traffic cameras" />
              </div>

              {nearbySafety.length > 0 && (
                <ul className="mt-2.5 space-y-2">
                  {nearbySafety.slice(0, 3).map(({ camera, distanceM }) => {
                    const daily = volumeAt(camera.lat, camera.lng, volumes);
                    return (
                      <li
                        key={camera.id}
                        className="flex items-start gap-3 px-3.5 py-3"
                        style={{ background: T.card, border: `1px solid ${T.line}` }}
                      >
                        <Camera size={15} className="mt-[2px] shrink-0" style={{ color: T.gold }} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-bold leading-snug" style={{ color: T.ink }}>
                            {camera.intersection}
                          </span>
                          <span className="block text-[11.5px]" style={{ color: T.soft }}>
                            {formatDistance(distanceM)} away
                            {camera.direction ? ` · watches ${camera.direction.toLowerCase()} traffic` : ''}
                          </span>
                          {daily && (
                            <span
                              className="mt-1.5 inline-block rounded-lg px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums"
                              style={{ background: 'rgba(176,121,60,0.14)', color: '#8A5710' }}
                            >
                              {Math.round(daily).toLocaleString()} vehicles a day
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                  {nearbySafety.length > 3 && (
                    <li className="pt-0.5 text-[12.5px] font-semibold" style={{ color: T.soft }}>
                      and {nearbySafety.length - 3} more inside the same walk
                    </li>
                  )}
                </ul>
              )}

              {nearbyTraffic.length > 0 && (
                <p className="mt-2.5 flex items-start gap-2 text-[12.5px] leading-relaxed" style={{ color: T.soft }}>
                  <Video size={13} className="mt-[3px] shrink-0" style={{ color: T.deep2 }} aria-hidden="true" />
                  <span>
                    The traffic cameras are public webcams you can look through yourself — switch the layer
                    on from the map.
                  </span>
                </p>
              )}

              <p className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: T.soft }}>
                Safety cameras ticket for running the red <strong style={{ color: T.ink }}>and</strong> for
                speeding through the green. The city does not publish how many tickets each one writes, or
                where mobile photo radar sets up — so this is where the fixed cameras are and how busy their
                roads are, not a ranking of which one catches most.
              </p>
            </Section>
          )}

          {(areaStats || latestValue) && (
            <Section
              order={2} still={still} eyebrow={areaLabel}
              title="How your community is doing"
            >
              <img
                src={publicAsset('images/illustration/process-community.webp')}
                alt=""
                width={640} height={640} loading="lazy"
                className="pointer-events-none absolute -right-4 top-6 hidden w-24 opacity-[0.09] sm:block"
                aria-hidden="true"
              />
              {areaStats && band && (
                <>
                  <p className="text-[14.5px] leading-relaxed" style={{ color: T.soft }}>
                    Against every other Calgary community, {areaLabel} sits{' '}
                    <strong style={{ color: band.color }}>{band.label.toLowerCase()}</strong> — number{' '}
                    <strong style={{ color: T.ink }}>{areaStats.rank}</strong> of {areaStats.count} by how
                    much gets reported.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <Stat count={areaStats.crime} still={still} label={`Criminal offences in ${areaStats.year}`} />
                    <Stat count={areaStats.disorder} still={still} label={`Disorder calls in ${areaStats.year}`} />
                  </div>
                </>
              )}

              {propertyData.length >= 2 ? (
                <div className="mt-2.5"><BriefingSparkline data={propertyData} still={still} /></div>
              ) : latestValue ? (
                <div className="mt-2.5 px-3.5 py-3" style={{ background: T.card, border: `1px solid ${T.line}` }}>
                  <p className="font-display text-[1.5rem] font-extrabold leading-none tabular-nums" style={{ color: T.ink }}>
                    ${Math.round(latestValue.avgValue).toLocaleString()}
                  </p>
                  <p className="mt-1.5 text-[11.5px] font-semibold leading-snug" style={{ color: T.soft }}>
                    Average home assessment here in {latestValue.year} · {latestValue.sampleCount.toLocaleString()} properties
                  </p>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => { onOpenArea(); onClose(); }}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold transition-opacity hover:opacity-90"
                style={{ background: 'transparent', border: `1.5px solid ${T.edge}`, color: T.ink }}
              >
                See everything about {areaLabel} <ArrowRight size={14} />
              </button>
            </Section>
          )}

          <Section
            order={3} still={still} eyebrow="Your part in it"
            title={myReports.length === 0 ? 'Nothing from you yet' : `You have reported ${myReports.length} thing${myReports.length === 1 ? '' : 's'}`}
          >
            {myReports.length === 0 ? (
              <p className="text-[14.5px] leading-relaxed" style={{ color: T.soft }}>
                This map is only as good as what neighbours put into it. The next thing you notice
                {address ? ' near your place' : ''} is worth the minute it takes.
              </p>
            ) : (
              <ul className="space-y-2">
                {myReports.slice(0, 3).map((incident, i) => (
                  <ReportRow
                    key={incident.id} incident={incident} index={i} still={still}
                    icon={<Sparkles size={15} className="mt-[3px] shrink-0" style={{ color: T.gold }} aria-hidden="true" />}
                    sub={`${formatDistanceToNow(incident.timestamp)} ago${
                      incident.report_count > 1 ? ` · ${incident.report_count} neighbours backed it up` : ''
                    }`}
                    onOpen={() => { onSelectIncident(incident); onClose(); }}
                  />
                ))}
              </ul>
            )}
            {memberSince && (
              <p className="mt-3 text-[12.5px] font-semibold" style={{ color: T.soft }}>
                Watching with us since{' '}
                {new Date(memberSince).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}.
                Thank you.
              </p>
            )}
          </Section>

          {address && !home && !isResolving && (
            <div className="mt-7 px-4 py-3.5" style={{ background: T.card, border: `1px solid ${T.line}` }}>
              <p className="text-[13px] leading-relaxed" style={{ color: T.soft }}>
                We could not find <span className="font-bold" style={{ color: T.ink }}>{address}</span> in the
                city&rsquo;s property register, so the sections measured from your door are missing. Picking
                your address from the suggestions in settings will fix it.
              </p>
            </div>
          )}

          {/* The city, as the rule that closes the page — the same device the
              landing page and the feed rail's footer use. */}
          <div className="mt-2 mb-1" aria-hidden="true">
            <img
              src={publicAsset('images/illustration/calgary-skyline-rule.webp')}
              alt=""
              width={1800} height={600} loading="lazy"
              className="pointer-events-none mx-auto w-full max-w-sm opacity-[0.4]"
            />
          </div>

          {/* ── Closing note ────────────────────────────────────────────────
              Naming every input is the point: this was assembled from things
              they handed over, not gathered from behind their back. */}
          <div className="mt-8 px-4 py-4" style={{ background: 'rgba(46,139,122,0.07)', border: `1px solid rgba(46,139,122,0.22)` }}>
            <p className="text-[13px] leading-relaxed" style={{ color: T.soft }}>
              <strong style={{ color: T.ink }}>How this page was made.</strong> From three things you gave
              us — your name, your saved address, and the reports you have filed. Distances are worked out
              on your own device against the city&rsquo;s public property register, so your coordinates are
              never sent to us or stored. Everything else is City of Calgary open data that anyone can look
              up.{digestOptIn
                ? ' You get the weekly email, so a shorter version of this lands in your inbox.'
                : ' You are not signed up for the weekly email.'}
            </p>
            <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2">
              <button
                type="button"
                onClick={() => { onOpenSettings(); onClose(); }}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-bold underline underline-offset-2 transition-opacity hover:opacity-70"
                style={{ color: T.ink }}
              >
                <Settings2 size={13} /> Change what you share
              </button>
              <a
                href="/privacy"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-bold underline underline-offset-2 transition-opacity hover:opacity-70"
                style={{ color: T.ink }}
              >
                <FileText size={13} /> Privacy policy
              </a>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: T.soft }}>
                {briefingRef(uid, issuedAt)}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );

  return createPortal(body, document.body);
}
