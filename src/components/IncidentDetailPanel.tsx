import { Incident, STATUS_ICONS, CATEGORY_ICONS, FLAG_THRESHOLD, isPubliclyVisible } from '@/src/types';
import { findNearestCamera, type TrafficCamera } from '@/src/hooks/useTrafficCameras';
import { X, MapPin, Clock, ShieldCheck, Share2, Navigation, Layers, ExternalLink, User, AlertCircle, Link, Twitter, Mail, MessageCircle, Facebook, Siren, Flag, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { cn, publicAsset } from '@/src/lib/utils';
import { useState, useEffect } from 'react';
import { useAuth } from '@/src/components/FirebaseProvider';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/src/firebase';
import { CATEGORY } from '@/src/lib/tokens';

// ── Field-atlas palette (matches the landing brand; explicit hexes on purpose:
//    several Tailwind color utilities are globally remapped in index.css) ─────
const P = {
  paper: '#FFFDF8',
  card: '#F7F3EA',
  ink: '#1C2B3A',
  soft: '#5A6B7D',
  line: '#E7E0D2',
  /**
   * Masthead ground. The poster's night navy, brought onto a data surface as a
   * header only — the layer rule keeps the rest of the panel legible and light.
   */
  ground: '#0B1F33',
  /** Ink on the ground. A foreground, never a background. */
  onGround: '#F2EFE8',
  /** Eyebrow and metadata on the ground. */
  onGroundSoft: '#AFC5DF',
  /**
   * The functional accent. Deliberately not the brand vermilion: on a map
   * surface red means emergency, so the marketing accent gives up its red.
   */
  accent: '#4A90D9',
};

/**
 * Straight from CATEGORY, because this panel's spine has to be the same colour
 * as the marker the reader just clicked. It was not: weather was #0284C7 cyan
 * here and #6A63A8 violet on the map, and infrastructure was #4A90D9 here
 * against #3E7D8C there — the same incident changed hue on the way in.
 */
const CAT_META: Record<string, { color: string; label: string }> = {
  crime:          { color: CATEGORY.crime,          label: 'Crime' },
  traffic:        { color: CATEGORY.traffic,        label: 'Traffic' },
  infrastructure: { color: CATEGORY.infrastructure, label: 'Infrastructure' },
  weather:        { color: CATEGORY.weather,        label: 'Weather' },
  emergency:      { color: CATEGORY.emergency,      label: 'Emergency' },
};

const CATEGORY_EMOJI: Record<string, string> = {
  crime: '🚨', traffic: '🚗', infrastructure: '🔧', weather: '⛈️', emergency: '🆘',
};

const STATUS_META: Record<string, { color: string; label: string }> = {
  community_confirmed: { color: '#2E8B7A', label: 'Confirmed' },
  multiple_reports:    { color: '#8A5710', label: 'Multiple reports' },
  unverified:          { color: '#6B7280', label: 'Unverified' },
};

function buildIncidentUrl(incidentId: string): string {
  if (typeof window === 'undefined') return `https://calgarywatch.ca/map?i=${incidentId}`;
  return `${window.location.origin}/map?i=${encodeURIComponent(incidentId)}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.26em] flex items-center gap-2" style={{ color: P.soft }}>
      <span className="h-[2px] w-3 shrink-0" style={{ background: P.accent }} aria-hidden="true" />
      {children}
    </h3>
  );
}

interface IncidentDetailPanelProps {
  incident: Incident | null;
  /** Loaded city traffic cameras, used to find one overlooking this location. */
  trafficCameras?: TrafficCamera[];
  onClose: () => void;
  onViewNeighborhood: (neighborhood: string) => void;
  onReportIncident: (incident: Incident) => void;
  onOpenCamera: (camera: TrafficCamera) => void;
}

export default function IncidentDetailPanel({ incident, trafficCameras, onClose, onViewNeighborhood, onReportIncident, onOpenCamera }: IncidentDetailPanelProps) {
  const [isMobileSheet, setIsMobileSheet] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false
  );
  // Must be declared before any early return to satisfy Rules of Hooks
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();
  const [flagged, setFlagged] = useState(false);
  const [flagConfirm, setFlagConfirm] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flagError, setFlagError] = useState(false);

  useEffect(() => {
    setFlagged(false);
    setFlagConfirm(false);
    setFlagError(false);
  }, [incident?.id]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const fn = () => setIsMobileSheet(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  if (!incident) return null;

  const isSystem = (incident.data_source != null && incident.data_source !== 'community') || incident.authorUid === 'system';

  // Nearest city camera overlooking this location, if any is close enough.
  const nearbyCamera = trafficCameras?.length
    ? findNearestCamera(incident.lat, incident.lng, trafficCameras)
    : null;
  // Stamped once per opened incident so the frame is current without the image
  // re-requesting on every render.
  const cameraStamp = incident.id;
  const existingFlaggers = incident.flagged_by ?? [];
  const alreadyFlaggedByMe = Boolean(user && existingFlaggers.includes(user.uid));
  const canFlag =
    Boolean(user) &&
    !isSystem &&
    !flagged &&
    !alreadyFlaggedByMe &&
    isPubliclyVisible(incident) &&
    user?.uid !== incident.authorUid;
  const handleFlag = async () => {
    if (!user || !db || !incident.id) return;
    setFlagError(false);
    setFlagging(true);
    try {
      // A report hides only once FLAG_THRESHOLD distinct users flag it, so one
      // account cannot take down the feed on its own. `flagged_by` is the list
      // the rules check for membership, which is what makes the threshold
      // enforceable server-side rather than a client convention.
      const nextFlaggers = [...existingFlaggers, user.uid];
      await updateDoc(doc(db, 'incidents', incident.id), {
        flagged_by: nextFlaggers,
        flag_count: nextFlaggers.length,
        flagged_at: Date.now(),
        visibility: nextFlaggers.length >= FLAG_THRESHOLD ? 'flagged' : 'public',
      });
      setFlagged(true);
      setFlagConfirm(false);
      onClose();
    } catch {
      setFlagError(true);
    } finally {
      setFlagging(false);
    }
  };

  const cat = CAT_META[incident.category] ?? CAT_META.crime;
  const status = STATUS_META[incident.verified_status] ?? STATUS_META.unverified;
  const Icon = CATEGORY_ICONS[incident.category as keyof typeof CATEGORY_ICONS] || AlertCircle;
  const StatusIcon = STATUS_ICONS[incident.verified_status];

  const safeSourceUrl = (() => {
    if (!incident.source_url) return null;
    try {
      const parsed = new URL(incident.source_url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
      return null;
    } catch {
      return null;
    }
  })();
  const safeSourceLogoUrl = (() => {
    if (!incident.source_logo) return null;
    try {
      const parsed = new URL(incident.source_logo);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
      return null;
    } catch {
      return null;
    }
  })();

  const hasCoords = Number.isFinite(incident.lat) && Number.isFinite(incident.lng);
  // Demo pins are deliberately approximate neighbourhood anchors. Offering
  // directions would incorrectly imply that a real event happened there.
  const canNavigate = hasCoords && incident.category !== 'weather' && incident.data_source !== 'demo';
  const isAnonymous = Boolean(incident.anonymous) || incident.name?.toLowerCase() === 'anonymous' || incident.name?.toLowerCase().includes('anonymous');
  const reporterName = isAnonymous ? 'Anonymous' : (incident.name?.trim() || 'Community Member');
  const reporterInitial = reporterName.charAt(0).toUpperCase() || 'C';
  const directionsUrl = canNavigate
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(incident.lat)},${encodeURIComponent(incident.lng)}`
    : null;

  const incidentUrl = buildIncidentUrl(incident.id);
  const emoji = CATEGORY_EMOJI[incident.category] ?? '📍';
  const timeAgo = formatDistanceToNow(incident.timestamp);

  const tweetText = [
    `${emoji} ${incident.title}`,
    `📍 ${incident.neighborhood || 'Calgary'} · ${timeAgo} ago`,
    '',
    incidentUrl,
    '',
    '#CalgaryWatch #Calgary #YYC',
  ].join('\n');

  const handleShareToX = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(url, '_blank', 'noopener,noreferrer,width=560,height=480');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(incidentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — fall back to selecting text
    }
  };

  const handleOpenShareWindow = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer,width=640,height=720');
  };

  const handleNativeShare = async () => {
    const shareData = { title: `Calgary Watch: ${incident.title}`, text: tweetText, url: incidentUrl };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        handleShareToX();
      }
    } catch {
      // cancelled — fail silently
    }
  };

  const encodedUrl = encodeURIComponent(incidentUrl);
  const encodedTitle = encodeURIComponent(`Calgary Watch: ${incident.title}`);
  const encodedBody = encodeURIComponent(`${incident.title}\n${incident.neighborhood || 'Calgary'} · ${timeAgo} ago\n\n${incidentUrl}`);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${incident.title} — ${incidentUrl}`)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
  const emailUrl = `mailto:?subject=${encodedTitle}&body=${encodedBody}`;

  const sheetMotion = isMobileSheet
    ? { initial: { y: '100%', opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: '100%', opacity: 0 } }
    : { initial: { x: '100%', opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: '100%', opacity: 0 } };

  return (
    <AnimatePresence>
      {incident && (
        <motion.div
          key="incident-panel"
          initial={sheetMotion.initial}
          animate={sheetMotion.animate}
          exit={sheetMotion.exit}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          style={{ willChange: 'transform' }}
          className={cn(
            'fixed z-[100] w-full flex flex-col p-0',
            isMobileSheet
              ? 'inset-x-0 bottom-0 justify-end max-h-[86dvh]'
              : 'inset-y-0 right-0 h-full sm:max-w-md justify-start sm:p-5'
          )}
        >
          <div
            className={cn(
              'flex flex-col overflow-hidden relative min-h-0 rounded-none shadow-[0_24px_64px_-24px_rgba(28,43,58,0.55)]',
              isMobileSheet ? 'max-h-[86dvh] w-full' : 'h-full border'
            )}
            style={{ background: P.paper, borderColor: P.line }}
          >
            {/*
              ── Masthead ───────────────────────────────────────────────────
              The panel header takes the poster's ground rather than the
              page's. Severity is carried by the band across the top, where it
              has real contrast against the navy; the chips below stay paper
              and ink so nothing under 12px is asked to hold a tinted colour.
            */}
            <div className="shrink-0 relative overflow-hidden" style={{ background: P.ground }}>
              {/* Category band — the one place severity is stated at full strength. */}
              <div className="absolute top-0 inset-x-0 h-1.5 z-20" style={{ background: cat.color }} aria-hidden="true" />

              {/* Calgary, printed faintly into the ground. */}
              <img
                src={publicAsset('images/illustration/calgary-skyline-rule-light.webp')}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full select-none object-cover object-bottom opacity-[0.16]"
              />

              {isMobileSheet && (
                <div className="relative flex justify-center pt-3.5" aria-hidden="true">
                  <div className="h-1 w-10" style={{ background: 'rgba(242,239,232,0.34)' }} />
                </div>
              )}
              <div className={cn('relative z-10 px-5 pb-5', isMobileSheet ? 'pt-3' : 'px-6 pt-7')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em]"
                      style={{ background: P.onGround, color: P.ground }}
                    >
                      <Icon size={11} />
                      {cat.label}
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em]"
                      style={{ border: '1px solid rgba(242,239,232,0.38)', color: '#D5DFEB' }}
                    >
                      {StatusIcon ? <StatusIcon size={11} /> : undefined}
                      {status.label}
                    </span>
                  </div>
                  <button
                    onClick={onClose}
                    className="shrink-0 -mt-1 -mr-1 flex h-9 w-9 items-center justify-center transition-colors hover:bg-[rgba(242,239,232,0.14)]"
                    style={{ color: P.onGroundSoft }}
                    aria-label="Close incident details"
                  >
                    <X size={17} />
                  </button>
                </div>

                {/*
                  The rail's coordinate stamp, carrying this incident's own
                  fix. It is the device that makes a masthead read as a
                  masthead rather than a card header — and here it is not
                  decoration, since it is the only place the exact location is
                  stated in words.
                */}
                <div className="mt-4 flex items-baseline justify-between gap-3 border-t pt-2.5" style={{ borderColor: 'rgba(242,239,232,0.20)' }}>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: P.onGroundSoft }}>
                    Incident report · YYC
                  </p>
                  <p className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.14em] tabular-nums" style={{ color: 'rgba(175,197,223,0.72)' }}>
                    {Math.abs(incident.lat).toFixed(2)}°{incident.lat >= 0 ? 'N' : 'S'} · {Math.abs(incident.lng).toFixed(2)}°{incident.lng >= 0 ? 'E' : 'W'}
                  </p>
                </div>

                <h2
                  className={cn('font-display font-black tracking-[-0.03em] leading-[0.98] mt-1.5', isMobileSheet ? 'text-[25px]' : 'text-[29px]')}
                  style={{ color: P.onGround }}
                >
                  {incident.title}
                </h2>

                <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: P.onGroundSoft }}>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={11} />
                    {incident.neighborhood || 'Calgary'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={11} />
                    {timeAgo} ago
                  </span>
                </div>
              </div>
            </div>

            {/* ── Scrollable body ─────────────────────────────────────────── */}
            <div className={cn('flex-1 overflow-y-auto no-scrollbar', isMobileSheet ? 'px-5 py-5 space-y-6' : 'px-6 py-6 space-y-7')}>
              {nearbyCamera && (
                <div className="space-y-2.5">
                  <SectionLabel>Referenced camera nearby</SectionLabel>
                  <button
                    type="button"
                    onClick={() => onOpenCamera(nearbyCamera.camera)}
                    className="block w-full overflow-hidden text-left transition-opacity hover:opacity-95 active:opacity-90"
                    style={{ border: `1px solid ${P.line}`, background: P.paper }}
                  >
                    <img
                      src={`${nearbyCamera.camera.imageUrl}?t=${cameraStamp}`}
                      alt={`Current City of Calgary traffic-camera view at ${nearbyCamera.camera.location}`}
                      loading="eager"
                      className="h-40 w-full object-cover sm:h-48"
                      style={{ background: P.card }}
                    />
                    <span className="flex items-center justify-between gap-3 px-3.5 py-3">
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-black leading-tight" style={{ color: P.ink }}>
                          {nearbyCamera.camera.location}
                        </span>
                        <span className="mt-0.5 block font-mono text-[10px] tracking-[0.04em]" style={{ color: P.soft }}>
                          {Math.round(nearbyCamera.distanceM)} M AWAY · CURRENT VIEW
                        </span>
                        <span className="mt-1 block text-[11px] leading-snug" style={{ color: P.soft }}>
                          Street context only—not footage of this report.
                        </span>
                      </span>
                      <span className="inline-flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-[11px] font-bold" style={{ background: P.ground, color: P.onGround }}>
                        View <ArrowRight size={12} />
                      </span>
                    </span>
                  </button>
                </div>
              )}

              {/* The report itself follows any directly referenced street view. */}
              <div className="space-y-2.5">
                <SectionLabel>What was reported</SectionLabel>
                <div className="relative rounded-none p-4 pl-5" style={{ background: P.card, borderTop: `1px solid ${P.line}`, borderRight: `1px solid ${P.line}`, borderBottom: `1px solid ${P.line}` }}>
                  <span className="absolute left-0 inset-y-0 w-[3px] rounded-none" style={{ background: cat.color }} aria-hidden="true" />
                  <p className="text-[14.5px] leading-relaxed font-medium" style={{ color: P.ink }}>
                    {incident.description}
                  </p>
                </div>
              </div>

              {incident.image_url && (
                <div className="space-y-2.5">
                  <SectionLabel>Photo</SectionLabel>
                  <img
                    src={incident.image_url}
                    alt="Incident photo"
                    loading="lazy"
                    className="w-full rounded-none object-cover max-h-64"
                    style={{ border: `1px solid ${P.line}` }}
                  />
                </div>
              )}

              {/* Source + reporter, one compact ledger */}
              <div className="space-y-2.5">
                <SectionLabel><ShieldCheck size={12} /> Source</SectionLabel>
                <div className="rounded-none overflow-hidden" style={{ border: `1px solid ${P.line}` }}>
                  <div className="flex items-center gap-3 p-3.5" style={{ background: P.card }}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none overflow-hidden" style={{ background: P.paper, border: `1px solid ${P.line}` }}>
                      {safeSourceLogoUrl ? (
                        <img src={safeSourceLogoUrl} alt={incident.source_name} className="h-full w-full object-contain" referrerPolicy="no-referrer" />
                      ) : (
                        <ShieldCheck size={18} style={{ color: cat.color }} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold truncate" style={{ color: P.ink }}>
                        {incident.source_name || 'Community Source'}
                      </p>
                      <p className="text-[10.5px] font-medium" style={{ color: P.soft }}>
                        {incident.data_source === 'demo'
                          ? 'Illustrative anonymous example — not a real incident'
                          : isSystem
                            ? 'Official / synced feed'
                            : 'Community report'}
                      </p>
                    </div>
                    {safeSourceUrl && (
                      <a
                        href={safeSourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none transition-colors hover:bg-black/5"
                        style={{ color: cat.color }}
                        aria-label="Open source website"
                      >
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-3 p-3.5" style={{ borderTop: `1px dashed ${P.line}` }}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none" style={{ background: P.card, border: `1px solid ${P.line}` }}>
                      {isAnonymous ? (
                        <User size={16} style={{ color: P.soft }} />
                      ) : (
                        <span className="text-[13px] font-black" style={{ color: P.ink }}>{reporterInitial}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold truncate" style={{ color: P.ink }}>{reporterName}</p>
                      <p className="text-[10.5px] font-medium" style={{ color: P.soft }}>
                        {isAnonymous ? 'Posted anonymously' : 'Community member'}
                      </p>
                    </div>
                  </div>
                  <p className="px-3.5 py-2.5 text-[10.5px] leading-relaxed" style={{ color: P.soft, borderTop: `1px dashed ${P.line}` }}>
                    Verify details with official channels before acting. Emergencies: call 9-1-1.
                  </p>
                </div>
              </div>

              {/* Share */}
              <div className="space-y-2.5">
                <SectionLabel><Share2 size={12} /> Share this report</SectionLabel>
                <div className="flex gap-2">
                  <button
                    onClick={handleShareToX}
                    className="flex-1 flex items-center justify-center gap-2 rounded-none h-11 text-[12px] font-bold transition-transform active:scale-95"
                    style={{ background: P.ink, color: P.paper }}
                  >
                    <Twitter size={14} />
                    Post on X
                  </button>
                  <button
                    onClick={() => void handleCopyLink()}
                    className="flex-1 flex items-center justify-center gap-2 rounded-none h-11 text-[12px] font-bold transition-all active:scale-95"
                    style={copied
                      ? { background: 'rgba(46,139,122,0.14)', color: '#1F6355', border: '1px solid rgba(46,139,122,0.42)' }
                      : { background: P.card, color: P.ink, border: `1px solid ${P.line}` }}
                  >
                    <Link size={14} />
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                  <button
                    onClick={() => void handleNativeShare()}
                    title="More share options"
                    className="w-11 h-11 flex items-center justify-center rounded-none transition-transform active:scale-95 shrink-0"
                    style={{ background: P.card, color: P.soft, border: `1px solid ${P.line}` }}
                    aria-label="More share options"
                  >
                    <Share2 size={15} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'WhatsApp', icon: MessageCircle, onClick: () => handleOpenShareWindow(whatsappUrl) },
                    { label: 'Facebook', icon: Facebook, onClick: () => handleOpenShareWindow(facebookUrl) },
                  ].map(({ label, icon: ShareIcon, onClick }) => (
                    <button
                      key={label}
                      onClick={onClick}
                      className="flex items-center justify-center gap-1.5 rounded-none h-10 text-[11px] font-bold transition-transform active:scale-95"
                      style={{ background: P.card, color: P.ink, border: `1px solid ${P.line}` }}
                    >
                      <ShareIcon size={13} />
                      {label}
                    </button>
                  ))}
                  <a
                    href={emailUrl}
                    className="flex items-center justify-center gap-1.5 rounded-none h-10 text-[11px] font-bold transition-transform active:scale-95"
                    style={{ background: P.card, color: P.ink, border: `1px solid ${P.line}` }}
                  >
                    <Mail size={13} />
                    Email
                  </a>
                </div>
              </div>

              {/* Moderation */}
              {canFlag && (
                <div className="space-y-2">
                  {flagConfirm ? (
                      <div className="rounded-none overflow-hidden" style={{ border: '1px solid rgba(199,127,24,0.42)', background: 'rgba(199,127,24,0.09)' }}>
                        <div className="flex gap-2 items-center p-3">
                          <p className="flex-1 text-[11.5px] font-bold" style={{ color: '#8A5710' }}>
                            {existingFlaggers.length + 1 >= FLAG_THRESHOLD
                              ? 'Report as inappropriate? This hides it from the map now.'
                              : `Report as inappropriate? It stays visible until ${FLAG_THRESHOLD} neighbours flag it.`}
                          </p>
                          <button
                            onClick={() => void handleFlag()}
                            disabled={flagging}
                            className="px-3 py-1.5 rounded-none text-[11px] font-black transition-all disabled:opacity-50"
                            style={{ background: '#8A5710', color: '#fff' }}
                          >
                            {flagging ? 'Reporting…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setFlagConfirm(false)}
                            className="px-3 py-1.5 rounded-none text-[11px] font-black"
                            style={{ background: P.card, color: P.ink, border: `1px solid ${P.line}` }}
                          >
                            Cancel
                          </button>
                        </div>
                        {flagError && <p className="px-3 pb-3 text-[11px] font-bold" style={{ color: '#C0392B' }}>Could not submit report. Please try again.</p>}
                      </div>
                    ) : (
                      <button
                        onClick={() => setFlagConfirm(true)}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-none h-10 font-mono text-[10px] font-bold uppercase tracking-[0.18em] transition-colors hover:bg-[rgba(199,127,24,0.10)]"
                        style={{ color: '#8A5710', border: `1px solid ${P.line}` }}
                      >
                        <Flag size={13} />
                        Report inappropriate
                      </button>
                    )}
                </div>
              )}

              {/* Report ID + live footer (scrolls with content) */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] truncate" style={{ color: P.soft }}>
                  ID · {incident.id}
                </p>
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] shrink-0" style={{ color: '#2E8B7A' }}>
                  <span className="h-1.5 w-1.5 rounded-none animate-pulse" style={{ background: '#2E8B7A' }} />
                  Live
                </span>
              </div>
            </div>

            {/* ── Sticky action bar — thumb zone on mobile, always visible ── */}
            <div
              className={cn('shrink-0 flex items-center gap-2.5', isMobileSheet ? 'px-4 pt-4 pb-[max(1.1rem,env(safe-area-inset-bottom))]' : 'px-5 py-5')}
              style={{ borderTop: `1px solid ${P.line}`, background: P.paper }}
            >
              {canNavigate && directionsUrl && (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-none transition-transform active:scale-95"
                  style={{ background: P.card, color: P.ink, border: `1px solid ${P.line}` }}
                  title="Open in Google Maps"
                  aria-label="Open in Google Maps"
                >
                  <Navigation size={17} />
                </a>
              )}
              <button
                onClick={() => onReportIncident(incident)}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-none text-[12.5px] font-black transition-transform active:scale-[0.97]"
                style={{ background: 'rgba(192,57,43,0.10)', color: '#A6332A', border: '1px solid rgba(192,57,43,0.38)' }}
              >
                <Siren size={15} />
                Report related
              </button>
              {/*
                The one hard-offset press in this view. The offset shadow *is*
                the depth, so pressing collapses the button into the page. One
                is a signature; twelve would be noise, which is why nothing
                else on this panel carries a shadow.
              */}
              <button
                onClick={() => onViewNeighborhood(incident.neighborhood)}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-none text-[12.5px] font-black uppercase tracking-[0.06em] shadow-[4px_4px_0_#4A90D9] transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
                style={{ background: P.ground, color: P.onGround }}
              >
                <Layers size={15} />
                Area intel
                <ArrowRight size={13} className="opacity-70" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
