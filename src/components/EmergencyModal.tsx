import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { CATEGORY, LIVE } from '@/src/lib/tokens';
import { Siren, X, Loader2, MapPin, AlertCircle, Car, Construction, CloudRain, Navigation, Image as ImageIcon, Phone, ArrowRight, Check } from 'lucide-react';
import '@/src/styles/map-overlays.css';
import { uploadIncidentImage } from '@/src/lib/storage';

const NEIGHBOURHOODS = [
  { name: 'Downtown', lat: 51.0478, lng: -114.0625 },
  { name: 'Beltline', lat: 51.0381, lng: -114.0680 },
  { name: 'Kensington', lat: 51.0603, lng: -114.0903 },
  { name: 'Bridgeland', lat: 51.0602, lng: -114.0412 },
  { name: 'Mission', lat: 51.0347, lng: -114.0670 },
  { name: 'Inglewood', lat: 51.0406, lng: -114.0201 },
  { name: 'Bowness', lat: 51.0975, lng: -114.1807 },
  { name: 'Saddleridge', lat: 51.1494, lng: -113.9670 },
  { name: 'Evanston', lat: 51.1902, lng: -114.0792 },
  { name: 'Mahogany', lat: 50.9011, lng: -113.9603 },
  { name: 'Auburn Bay', lat: 50.9099, lng: -114.0010 },
  { name: 'Signal Hill', lat: 51.0660, lng: -114.2161 },
  { name: 'Tuscany', lat: 51.1303, lng: -114.2208 },
  { name: 'Royal Oak', lat: 51.1303, lng: -114.1827 },
  { name: 'Panorama Hills', lat: 51.1655, lng: -114.0448 },
  { name: 'Midnapore', lat: 50.9497, lng: -114.0683 },
  { name: 'Shawnessy', lat: 50.9251, lng: -114.1245 },
  { name: 'McKenzie Towne', lat: 50.9083, lng: -113.9534 },
  { name: 'Cranston', lat: 50.8986, lng: -113.9836 },
  { name: 'Copperfield', lat: 50.9141, lng: -113.9951 },
] as const;

function detectNeighbourhood(lat: number, lng: number): string {
  const MAX_DIST = 0.035;
  let best = { name: '', dist: Infinity };
  for (const n of NEIGHBOURHOODS) {
    const dLat = lat - n.lat;
    const dLng = (lng - n.lng) * Math.cos(n.lat * (Math.PI / 180));
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist < MAX_DIST && dist < best.dist) best = { name: n.name, dist };
  }
  return best.name;
}

// The severity ramp from tokens, not five unrelated Tailwind hues — these are
// the same colours the pins carry on the map.
const EMERGENCY_TYPES = [
  { id: 'emergency',      label: 'Emergency', icon: Siren,        color: CATEGORY.emergency,      fg: '#FFFFFF', tint: '#FFE1DC' },
  { id: 'crime',          label: 'Crime',     icon: AlertCircle,  color: CATEGORY.crime,          fg: '#FFFFFF', tint: '#FDE6DE' },
  { id: 'traffic',        label: 'Crash',     icon: Car,          color: CATEGORY.traffic,        fg: LIVE.ink,  tint: '#FDEFD6' },
  { id: 'infrastructure', label: 'Hazard',    icon: Construction, color: CATEGORY.infrastructure, fg: '#FFFFFF', tint: '#E3EBFB' },
  { id: 'weather',        label: 'Weather',   icon: CloudRain,    color: CATEGORY.weather,        fg: '#FFFFFF', tint: '#DDF2F7' },
] as const;

export interface EmergencySubmitData {
  category: string;
  title: string;
  description: string;
  neighborhood: string;
  lat: number;
  lng: number;
  image_url?: string;
}

interface EmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: EmergencySubmitData) => void;
  /** GPS location - null when denied */
  location: { lat: number; lng: number } | null;
  /** Coordinates set via crosshair pin - managed by parent */
  pinLocation: { lat: number; lng: number } | null;
  locationAvailable: boolean;
  userName: string;
  /** Called when user wants to place a crosshair pin */
  onRequestMapPin?: () => void;
  isPinMode?: boolean;
  /** Owner of the Storage upload path; photos are skipped when absent. */
  userUid?: string;
}

export default function EmergencyModal({
  isOpen,
  onClose,
  onSubmit,
  location,
  pinLocation,
  locationAvailable,
  userName,
  onRequestMapPin,
  isPinMode = false,
  userUid,
}: EmergencyModalProps) {
  const [selectedType, setSelectedType] = useState<string>('emergency');
  const [description, setDescription] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  // 'choose' = pick location method; 'form' = fill in details
  const [step, setStep] = useState<'choose' | 'form'>('choose');
  const submitDebounceRef = useRef(0);
  // Phones get a bottom sheet; desktop a centred card.
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const fn = () => setIsPhone(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  // Crosshair pin / tap coordinates take precedence over GPS
  const activeLocation = pinLocation ?? location;

  // Auto-detect neighbourhood whenever active location changes
  useEffect(() => {
    if (!activeLocation) return;
    const detected = detectNeighbourhood(activeLocation.lat, activeLocation.lng);
    if (detected) setNeighborhood(detected);
  }, [activeLocation?.lat, activeLocation?.lng]);

  // Advance to form when a pin is confirmed while we're choosing
  // (isPinMode going false with a new pinLocation)
  const prevIsPinModeRef = useRef(isPinMode);
  if (prevIsPinModeRef.current && !isPinMode && pinLocation && step === 'choose') {
    setStep('form');
  }
  prevIsPinModeRef.current = isPinMode;

  const canSubmit = description.trim().length >= 5 && !!activeLocation && neighborhood.trim().length >= 2;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting || !activeLocation) return;
    const now = Date.now();
    if (now - submitDebounceRef.current < 500) return;
    submitDebounceRef.current = now;
    setIsSubmitting(true);
    const label = EMERGENCY_TYPES.find((t) => t.id === selectedType)?.label ?? 'Emergency';
    const title = `${label}: ${description.trim().slice(0, 60)}`;

    // An urgent report must reach the map even if its attachment does not, so
    // a failed upload is logged and dropped rather than blocking the send.
    let image_url: string | undefined;
    if (imageFile && userUid) {
      try {
        image_url = await uploadIncidentImage(userUid, imageFile);
      } catch (error) {
        console.error('[CalgaryWatch] Emergency photo upload failed; sending report without it:', error);
      }
    }

    onSubmit({ category: selectedType, title, description: description.trim(), neighborhood: neighborhood.trim(), lat: activeLocation.lat, lng: activeLocation.lng, ...(image_url ? { image_url } : {}) });
    setSubmitted(true);
    setTimeout(() => {
      setDescription('');
      setNeighborhood('');
      setSelectedType('emergency');
      setImageFile(null);
      setImagePreview(null);
      setImageError(null);
      setSubmitted(false);
      setStep('choose');
      onClose();
      setIsSubmitting(false);
    }, 1200);
  };

  const handleClose = () => {
    setDescription('');
    setNeighborhood('');
    setImageFile(null);
    setImagePreview(null);
    setImageError(null);
    setStep('choose');
    setSubmitted(false);
    onClose();
  };

  // Hide modal while crosshair pin mode is active
  if (isPinMode) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="lv-o lv-em-wrap lv-o-scrim">
          <motion.div
            initial={isPhone ? { y: '100%' } : { opacity: 0, scale: 0.96, y: 20 }}
            animate={isPhone ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={isPhone ? { y: '100%' } : { opacity: 0, scale: 0.96, y: 20 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Emergency"
            className={cn('lv-em', isPhone && 'lv-em-phone')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lv-em-scroll no-scrollbar">
              {/* ── First: get help. Nothing on this sheet competes with the call. ── */}
              <div className="lv-em-top">
                {isPhone && <div className="lv-o-grabber pb-2" aria-hidden="true"><span /></div>}
                <div className="lv-em-top-row">
                  <span className="lv-em-eyebrow"><Siren size={16} aria-hidden="true" /> Emergency</span>
                  <button type="button" onClick={handleClose} aria-label="Close emergency form" className="lv-o-iconbtn">
                    <X size={20} strokeWidth={2.2} />
                  </button>
                </div>
                <h2 className="lv-em-title">Someone in danger? Call 911 now.</h2>
                <p className="lv-em-sub">Police, fire and ambulance. Calling is always the fastest way to get help.</p>

                <a href="tel:911" className="lv-em-call">
                  <Phone size={28} strokeWidth={2.4} aria-hidden="true" />
                  Call 911
                </a>
                <a href="tel:4032661234" className="lv-em-nonem">
                  <span>Not urgent? Calgary Police non-emergency</span>
                  <b>403-266-1234</b>
                </a>
                <p className="lv-em-fine">
                  CalgaryWatch doesn't dispatch help and doesn't hear police radio. Posting here does not contact 911.
                </p>
              </div>

              {/* ── Then, optionally: a pin neighbours can see. ── */}
              <div className="lv-em-post">
                <div className="lv-em-post-head">
                  <p className="lv-o-eyebrow">Then, if it's safe · optional</p>
                  <h3 className="mt-1.5">Let neighbours know</h3>
                  <p>Posts a pin on the map so people nearby can steer clear. Please don't post false reports.</p>
                </div>

                {/* ── Step 1: Location ── */}
                {step === 'choose' && (
                  <>
                    {locationAvailable ? (
                      <button type="button" onClick={() => setStep('form')} className="lv-rf-choice">
                        <span className="lv-rf-choice-icon" style={{ background: '#E3EBFB', color: LIVE.blue }}><Navigation size={22} /></span>
                        <span className="min-w-0 flex-1">
                          <b>Right where I am</b>
                          <small className="tabular-nums">{location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'GPS active'}</small>
                        </span>
                        <ArrowRight size={20} className="shrink-0" />
                      </button>
                    ) : (
                      <div className="lv-rf-warn">
                        <b>Location is off</b>
                        Use a pin to mark where it is.
                      </div>
                    )}

                    <button type="button" onClick={() => { onRequestMapPin?.(); }} className="lv-rf-choice">
                      <span className="lv-rf-choice-icon" style={{ background: LIVE.yellow, color: LIVE.ink }}><MapPin size={22} /></span>
                      <span className="min-w-0 flex-1">
                        <b>Drop a pin</b>
                        <small>Pan the map to the exact spot</small>
                      </span>
                      <ArrowRight size={20} className="shrink-0" />
                    </button>
                  </>
                )}

                {/* ── Step 2: Details ── */}
                {step === 'form' && (
                  <>
                    {/* Active location display */}
                    <div className="lv-rf-loc">
                      <div className="lv-rf-loc-text">
                        <MapPin size={20} className="shrink-0" aria-hidden="true" />
                        <span className="min-w-0">
                          <b>{pinLocation ? 'Pin placed' : activeLocation ? 'Your location' : 'No location set'}</b>
                          {activeLocation && <small>{activeLocation.lat.toFixed(5)}, {activeLocation.lng.toFixed(5)}</small>}
                        </span>
                      </div>
                      <button type="button" onClick={() => setStep('choose')} className="lv-o-btn">
                        Change
                      </button>
                    </div>

                    {/* Type selector */}
                    <div>
                      <p className="lv-o-label">What kind?</p>
                      <div className="lv-em-types" role="group" aria-label="Type">
                        {EMERGENCY_TYPES.map(({ id, label, icon: Icon, color, fg, tint }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setSelectedType(id)}
                            aria-pressed={selectedType === id}
                            className="lv-em-type"
                            style={{ ['--cat' as string]: color, ['--cat-fg' as string]: fg, ['--tint' as string]: tint }}
                          >
                            <span aria-hidden="true"><Icon size={16} strokeWidth={2.2} /></span>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Neighbourhood */}
                    <div>
                      <label className="lv-o-label" htmlFor="sos-neighbourhood">Neighbourhood</label>
                      <div className="lv-rf-select">
                        <select
                          id="sos-neighbourhood"
                          value={neighborhood}
                          onChange={(e) => setNeighborhood(e.target.value)}
                          className="lv-o-input"
                        >
                          <option value="">Select area…</option>
                          {NEIGHBOURHOODS.map((n) => (
                            <option key={n.name} value={n.name}>{n.name}</option>
                          ))}
                          <option value="Other">Other / Not Listed</option>
                        </select>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="lv-o-label" htmlFor="sos-description">What's happening?</label>
                      <textarea
                        id="sos-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Collision blocking the intersection, smoke from a building…"
                        rows={3}
                        className="lv-o-input"
                      />
                      <p className={cn('lv-em-ready', description.trim().length >= 5 && 'is-ok')}>
                        {description.trim().length >= 5 ? 'Ready to post' : `${Math.max(0, 5 - description.trim().length)} more characters`}
                      </p>
                    </div>

                    {/* Photo — optional, and never allowed to hold up an SOS. */}
                    {userUid && (
                      <div>
                        <p className="lv-o-label">Photo <small>Optional</small></p>
                        {imagePreview ? (
                          <div className="lv-rf-preview">
                            <img src={imagePreview} alt="Preview" />
                            <button
                              type="button"
                              onClick={() => { setImageFile(null); setImagePreview(null); setImageError(null); }}
                              className="lv-o-iconbtn"
                              aria-label="Remove photo"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        ) : (
                          <label className="lv-rf-drop" style={{ minHeight: 92 }}>
                            <ImageIcon size={22} aria-hidden="true" />
                            <b style={{ fontSize: 16 }}>Attach a photo</b>
                            <input
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                setImageError(null);
                                if (!file) { setImageFile(null); setImagePreview(null); return; }
                                if (file.size > 25 * 1024 * 1024) {
                                  setImageError('Photo must be under 25 MB.');
                                  setImageFile(null);
                                  setImagePreview(null);
                                  return;
                                }
                                setImageFile(file);
                                setImagePreview(URL.createObjectURL(file));
                              }}
                            />
                          </label>
                        )}
                        {imageError && <p className="lv-o-err">{imageError}</p>}
                      </div>
                    )}

                    {/* Reporter */}
                    <div className="lv-rf-who">
                      <span className="lv-rf-initial" aria-hidden="true">{userName.charAt(0).toUpperCase()}</span>
                      <span className="min-w-0">
                        <b className="truncate">Posting as {userName}</b>
                        <small>Emergency posts are never anonymous.</small>
                      </span>
                    </div>

                    {/* Submit */}
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!canSubmit || isSubmitting}
                      className={cn('lv-o-btn lv-o-btn-navy lv-em-send', submitted && 'is-done')}
                    >
                      {isSubmitting && !submitted ? (
                        <><Loader2 size={20} className="animate-spin" /> Posting…</>
                      ) : submitted ? (
                        <><Check size={20} strokeWidth={2.6} /> Posted to the map. Stay safe.</>
                      ) : (
                        <><MapPin size={20} /> Post to the map</>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
