import { Incident, STATUS_ICONS, CATEGORY_ICONS, FLAG_THRESHOLD, isPubliclyVisible } from '@/src/types';
import { findNearestCamera, type TrafficCamera } from '@/src/hooks/useTrafficCameras';
import { X, Share2, Navigation, ExternalLink, User, AlertCircle, Link, Twitter, Mail, MessageCircle, Facebook, Flag, ArrowRight, MapPinned, MessageSquarePlus, Check, Eye, Activity, CircleCheck, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatRelativeTime } from '@/src/lib/format';
import { cn } from '@/src/lib/utils';
import { useState, useEffect } from 'react';
import { useAuth } from '@/src/components/FirebaseProvider';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/src/firebase';
import { useMyIncidentFeedback } from '@/src/hooks/useIncidentFeedback';
import { feedbackSummary, incidentFeedbackAggregate, type FeedbackKind } from '@/src/lib/feedback';
import { recordFeedback } from '@/src/lib/feedbackClient';
import { CATEGORY, LIVE } from '@/src/lib/tokens';
import '@/src/styles/map-overlays.css';

/**
 * Straight from CATEGORY, because this panel's top band has to be the same
 * colour as the marker the reader just clicked. `fg` is the glyph colour on
 * that fill: amber is too light for white, so it takes ink.
 */
const CAT_META: Record<string, { color: string; fg: string; label: string }> = {
  crime:          { color: CATEGORY.crime,          fg: '#FFFFFF', label: 'Crime' },
  traffic:        { color: CATEGORY.traffic,        fg: LIVE.ink,  label: 'Traffic' },
  infrastructure: { color: CATEGORY.infrastructure, fg: '#FFFFFF', label: 'Infrastructure' },
  weather:        { color: CATEGORY.weather,        fg: '#FFFFFF', label: 'Weather' },
  emergency:      { color: CATEGORY.emergency,      fg: '#FFFFFF', label: 'Emergency' },
};

const CATEGORY_EMOJI: Record<string, string> = {
  crime: '🚨', traffic: '🚗', infrastructure: '🔧', weather: '⛈️', emergency: '🆘',
};

/** Credibility, as neighbours have stated it. Never claims police verification. */
const STATUS_META: Record<string, { label: string }> = {
  community_confirmed: { label: 'Confirmed by neighbours' },
  multiple_reports:    { label: 'Several reports' },
  unverified:          { label: 'Unverified' },
};

const FEEDBACK_ACTIONS: [FeedbackKind, string, typeof Eye][] = [
  ['saw_it', 'I saw this too', Eye],
  ['still_happening', 'Still happening', Activity],
  ['resolved', 'Seems resolved', CircleCheck],
];

function buildIncidentUrl(incidentId: string): string {
  if (typeof window === 'undefined') return `https://calgarywatch.ca/map?i=${incidentId}`;
  return `${window.location.origin}/map?i=${encodeURIComponent(incidentId)}`;
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
  // Resident lifecycle — the reader's own answer (owner-readable). The public
  // corroboration aggregate is read from the incident's own fields below.
  // Declared before the early return to satisfy the Rules of Hooks.
  const myKind = useMyIncidentFeedback(incident?.id ?? null);
  const [feedbackPending, setFeedbackPending] = useState<FeedbackKind | null>(null);
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

  const submitFeedback = async (kind: FeedbackKind) => {
    if (!user || feedbackPending) return;
    setFeedbackPending(kind);
    await recordFeedback(incident.id, kind, user.uid);
    setFeedbackPending(null);
  };

  const isSystem = (incident.data_source != null && incident.data_source !== 'community') || incident.authorUid === 'system';
  const isDemo = incident.data_source === 'demo';

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
  const reporterName = isAnonymous ? 'A neighbour' : (incident.name?.trim() || 'Community Member');
  const reporterInitial = (isAnonymous ? '' : reporterName.charAt(0).toUpperCase()) || 'C';
  const directionsUrl = canNavigate
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(incident.lat)},${encodeURIComponent(incident.lng)}`
    : null;

  const incidentUrl = buildIncidentUrl(incident.id);
  const emoji = CATEGORY_EMOJI[incident.category] ?? '📍';
  const relativeTime = formatRelativeTime(incident.timestamp);
  const place = incident.neighborhood || 'Calgary';

  const tweetText = [
    `${emoji} ${incident.title}`,
    `📍 ${place} · ${relativeTime}`,
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
  const encodedBody = encodeURIComponent(`${incident.title}\n${place} · ${relativeTime}\n\n${incidentUrl}`);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${incident.title} — ${incidentUrl}`)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
  const emailUrl = `mailto:?subject=${encodedTitle}&body=${encodedBody}`;

  const sheetMotion = isMobileSheet
    ? { initial: { y: '100%', opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: '100%', opacity: 0 } }
    : { initial: { x: '110%', opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: '110%', opacity: 0 } };

  // Provenance: who is behind this pin, in plain words.
  const provenance = isDemo
    ? { chip: 'Example', chipClass: 'lv-o-chip-dashed' }
    : isSystem
      ? { chip: 'Official source', chipClass: 'lv-o-chip-navy' }
      : { chip: 'Neighbour report', chipClass: 'lv-o-chip-yellow' };

  return (
    <AnimatePresence>
      {incident && (
        <motion.div
          key="incident-panel"
          initial={sheetMotion.initial}
          animate={sheetMotion.animate}
          exit={sheetMotion.exit}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          role="dialog"
          aria-label={`Report: ${incident.title}`}
          className={cn('lv-o lv-idp', isMobileSheet ? 'lv-idp-phone' : 'lv-idp-desk')}
          style={{ willChange: 'transform', ['--cat' as string]: cat.color, ['--cat-fg' as string]: cat.fg }}
        >
          {/* Category band: the one place the category is stated at full strength. */}
          <div className="lv-idp-band" aria-hidden="true" />
          {isMobileSheet && <div className="lv-o-grabber" aria-hidden="true"><span /></div>}

          <header className="lv-idp-head">
            <div className="lv-idp-head-top">
              <div className="lv-idp-eyebrow">
                <span className="lv-idp-caticon" aria-hidden="true"><Icon size={18} strokeWidth={2.2} /></span>
                <p className="lv-idp-eyebrow-text">
                  <b>{cat.label}</b> · {relativeTime} · {place}
                </p>
              </div>
              <button type="button" onClick={onClose} className="lv-o-iconbtn" aria-label="Close incident details">
                <X size={20} strokeWidth={2.2} />
              </button>
            </div>

            <h2 className="lv-idp-title">{incident.title}</h2>

            <div className="lv-idp-chips">
              <span className={cn('lv-o-chip', provenance.chipClass)}>{provenance.chip}</span>
              {!isSystem && (
                <span className={cn('lv-o-chip', incident.verified_status === 'unverified' && 'lv-o-chip-dashed')}>
                  {StatusIcon ? <StatusIcon size={13} aria-hidden="true" /> : undefined}
                  {status.label}
                </span>
              )}
            </div>
          </header>

          <div className="lv-idp-body no-scrollbar">
            {/* The reporter's own photo leads: the most direct evidence in the report. */}
            {incident.image_url && (
              <a href={incident.image_url} target="_blank" rel="noopener noreferrer" className="lv-idp-photo" aria-label="Open the reporter's photo">
                <img src={incident.image_url} alt="Photo submitted with this report" loading="lazy" />
              </a>
            )}

            {incident.description && <p className="lv-idp-desc">{incident.description}</p>}

            {/* Who is behind this pin. */}
            <section className="lv-idp-section" aria-label="Who reported this">
              <p className="lv-o-eyebrow">Who reported this</p>
              <div className="lv-idp-card">
                {isSystem ? (
                  <div className="lv-idp-row">
                    <span className={cn('lv-idp-avatar', isDemo ? 'is-demo' : 'is-official')}>
                      {safeSourceLogoUrl
                        ? <img src={safeSourceLogoUrl} alt="" referrerPolicy="no-referrer" />
                        : isDemo ? <User size={18} /> : <Icon size={18} />}
                    </span>
                    <span className="lv-idp-who">
                      <b>{incident.source_name || (isDemo ? 'Example report' : 'Official source')}</b>
                      <span>
                        {isDemo
                          ? 'Illustrative anonymous example — not a real incident'
                          : coverageLine(incident)}
                      </span>
                    </span>
                    {safeSourceUrl && (
                      <a href={safeSourceUrl} target="_blank" rel="noopener noreferrer" className="lv-idp-srclink" aria-label="Open source website">
                        Source <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="lv-idp-row">
                    <span className="lv-idp-avatar">
                      {isAnonymous ? <User size={18} /> : reporterInitial}
                    </span>
                    <span className="lv-idp-who">
                      <b>{reporterName}</b>
                      <span>{isAnonymous ? 'Posted anonymously · community report' : 'Community report'}</span>
                    </span>
                    {safeSourceUrl && (
                      <a href={safeSourceUrl} target="_blank" rel="noopener noreferrer" className="lv-idp-srclink" aria-label="Open source website">
                        Link <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                )}
                <p className="lv-idp-fine">
                  {isSystem
                    ? 'Shown as published by the source. Check it there for updates.'
                    : 'What a neighbour saw, not a police record. Check official channels before acting.'}{' '}
                  Emergencies: call 911.
                </p>
              </div>
            </section>

            {/* Resident lifecycle — only for community reports; official feeds
                (outages, weather) are not corroborated this way. */}
            {!isSystem && (
              <section className="lv-idp-ask" aria-label="Is this still happening?">
                <h3>Is this still happening?</h3>
                <p>{feedbackSummary(incidentFeedbackAggregate(incident), Date.now())}.</p>
                {user ? (
                  <div className="lv-idp-ask-actions">
                    {FEEDBACK_ACTIONS.map(([kind, label, FbIcon]) => (
                      <button
                        key={kind}
                        type="button"
                        disabled={feedbackPending !== null}
                        onClick={() => void submitFeedback(kind)}
                        aria-pressed={myKind === kind}
                        className="lv-idp-fb"
                      >
                        {myKind === kind ? <Check size={16} strokeWidth={2.6} /> : <FbIcon size={16} />}
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>Sign in to add your confirmation.</p>
                )}
              </section>
            )}

            {nearbyCamera && (
              <section className="lv-idp-section" aria-label="Referenced camera nearby">
                <p className="lv-o-eyebrow">City camera nearby</p>
                <button type="button" onClick={() => onOpenCamera(nearbyCamera.camera)} className="lv-idp-cam">
                  <img
                    src={`${nearbyCamera.camera.imageUrl}?t=${cameraStamp}`}
                    alt={`Current City of Calgary traffic-camera view at ${nearbyCamera.camera.location}`}
                    loading="eager"
                  />
                  <span className="lv-idp-cam-meta">
                    <span className="min-w-0">
                      <b>{nearbyCamera.camera.location}</b>
                      <small>{Math.round(nearbyCamera.distanceM)} m away · current view</small>
                      <em>Street context only—not footage of this report.</em>
                    </span>
                    <span className="lv-idp-cam-go"><Video size={14} /> View</span>
                  </span>
                </button>
              </section>
            )}

            {/* Share */}
            <section className="lv-idp-section" aria-label="Share this report">
              <p className="lv-o-eyebrow">Share with neighbours</p>
              <div className="lv-idp-share">
                <button type="button" onClick={() => void handleNativeShare()} className="lv-o-btn" aria-label="More share options">
                  <Share2 size={16} /> Share
                </button>
                <button type="button" onClick={() => void handleCopyLink()} className={cn('lv-o-btn', copied && 'is-done')}>
                  {copied ? <Check size={16} /> : <Link size={16} />}
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
                <button type="button" onClick={handleShareToX} className="lv-o-btn">
                  <Twitter size={16} /> Post on X
                </button>
                <button type="button" onClick={() => handleOpenShareWindow(whatsappUrl)} className="lv-o-btn">
                  <MessageCircle size={16} /> WhatsApp
                </button>
                <button type="button" onClick={() => handleOpenShareWindow(facebookUrl)} className="lv-o-btn">
                  <Facebook size={16} /> Facebook
                </button>
                <a href={emailUrl} className="lv-o-btn">
                  <Mail size={16} /> Email
                </a>
              </div>
            </section>

            {/* Moderation */}
            {canFlag && (
              flagConfirm ? (
                <div className="lv-idp-flagbox">
                  <p>
                    {existingFlaggers.length + 1 >= FLAG_THRESHOLD
                      ? 'Report as inappropriate? This hides it from the map now.'
                      : `Report as inappropriate? It stays visible until ${FLAG_THRESHOLD} neighbours flag it.`}
                  </p>
                  <div className="lv-idp-flag-actions">
                    <button type="button" onClick={() => void handleFlag()} disabled={flagging} className="lv-o-btn lv-o-btn-navy">
                      {flagging ? 'Reporting…' : 'Confirm'}
                    </button>
                    <button type="button" onClick={() => setFlagConfirm(false)} className="lv-o-btn">
                      Cancel
                    </button>
                  </div>
                  {flagError && <p className="lv-o-err">Could not submit report. Please try again.</p>}
                </div>
              ) : (
                <button type="button" onClick={() => setFlagConfirm(true)} className="lv-idp-flag">
                  <Flag size={15} />
                  Report inappropriate
                </button>
              )
            )}

            <p className="lv-idp-id">Report ID · {incident.id}</p>
          </div>

          {/* ── Sticky action bar — thumb zone on phones, always visible ── */}
          <div className="lv-idp-bar">
            {canNavigate && directionsUrl && (
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="lv-o-iconbtn"
                title="Open in Google Maps"
                aria-label="Open in Google Maps"
              >
                <Navigation size={19} />
              </a>
            )}
            <button type="button" onClick={() => onReportIncident(incident)} className="lv-o-btn lv-o-btn-yellow">
              <MessageSquarePlus size={18} className="lv-idp-bar-ico" />
              Report related
            </button>
            <button type="button" onClick={() => onViewNeighborhood(incident.neighborhood)} className="lv-o-btn lv-o-btn-blue">
              <MapPinned size={18} className="lv-idp-bar-ico" />
              Open area
              <ArrowRight size={16} className="lv-idp-bar-ico" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The subtitle under an official source: what kind of record, and who else covered it. */
function coverageLine(incident: Incident): string {
  const others = (incident.related_sources ?? []).filter((s) => s !== incident.source_name);
  if (others.length > 0) return `Also covered by ${others.join(', ')}`;
  if ((incident.related_count ?? 0) > 1) return `${incident.related_count} releases and updates on this, newest shown`;
  if (incident.source_type === 'calgary_open_data' && incident.category === 'crime') return 'A neighbour’s report to 311 · not police-confirmed';
  return 'Official / synced feed';
}
