import { Incident, STATUS_ICONS, CATEGORY_ICONS, FLAG_THRESHOLD, isPubliclyVisible } from '@/src/types';
import { findNearestCamera, type TrafficCamera } from '@/src/hooks/useTrafficCameras';
import {
  X, Share2, Navigation, ExternalLink, User, AlertCircle, Link, Twitter, Mail, MessageCircle, Facebook, Flag,
  ArrowRight, ArrowUpRight, MapPinned, MessageSquarePlus, Check, Eye, Activity, CircleCheck, Video, Phone,
  CalendarDays, Home, Radio, Sparkles, LogIn,
} from 'lucide-react';
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
import { areaPulse, reportClock, reportGuide } from '@/src/lib/reportGuide';
import { compassFrom, distanceLabel } from '@/src/lib/nearMe';
import { getDistance } from '@/src/lib/geo';
import type { PickItem } from '@/src/lib/eventPicks';
import '@/src/styles/map-overlays.css';
import '@/src/styles/map-report.css';

/**
 * Straight from CATEGORY, because this panel's cover has to be the same
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

/** Reports younger than this get the live dot in the cover. */
const FRESH_MS = 3 * 60 * 60 * 1000;

function buildIncidentUrl(incidentId: string): string {
  if (typeof window === 'undefined') return `https://calgarywatch.ca/map?i=${incidentId}`;
  return `${window.location.origin}/map?i=${encodeURIComponent(incidentId)}`;
}

/**
 * Up to three real, published plans this week, closest to the report first.
 * The listings are loaded only when a report opens, from the same index the
 * events pages use, so the map's first load doesn't carry them.
 */
function useNearbyPlans(incident: Incident | null): { items: PickItem[]; near: boolean } | null {
  const [plans, setPlans] = useState<{ id: string; items: PickItem[]; near: boolean } | null>(null);
  const id = incident?.id;
  const lat = incident?.lat;
  const lng = incident?.lng;
  useEffect(() => {
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    let live = true;
    Promise.all([import('@/src/data/discovery'), import('@/src/lib/eventPicks')])
      .then(([{ discoveryRepository }, { buildEventPicks }]) => {
        if (!live) return;
        const { picks } = buildEventPicks({
          entities: discoveryRepository.list(),
          occurrences: discoveryRepository.occurrences(),
          interests: [],
          home: { lat: lat!, lng: lng! },
          days: 7,
          limit: 24,
        });
        const close = picks
          .filter((p) => p.distanceM !== null && p.distanceM <= 5000)
          .sort((a, b) => a.distanceM! - b.distanceM!);
        const rest = picks.filter((p) => !close.includes(p));
        setPlans({ id, items: [...close, ...rest].slice(0, 3), near: close.length > 0 });
      })
      .catch(() => { if (live) setPlans({ id, items: [], near: false }); });
    return () => { live = false; };
  }, [id, lat, lng]);
  return plans && plans.id === id ? plans : null;
}

function planDay(iso: string): { dow: string; day: string } {
  const d = new Date(iso);
  const tz = 'America/Edmonton';
  return {
    dow: d.toLocaleDateString('en-CA', { timeZone: tz, weekday: 'short' }),
    day: d.toLocaleDateString('en-CA', { timeZone: tz, day: 'numeric' }),
  };
}

function planTime(iso: string): string {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });
  return /^12:00\sa\.?m\.?$/i.test(hm) ? 'All day' : hm;
}

interface IncidentDetailPanelProps {
  incident: Incident | null;
  /** What the map is showing, for the "in this area today" count. */
  incidents?: Incident[];
  /** Loaded city traffic cameras, used to find one overlooking this location. */
  trafficCameras?: TrafficCamera[];
  userLocation?: { lat: number; lng: number } | null;
  /** The signed-in reader's home community, if they set one. */
  homeNeighbourhood?: string | null;
  onSignIn?: () => void;
  onClose: () => void;
  onViewNeighborhood: (neighborhood: string) => void;
  onReportIncident: (incident: Incident) => void;
  onOpenCamera: (camera: TrafficCamera) => void;
}

export default function IncidentDetailPanel({
  incident, incidents, trafficCameras, userLocation, homeNeighbourhood, onSignIn,
  onClose, onViewNeighborhood, onReportIncident, onOpenCamera,
}: IncidentDetailPanelProps) {
  const [isMobileSheet, setIsMobileSheet] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false
  );
  // Must be declared before any early return to satisfy Rules of Hooks
  const [copied, setCopied] = useState(false);
  const [moreShare, setMoreShare] = useState(false);
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
  const plans = useNearbyPlans(incident);

  useEffect(() => {
    setFlagged(false);
    setFlagConfirm(false);
    setFlagError(false);
    setMoreShare(false);
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

  const now = Date.now();
  const guide = reportGuide(incident);
  const isSystem = guide.origin !== 'neighbour' && guide.origin !== 'example';
  const isDemo = guide.origin === 'example';
  const isMine = Boolean(user && incident.authorUid && user.uid === incident.authorUid);

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
  const reporterName = isMine ? 'You' : isAnonymous ? 'A neighbour' : (incident.name?.trim() || 'Community Member');
  const reporterInitial = (isAnonymous ? '' : reporterName.charAt(0).toUpperCase()) || 'C';
  const directionsUrl = canNavigate
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(incident.lat)},${encodeURIComponent(incident.lng)}`
    : null;

  const incidentUrl = buildIncidentUrl(incident.id);
  const emoji = CATEGORY_EMOJI[incident.category] ?? '📍';
  const relativeTime = formatRelativeTime(incident.timestamp, now);
  const place = incident.neighborhood || 'Calgary';
  const hasPlace = place.toLowerCase() !== 'calgary';
  const fresh = now - incident.timestamp <= FRESH_MS && now >= incident.timestamp;
  const inMyArea = Boolean(user && homeNeighbourhood && hasPlace && homeNeighbourhood.trim().toLowerCase() === place.trim().toLowerCase());

  // At a glance: three facts every report has an answer for.
  const pulse = incidents ? areaPulse(incident, incidents, now) : 0;
  const awayKm = userLocation && hasCoords ? getDistance(userLocation.lat, userLocation.lng, incident.lat, incident.lng) : null;
  const agg = incidentFeedbackAggregate(incident);
  const backers = Math.max(agg.corroborations, (incident.report_count ?? 1) - 1);
  const glance: { k: string; v: string; s: string }[] = [
    { k: incident.timestamp > now ? 'Starts' : 'Posted', v: shortAgo(incident.timestamp, now), s: reportClock(incident.timestamp, now) },
    hasPlace
      ? { k: 'Last 24 h', v: pulse === 0 ? 'Just this' : `+${pulse}`, s: pulse === 0 ? `Only one in ${place}` : `more in ${place}` }
      : { k: 'Where', v: 'City-wide', s: 'No single community' },
    awayKm !== null
      ? { k: 'From you', v: distanceLabel(awayKm), s: `${compassFrom(userLocation!, incident)} of you` }
      : isSystem
        ? { k: 'Source', v: guide.origin === 'police' ? 'CPS' : guide.origin === 'city311' ? '311' : guide.origin === 'news' ? 'News' : 'Feed', s: incident.source_name || 'Official feed' }
        : backers > 0
          ? { k: 'Backed by', v: String(backers), s: backers === 1 ? 'other neighbour' : 'other neighbours' }
          : { k: 'Backed by', v: 'New', s: 'No one else yet' },
  ];

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
        setMoreShare(true);
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
    ? { chip: 'Example', chipClass: 'is-dashed' }
    : isSystem
      ? { chip: guide.origin === 'police' ? 'Police release' : guide.origin === 'news' ? 'News story' : guide.origin === 'city311' ? 'City 311' : 'Official source', chipClass: 'is-navy' }
      : { chip: 'Neighbour report', chipClass: 'is-yellow' };

  return (
    <AnimatePresence>
      {incident && (
        <motion.div
          key="incident-panel"
          initial={sheetMotion.initial}
          animate={sheetMotion.animate}
          exit={sheetMotion.exit}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          role="dialog"
          aria-label={`Report: ${incident.title}`}
          className={cn('lv-o lv-idp lv-rp', isMobileSheet ? 'lv-idp-phone' : 'lv-idp-desk')}
          data-cat={incident.category}
          style={{ willChange: 'transform', ['--cat' as string]: cat.color, ['--cat-fg' as string]: cat.fg }}
        >
          <div className="lv-idp-body lv-rp-scroll no-scrollbar">
            {/* ── Cover: the category at full strength, the title on the night sky. ── */}
            <section className="lv-rp-cover" aria-label="Report">
              <span className="lv-rp-cover-glow" aria-hidden="true" />
              <span className="lv-rp-cover-grid" aria-hidden="true" />
              {isMobileSheet && <div className="lv-rp-grabber" aria-hidden="true"><span /></div>}
              <div className="lv-rp-cover-top">
                <span className="lv-rp-badge" aria-hidden="true"><Icon size={30} strokeWidth={2.3} /></span>
                <button type="button" onClick={onClose} className="lv-rp-x" aria-label="Close incident details">
                  <X size={20} strokeWidth={2.6} />
                </button>
              </div>
              <p className="lv-rp-kicker">
                <b>{cat.label}</b>
                <span aria-hidden="true">/</span>
                <span>{place}</span>
              </p>
              <h2 className="lv-rp-title">{incident.title}</h2>
              <div className="lv-rp-live">
                <span className={cn('lv-rp-dot', fresh && 'is-fresh')} aria-hidden="true" />
                <span>{relativeTime}</span>
              </div>
              <div className="lv-rp-chips">
                <span className={cn('lv-rp-chip', provenance.chipClass)}>{provenance.chip}</span>
                {!isSystem && !isDemo && (
                  <span className={cn('lv-rp-chip', incident.verified_status === 'unverified' && 'is-dashed')}>
                    {StatusIcon ? <StatusIcon size={13} aria-hidden="true" /> : undefined}
                    {status.label}
                  </span>
                )}
                {isMine && <span className="lv-rp-chip is-cyan"><Sparkles size={13} aria-hidden="true" />You posted this</span>}
                {inMyArea && <span className="lv-rp-chip is-cyan"><Home size={13} aria-hidden="true" />Your area</span>}
              </div>
              <span className="lv-rp-skyline" aria-hidden="true" />
            </section>

            <div className="lv-rp-sheet">
              {/* At a glance */}
              <dl className="lv-rp-glance">
                {glance.map((g) => (
                  <div key={g.k} className="lv-rp-tile">
                    <dt>{g.k}</dt>
                    <dd><b>{g.v}</b><span>{g.s}</span></dd>
                  </div>
                ))}
              </dl>

              {/* The reporter's own photo leads: the most direct evidence in the report. */}
              {incident.image_url && (
                <a href={incident.image_url} target="_blank" rel="noopener noreferrer" className="lv-rp-photo" aria-label="Open the reporter's photo">
                  <img src={incident.image_url} alt="Photo submitted with this report" loading="lazy" />
                </a>
              )}

              {incident.description && <p className="lv-rp-desc">{incident.description}</p>}

              {/* What this is, and who is behind it. */}
              <section className="lv-rp-what" aria-label="What this is">
                <div className="lv-rp-who">
                  {isSystem ? (
                    <span className={cn('lv-idp-avatar', 'is-official')}>
                      {safeSourceLogoUrl ? <img src={safeSourceLogoUrl} alt="" referrerPolicy="no-referrer" /> : <Icon size={18} />}
                    </span>
                  ) : (
                    <span className={cn('lv-idp-avatar', isDemo && 'is-demo')}>
                      {isDemo || isAnonymous ? <User size={18} /> : reporterInitial}
                    </span>
                  )}
                  <span className="lv-idp-who">
                    <b>
                      {isSystem
                        ? (incident.source_name || 'Official source')
                        : isDemo ? 'Example report' : reporterName}
                    </b>
                    <span>
                      {isSystem
                        ? coverageLine(incident)
                        : isDemo
                          ? 'Illustrative anonymous example — not a real incident'
                          : isAnonymous ? 'Posted anonymously · community report' : 'Community report'}
                    </span>
                  </span>
                  {safeSourceUrl && (
                    <a href={safeSourceUrl} target="_blank" rel="noopener noreferrer" className="lv-idp-srclink" aria-label="Open source website">
                      {isSystem ? 'Source' : 'Link'} <ExternalLink size={14} />
                    </a>
                  )}
                </div>
                <h3 className="lv-rp-what-h">{guide.whatTitle}</h3>
                <p className="lv-rp-what-p">{guide.what}</p>
              </section>

              {/* Resident lifecycle — only for community reports; official feeds
                  are not corroborated this way. */}
              {!isSystem && !isDemo && (
                <section className="lv-rp-ask" aria-label="Is this still happening?">
                  <div className="lv-rp-ask-head">
                    <Radio size={18} strokeWidth={2.6} aria-hidden="true" />
                    <h3>Is this still happening?</h3>
                  </div>
                  <p>{feedbackSummary(agg, now)}. {isMine ? 'Let neighbours know if it’s over.' : 'One tap helps the next neighbour who opens this.'}</p>
                  {user ? (
                    <div className="lv-rp-ask-actions">
                      {FEEDBACK_ACTIONS.filter(([kind]) => !isMine || kind !== 'saw_it').map(([kind, label, FbIcon]) => (
                        <button
                          key={kind}
                          type="button"
                          disabled={feedbackPending !== null}
                          onClick={() => void submitFeedback(kind)}
                          aria-pressed={myKind === kind}
                          className="lv-rp-fb"
                        >
                          {myKind === kind ? <Check size={16} strokeWidth={2.6} /> : <FbIcon size={16} />}
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button type="button" className="lv-rp-signin" onClick={onSignIn} disabled={!onSignIn}>
                      <LogIn size={17} strokeWidth={2.6} />
                      Sign in to confirm
                    </button>
                  )}
                </section>
              )}

              {/* What to do now: the steps, and who to call. */}
              <section className="lv-rp-do" aria-label="What you can do">
                <p className="lv-rp-eyebrow">What you can do</p>
                <ol className="lv-rp-steps">
                  {guide.steps.map((s, k) => (
                    <li key={s}><span aria-hidden="true">{k + 1}</span><p>{s}</p></li>
                  ))}
                </ol>
                {guide.calls.length > 0 && (
                  <div className="lv-rp-calls">
                    {guide.calls.map((c) => (
                      <a key={c.href} href={c.href} className={cn('lv-rp-call', c.primary && 'is-primary')}>
                        <Phone size={16} strokeWidth={2.6} aria-hidden="true" />
                        <span><b>{c.label}</b><small>{c.note}</small></span>
                      </a>
                    ))}
                  </div>
                )}
                {guide.topic && (
                  <a href={guide.topic.path} className="lv-rp-guide">
                    <span><small>CalgaryWatch guide</small><b>{guide.topic.label} in Calgary</b></span>
                    <ArrowUpRight size={18} strokeWidth={2.6} aria-hidden="true" />
                  </a>
                )}
              </section>

              {nearbyCamera && (
                <section className="lv-idp-section" aria-label="Referenced camera nearby">
                  <p className="lv-rp-eyebrow">City camera nearby</p>
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

              {/* The area beyond this one report. */}
              {hasPlace && (
                <button type="button" className="lv-rp-area" onClick={() => onViewNeighborhood(incident.neighborhood)}>
                  <span className="lv-rp-area-ico" aria-hidden="true"><MapPinned size={22} strokeWidth={2.4} /></span>
                  <span className="lv-rp-area-txt">
                    <small>Know your community</small>
                    <b>{place}, beyond this report</b>
                    <em>What neighbours reported lately, and what the City’s open data shows.</em>
                  </span>
                  <ArrowRight size={20} strokeWidth={2.6} aria-hidden="true" />
                </button>
              )}

              {/* Life in the area goes on: a few real plans close by this week. */}
              <section className="lv-rp-plans" aria-label="On this week">
                <div className="lv-rp-plans-head">
                  <span className="lv-rp-plans-ico" aria-hidden="true"><CalendarDays size={18} strokeWidth={2.6} /></span>
                  <span>
                    <p className="lv-rp-plans-k">{plans?.near && hasPlace ? `Near ${place} this week` : 'On in Calgary this week'}</p>
                    <h3>Out and about anyway?</h3>
                  </span>
                </div>
                {plans === null ? (
                  <div className="lv-rp-plans-list" aria-hidden="true">
                    <span className="lv-rp-plan is-ghost" /><span className="lv-rp-plan is-ghost" />
                  </div>
                ) : plans.items.length > 0 ? (
                  <div className="lv-rp-plans-list">
                    {plans.items.map((p) => {
                      const d = planDay(p.start);
                      return (
                        <a key={p.key} href={p.path} className="lv-rp-plan">
                          <span className="lv-rp-plan-date" aria-hidden="true"><small>{d.dow}</small><b>{d.day}</b></span>
                          <span className="lv-rp-plan-txt">
                            <b>{p.title}</b>
                            <small>
                              {[planTime(p.start), p.venue || p.neighbourhood, p.distanceM !== null && p.distanceM <= 5000 ? distanceLabel(p.distanceM / 1000) : null]
                                .filter(Boolean).join(' · ')}
                            </small>
                          </span>
                          {p.free && <span className="lv-rp-plan-free">Free</span>}
                        </a>
                      );
                    })}
                  </div>
                ) : null}
                <a href="/events" className="lv-rp-plans-all">See everything on this week <ArrowRight size={16} strokeWidth={2.6} /></a>
              </section>

              {/* Share */}
              <section className="lv-rp-share" aria-label="Share this report">
                <p className="lv-rp-eyebrow">Tell your street</p>
                <div className="lv-rp-share-row">
                  <button type="button" onClick={() => void handleNativeShare()} className="lv-rp-sh is-main" aria-label="Share this report">
                    <Share2 size={17} strokeWidth={2.4} /> Share
                  </button>
                  <button type="button" onClick={() => void handleCopyLink()} className={cn('lv-rp-sh', copied && 'is-done')}>
                    {copied ? <Check size={17} /> : <Link size={17} />}
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                  <button type="button" onClick={() => handleOpenShareWindow(whatsappUrl)} className="lv-rp-sh">
                    <MessageCircle size={17} /> WhatsApp
                  </button>
                  {!moreShare && (
                    <button type="button" onClick={() => setMoreShare(true)} className="lv-rp-sh is-more" aria-label="More ways to share">
                      More
                    </button>
                  )}
                  {moreShare && (
                    <>
                      <button type="button" onClick={handleShareToX} className="lv-rp-sh"><Twitter size={17} /> Post on X</button>
                      <button type="button" onClick={() => handleOpenShareWindow(facebookUrl)} className="lv-rp-sh"><Facebook size={17} /> Facebook</button>
                      <a href={emailUrl} className="lv-rp-sh"><Mail size={17} /> Email</a>
                    </>
                  )}
                </div>
              </section>

              <p className="lv-rp-fine">
                {isSystem
                  ? 'Shown as published by the source. Check it there for updates.'
                  : 'What a neighbour saw, not a police record. Check official channels before acting.'}{' '}
                Emergencies: call 911.
              </p>

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
          </div>

          {/* ── Sticky action bar — thumb zone on phones, always visible ── */}
          <div className="lv-idp-bar lv-rp-bar">
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

/** "12 min", "3 h", "2 d": the big number in the Posted tile. */
function shortAgo(timestamp: number, now: number): string {
  // Planned work (a scheduled outage) is stamped at its future start.
  const ahead = timestamp > now + 60000;
  const m = Math.round(Math.abs(now - timestamp) / 60000);
  const h = Math.round(m / 60);
  const span = m < 1 ? '' : m < 60 ? `${m} min` : h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
  if (!span) return 'Now';
  return ahead ? `In ${span}` : span;
}

/** The subtitle under an official source: what kind of record, and who else covered it. */
function coverageLine(incident: Incident): string {
  const others = (incident.related_sources ?? []).filter((s) => s !== incident.source_name);
  if (others.length > 0) return `Also covered by ${others.join(', ')}`;
  if ((incident.related_count ?? 0) > 1) return `${incident.related_count} releases and updates on this, newest shown`;
  if ((incident.repeat_count ?? 0) > 1) return `${incident.repeat_count} separate records like this at this spot, newest shown`;
  if (incident.source_type === 'calgary_open_data' && incident.category === 'crime') return 'A neighbour’s report to 311 · not police-confirmed';
  return 'Official / synced feed';
}
