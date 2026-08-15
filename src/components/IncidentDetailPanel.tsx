import { Incident, STATUS_ICONS, CATEGORY_ICONS, FLAG_THRESHOLD, isPubliclyVisible } from '@/src/types';
import { findNearestCamera, type TrafficCamera } from '@/src/hooks/useTrafficCameras';
import { X, MapPin, Clock, ShieldCheck, Share2, Navigation, Layers, ExternalLink, User, AlertCircle, Link, Twitter, Mail, MessageCircle, Facebook, Siren, Flag, Trash2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/src/lib/utils';
import { useState, useEffect } from 'react';
import { useAuth } from '@/src/components/FirebaseProvider';
import DemoBadge from '@/src/components/DemoBadge';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/src/firebase';

// ── Field-atlas palette (matches the landing brand; explicit hexes on purpose:
//    several Tailwind color utilities are globally remapped in index.css) ─────
const P = {
  paper: '#FFFDF8',
  card: '#F7F3EA',
  ink: '#1C2B3A',
  soft: '#5A6B7D',
  line: '#E7E0D2',
};

const CAT_META: Record<string, { color: string; soft: string; label: string }> = {
  crime:          { color: '#DC2626', soft: 'rgba(220,38,38,0.1)',  label: 'Crime' },
  traffic:        { color: '#EA580C', soft: 'rgba(234,88,12,0.1)',  label: 'Traffic' },
  infrastructure: { color: '#2563EB', soft: 'rgba(37,99,235,0.1)',  label: 'Infrastructure' },
  weather:        { color: '#0284C7', soft: 'rgba(2,132,199,0.1)',  label: 'Weather' },
  emergency:      { color: '#E11D48', soft: 'rgba(225,29,72,0.12)', label: 'Emergency' },
};

const CATEGORY_EMOJI: Record<string, string> = {
  crime: '🚨', traffic: '🚗', infrastructure: '🔧', weather: '⛈️', emergency: '🆘',
};

const STATUS_META: Record<string, { color: string; label: string }> = {
  community_confirmed: { color: '#059669', label: 'Confirmed' },
  multiple_reports:    { color: '#B45309', label: 'Multiple reports' },
  unverified:          { color: '#6B7280', label: 'Unverified' },
};

function buildIncidentUrl(incidentId: string): string {
  if (typeof window === 'undefined') return `https://calgarywatch.ca/map?i=${incidentId}`;
  return `${window.location.origin}/map?i=${encodeURIComponent(incidentId)}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-[9.5px] font-bold uppercase tracking-[0.26em] flex items-center gap-2" style={{ color: P.soft }}>
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
}

export default function IncidentDetailPanel({ incident, trafficCameras, onClose, onViewNeighborhood, onReportIncident }: IncidentDetailPanelProps) {
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
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  useEffect(() => {
    setFlagged(false);
    setFlagConfirm(false);
    setFlagError(false);
    setDeleteConfirm(false);
    setDeleteError(false);
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
  const canDelete = Boolean(user) && !isSystem && user?.uid === incident.authorUid;

  const handleDelete = async () => {
    if (!user || !db || !incident.id) return;
    setDeleteError(false);
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'incidents', incident.id));
      onClose();
    } catch {
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  };

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

  const chip = (color: string, softBg: string, label: string, icon?: React.ReactNode) => (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.18em]"
      style={{ background: softBg, color }}
    >
      {icon}
      {label}
    </span>
  );

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
              'flex flex-col overflow-hidden relative min-h-0 shadow-[0_24px_64px_-24px_rgba(28,43,58,0.55)]',
              isMobileSheet
                ? 'max-h-[86dvh] w-full rounded-t-[1.6rem]'
                : 'h-full rounded-[1.75rem] border'
            )}
            style={{ background: P.paper, borderColor: P.line }}
          >
            {/* category spine */}
            <div className="absolute top-0 inset-x-0 h-1 z-20" style={{ background: cat.color }} aria-hidden="true" />

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="shrink-0 relative" style={{ borderBottom: `1px solid ${P.line}` }}>
              {isMobileSheet && (
                <div className="flex justify-center pt-3" aria-hidden="true">
                  <div className="h-1 w-10 rounded-full" style={{ background: P.line }} />
                </div>
              )}
              <div className={cn('px-5 pb-4', isMobileSheet ? 'pt-2.5' : 'pt-6 px-6')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {chip(cat.color, cat.soft, cat.label, <Icon size={11} />)}
                    {chip(status.color, `${status.color}1a`, status.label, StatusIcon ? <StatusIcon size={11} /> : undefined)}
                  </div>
                  <button
                    onClick={onClose}
                    className="shrink-0 -mt-1 -mr-1 flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-black/5"
                    style={{ color: P.soft }}
                    aria-label="Close incident details"
                  >
                    <X size={17} />
                  </button>
                </div>

                <h2
                  className={cn('font-display font-extrabold tracking-[-0.02em] leading-[1.08] mt-2.5', isMobileSheet ? 'text-[22px]' : 'text-[26px]')}
                  style={{ color: P.ink }}
                >
                  {incident.title}
                </h2>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-semibold" style={{ color: P.soft }}>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={12} style={{ color: cat.color }} />
                    {incident.neighborhood || 'Calgary'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={12} />
                    {timeAgo} ago
                  </span>
                </div>
              </div>
            </div>

            {/* ── Scrollable body ─────────────────────────────────────────── */}
            <div className={cn('flex-1 overflow-y-auto no-scrollbar', isMobileSheet ? 'px-5 py-5 space-y-6' : 'px-6 py-6 space-y-7')}>
              {/* Description — first, it's what people opened this for */}
              <div className="space-y-2.5">
                <SectionLabel>What was reported</SectionLabel>
                <div className="relative rounded-2xl p-4 pl-5" style={{ background: P.card, border: `1px solid ${P.line}` }}>
                  <span className="absolute left-0 top-3 bottom-3 w-1 rounded-full" style={{ background: cat.color }} aria-hidden="true" />
                  <p className="text-[14.5px] leading-relaxed font-medium" style={{ color: P.ink }}>
                    {incident.description}
                  </p>
                </div>
              </div>

              {/*
                A city camera overlooking this spot.
                
                Deliberately labelled as the current view, never as footage of
                the report. The image is a live frame pulled now — for a
                collision filed twenty minutes ago it may well show the scene,
                but for a break-in from Tuesday it shows an empty street, and a
                safety app must not let a reader mistake one for the other. The
                distance is stated so they can judge how relevant it is.
              */}
              {nearbyCamera && (
                <div className="space-y-2.5">
                  <SectionLabel>Live view nearby</SectionLabel>
                  <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${P.line}` }}>
                    <img
                      src={`${nearbyCamera.camera.imageUrl}?t=${cameraStamp}`}
                      alt={`Live City of Calgary traffic camera at ${nearbyCamera.camera.location}`}
                      loading="lazy"
                      className="w-full object-cover max-h-56 bg-slate-100"
                    />
                    <div className="px-3 py-2.5 space-y-1" style={{ background: P.paper }}>
                      <p className="text-[12.5px] font-black leading-tight" style={{ color: P.ink }}>
                        {nearbyCamera.camera.location}
                      </p>
                      <p className="font-mono text-[10px] tracking-[0.06em]" style={{ color: P.soft }}>
                        {Math.round(nearbyCamera.distanceM)} M AWAY · CITY OF CALGARY
                        {nearbyCamera.camera.quadrant ? ` · ${nearbyCamera.camera.quadrant}` : ''}
                      </p>
                      <p className="text-[11px] leading-snug" style={{ color: P.soft }}>
                        Current conditions at this intersection — not footage of this report.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {incident.image_url && (
                <div className="space-y-2.5">
                  <SectionLabel>Photo</SectionLabel>
                  <img
                    src={incident.image_url}
                    alt="Incident photo"
                    loading="lazy"
                    className="w-full rounded-2xl object-cover max-h-64"
                    style={{ border: `1px solid ${P.line}` }}
                  />
                </div>
              )}

              {/* Sample reports are called out before the source ledger — the
                  detail panel is where someone goes to decide whether to act on
                  a report, so it must be unmissable here. */}
              {incident.data_source === 'demo' && (
                <div
                  className="rounded-2xl p-3.5 space-y-2"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(135deg, rgba(180,83,9,0.10) 0 4px, transparent 4px 9px)',
                    backgroundColor: 'rgba(245,158,11,0.10)',
                    border: '1px solid rgba(180,83,9,0.42)',
                  }}
                >
                  <DemoBadge size="md" />
                  <p className="text-[11.5px] font-medium leading-relaxed" style={{ color: '#7A6642' }}>
                    Calgary Watch publishes a small number of example reports to show how reporting
                    works. This is not a real incident, nobody submitted it, and it is excluded from
                    every safety score, count and neighbourhood statistic.
                  </p>
                </div>
              )}

              {/* Source + reporter, one compact ledger */}
              <div className="space-y-2.5">
                <SectionLabel><ShieldCheck size={12} /> Source</SectionLabel>
                <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${P.line}` }}>
                  <div className="flex items-center gap-3 p-3.5" style={{ background: P.card }}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl overflow-hidden" style={{ background: P.paper, border: `1px solid ${P.line}` }}>
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
                          ? 'Illustrative example — not a real report'
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
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-black/5"
                        style={{ color: cat.color }}
                        aria-label="Open source website"
                      >
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-3 p-3.5" style={{ borderTop: `1px dashed ${P.line}` }}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: P.card, border: `1px solid ${P.line}` }}>
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
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl h-11 text-[12px] font-bold transition-transform active:scale-95"
                    style={{ background: P.ink, color: P.paper }}
                  >
                    <Twitter size={14} />
                    Post on X
                  </button>
                  <button
                    onClick={() => void handleCopyLink()}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl h-11 text-[12px] font-bold transition-all active:scale-95"
                    style={copied
                      ? { background: 'rgba(5,150,105,0.12)', color: '#059669', border: '1px solid rgba(5,150,105,0.35)' }
                      : { background: P.card, color: P.ink, border: `1px solid ${P.line}` }}
                  >
                    <Link size={14} />
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                  <button
                    onClick={() => void handleNativeShare()}
                    title="More share options"
                    className="w-11 h-11 flex items-center justify-center rounded-xl transition-transform active:scale-95 shrink-0"
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
                      className="flex items-center justify-center gap-1.5 rounded-xl h-10 text-[11px] font-bold transition-transform active:scale-95"
                      style={{ background: P.card, color: P.ink, border: `1px solid ${P.line}` }}
                    >
                      <ShareIcon size={13} />
                      {label}
                    </button>
                  ))}
                  <a
                    href={emailUrl}
                    className="flex items-center justify-center gap-1.5 rounded-xl h-10 text-[11px] font-bold transition-transform active:scale-95"
                    style={{ background: P.card, color: P.ink, border: `1px solid ${P.line}` }}
                  >
                    <Mail size={13} />
                    Email
                  </a>
                </div>
              </div>

              {/* Moderation */}
              {(canDelete || canFlag) && (
                <div className="space-y-2">
                  {canDelete && (
                    deleteConfirm ? (
                      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(220,38,38,0.35)', background: 'rgba(220,38,38,0.07)' }}>
                        <div className="flex gap-2 items-center p-3">
                          <p className="flex-1 text-[11.5px] font-bold" style={{ color: '#B91C1C' }}>Delete your report permanently?</p>
                          <button
                            onClick={() => void handleDelete()}
                            disabled={deleting}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-black transition-all disabled:opacity-50"
                            style={{ background: '#DC2626', color: '#fff' }}
                          >
                            {deleting ? 'Deleting…' : 'Delete'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(false)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-black"
                            style={{ background: P.card, color: P.ink, border: `1px solid ${P.line}` }}
                          >
                            Cancel
                          </button>
                        </div>
                        {deleteError && <p className="px-3 pb-3 text-[11px] font-bold" style={{ color: '#DC2626' }}>Failed to delete. Try again.</p>}
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(true)}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl h-10 text-[11.5px] font-bold transition-colors hover:bg-red-50"
                        style={{ color: '#B91C1C', border: `1px solid ${P.line}` }}
                      >
                        <Trash2 size={13} />
                        Delete my report
                      </button>
                    )
                  )}
                  {canFlag && (
                    flagConfirm ? (
                      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(180,83,9,0.35)', background: 'rgba(180,83,9,0.07)' }}>
                        <div className="flex gap-2 items-center p-3">
                          <p className="flex-1 text-[11.5px] font-bold" style={{ color: '#92400E' }}>
                            {existingFlaggers.length + 1 >= FLAG_THRESHOLD
                              ? 'Report as inappropriate? This hides it from the map now.'
                              : `Report as inappropriate? It stays visible until ${FLAG_THRESHOLD} neighbours flag it.`}
                          </p>
                          <button
                            onClick={() => void handleFlag()}
                            disabled={flagging}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-black transition-all disabled:opacity-50"
                            style={{ background: '#B45309', color: '#fff' }}
                          >
                            {flagging ? 'Reporting…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setFlagConfirm(false)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-black"
                            style={{ background: P.card, color: P.ink, border: `1px solid ${P.line}` }}
                          >
                            Cancel
                          </button>
                        </div>
                        {flagError && <p className="px-3 pb-3 text-[11px] font-bold" style={{ color: '#DC2626' }}>Could not submit report. Please try again.</p>}
                      </div>
                    ) : (
                      <button
                        onClick={() => setFlagConfirm(true)}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl h-10 text-[11.5px] font-bold transition-colors hover:bg-amber-50"
                        style={{ color: '#92400E', border: `1px solid ${P.line}` }}
                      >
                        <Flag size={13} />
                        Report inappropriate
                      </button>
                    )
                  )}
                </div>
              )}

              {/* Report ID + live footer (scrolls with content) */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="font-mono text-[8.5px] uppercase tracking-[0.18em] truncate" style={{ color: P.soft }}>
                  ID · {incident.id}
                </p>
                <span className="inline-flex items-center gap-1.5 font-mono text-[8.5px] font-bold uppercase tracking-[0.18em] shrink-0" style={{ color: '#059669' }}>
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: '#059669' }} />
                  Live
                </span>
              </div>
            </div>

            {/* ── Sticky action bar — thumb zone on mobile, always visible ── */}
            <div
              className={cn('shrink-0 flex items-center gap-2', isMobileSheet ? 'px-4 pt-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]' : 'px-5 py-4')}
              style={{ borderTop: `1px solid ${P.line}`, background: P.paper }}
            >
              {canNavigate && directionsUrl && (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform active:scale-95"
                  style={{ background: P.card, color: P.ink, border: `1px solid ${P.line}` }}
                  title="Open in Google Maps"
                  aria-label="Open in Google Maps"
                >
                  <Navigation size={17} />
                </a>
              )}
              <button
                onClick={() => onReportIncident(incident)}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[12.5px] font-black transition-transform active:scale-[0.97]"
                style={{ background: 'rgba(220,38,38,0.09)', color: '#B91C1C', border: '1px solid rgba(220,38,38,0.3)' }}
              >
                <Siren size={15} />
                Report related
              </button>
              <button
                onClick={() => onViewNeighborhood(incident.neighborhood)}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[12.5px] font-black transition-transform active:scale-[0.97]"
                style={{ background: P.ink, color: P.paper }}
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
