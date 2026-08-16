import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { publicAsset } from '@/src/lib/utils';
import { MAP, CATEGORY } from '@/src/lib/tokens';
import { Siren, X, Loader2, MapPin, AlertCircle, Car, Construction, CloudRain, Navigation, AlertTriangle } from 'lucide-react';

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
  { id: 'emergency',      label: 'Emergency', icon: Siren,        color: CATEGORY.emergency },
  { id: 'crime',          label: 'Crime',     icon: AlertCircle,  color: CATEGORY.crime },
  { id: 'traffic',        label: 'Crash',     icon: Car,          color: CATEGORY.traffic },
  { id: 'infrastructure', label: 'Hazard',    icon: Construction, color: CATEGORY.infrastructure },
  { id: 'weather',        label: 'Weather',   icon: CloudRain,    color: CATEGORY.weather },
] as const;

export interface EmergencySubmitData {
  category: string;
  title: string;
  description: string;
  neighborhood: string;
  lat: number;
  lng: number;
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
}: EmergencyModalProps) {
  const [selectedType, setSelectedType] = useState<string>('emergency');
  const [description, setDescription] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // 'choose' = pick location method; 'form' = fill in details
  const [step, setStep] = useState<'choose' | 'form'>('choose');
  const submitDebounceRef = useRef(0);

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
    onSubmit({ category: selectedType, title, description: description.trim(), neighborhood: neighborhood.trim(), lat: activeLocation.lat, lng: activeLocation.lng });
    setSubmitted(true);
    setTimeout(() => {
      setDescription('');
      setNeighborhood('');
      setSelectedType('emergency');
      setSubmitted(false);
      setStep('choose');
      onClose();
      setIsSubmitting(false);
    }, 1200);
  };

  const handleClose = () => {
    setDescription('');
    setNeighborhood('');
    setStep('choose');
    setSubmitted(false);
    onClose();
  };

  // Hide modal while crosshair pin mode is active
  if (isPinMode) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm" style={{ background: 'rgba(30,15,15,0.5)' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 40 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md overflow-hidden shadow-[0_32px_80px_-24px_rgba(127,29,29,0.5)]"
            style={{ background: MAP.panel, border: `1.5px solid ${CATEGORY.emergency}` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pulsing top bar */}
            <div className="h-1.5 w-full animate-pulse" style={{ background: CATEGORY.emergency }} aria-hidden="true" />

            <div className="relative p-6 space-y-4">
              {/* The beacon, sitting behind the header rather than competing
                  with it — this is a form, and the artwork sets the register
                  without taking a turn in the reading order. */}
              <img
                src={publicAsset('images/illustration/emergency-siren.webp')}
                alt=""
                width={800} height={800} loading="lazy"
                className="pointer-events-none absolute -right-6 -top-8 w-36 opacity-[0.07] sm:w-44"
                aria-hidden="true"
              />

              {/* Header */}
              <div className="relative flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Siren size={15} className="animate-pulse" style={{ color: CATEGORY.emergency }} />
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.26em]" style={{ color: CATEGORY.emergency }}>Emergency signal</span>
                  </div>
                  <h2 className="font-display text-xl font-extrabold tracking-[-0.02em] leading-tight" style={{ color: MAP.ink }}>
                    {step === 'choose' ? 'Where is it?' : "What's happening?"}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: MAP.muted }}>Goes live instantly for everyone nearby</p>
                </div>
                <button onClick={handleClose} aria-label="Close emergency form" className="p-2 transition-colors hover:bg-black/5" style={{ color: MAP.muted }}>
                  <X size={18} />
                </button>
              </div>

              {/* ── Disclaimer ── */}
              <div className="flex items-start gap-2.5 px-3.5 py-3" style={{ background: 'rgba(192,57,43,0.07)', border: `1px solid ${CATEGORY.emergency}` }}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: CATEGORY.emergency }} />
                <p className="text-[11px] leading-relaxed" style={{ color: '#8A2A22' }}>
                  <span className="font-black">For life-threatening emergencies call 911 first.</span>{' '}
                  This tool is for community awareness only, not a substitute for emergency services. Do not submit false reports.
                </p>
              </div>

              {/* ── Step 1: Location ── */}
              {step === 'choose' && (
                <div className="space-y-2.5">
                  {locationAvailable ? (
                    <button
                      onClick={() => setStep('form')}
                      className="w-full flex items-center justify-between p-4 transition-all text-left group hover:-translate-y-0.5"
                      style={{ background: MAP.panel, border: `1.5px solid ${MAP.line}` }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 flex items-center justify-center" style={{ background: 'rgba(74,144,217,0.12)' }}>
                          <Navigation size={17} style={{ color: MAP.accent }} />
                        </div>
                        <div>
                          <p className="text-sm font-black" style={{ color: MAP.ink }}>Right where I am</p>
                          <p className="font-mono text-[10px] tabular-nums" style={{ color: MAP.muted }}>
                            {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'GPS active'}
                          </p>
                        </div>
                      </div>
                      <span className="transition-transform group-hover:translate-x-1" style={{ color: MAP.accent }}>→</span>
                    </button>
                  ) : (
                    <div className="p-4 flex items-start gap-3" style={{ background: 'rgba(199,127,24,0.09)', border: `1px solid ${MAP.line}`, borderLeft: `3px solid ${MAP.warn}` }}>
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: '#8A5710' }} />
                      <p className="text-xs" style={{ color: '#8A5710' }}>GPS unavailable. Use the pin below to mark the location.</p>
                    </div>
                  )}

                  <button
                    onClick={() => { onRequestMapPin?.(); }}
                    className="w-full flex items-center justify-between p-4 transition-all text-left group hover:-translate-y-0.5"
                    style={{ background: MAP.panel, border: `1.5px solid ${MAP.line}` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10 flex items-center justify-center" style={{ background: 'rgba(46,139,122,0.12)' }}>
                        <span className="absolute inset-2 rounded-full animate-ping opacity-25" style={{ background: MAP.ok }} aria-hidden="true" />
                        <MapPin size={17} style={{ color: MAP.ok }} />
                      </div>
                      <div>
                        <p className="text-sm font-black" style={{ color: MAP.ink }}>Drop a pin</p>
                        <p className="text-[11px]" style={{ color: MAP.muted }}>Pan the map to the exact spot</p>
                      </div>
                    </div>
                    <span className="transition-transform group-hover:translate-x-1" style={{ color: MAP.ok }}>→</span>
                  </button>
                </div>
              )}

              {/* ── Step 2: Details ── */}
              {step === 'form' && (
                <>
                  {/* Active location display */}
                  <div className="flex items-center justify-between px-3.5 py-2.5" style={{ background: 'rgba(46,139,122,0.09)', border: '1px solid rgba(46,139,122,0.35)' }}>
                    <div className="flex items-center gap-2">
                      <MapPin size={13} style={{ color: activeLocation ? MAP.ok : CATEGORY.emergency }} />
                      <span className="text-xs font-mono tabular-nums" style={{ color: MAP.ink }}>
                        {activeLocation
                          ? `${activeLocation.lat.toFixed(5)}, ${activeLocation.lng.toFixed(5)}`
                          : 'No location set'}
                      </span>
                    </div>
                    <button
                      onClick={() => setStep('choose')}
                      className="text-[11px] font-bold px-2.5 py-1 transition-colors hover:bg-black/5"
                      style={{ color: MAP.ink, border: `1px solid ${MAP.line}`, background: MAP.panel }}
                    >
                      Change
                    </button>
                  </div>

                  {/* Type selector */}
                  <div>
                    <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: MAP.muted }}>Type</p>
                    <div className="grid grid-cols-5 gap-2">
                      {EMERGENCY_TYPES.map(({ id, label, icon: Icon, color }) => {
                        const active = selectedType === id;
                        return (
                          <button
                            key={id}
                            onClick={() => setSelectedType(id)}
                            aria-pressed={active}
                            className="flex flex-col items-center gap-1.5 p-2 transition-all active:scale-95"
                            style={active
                              ? { background: color, border: `1.5px solid ${color}`, color: MAP.panel }
                              : { background: MAP.panel, border: `1.5px solid ${MAP.line}`, color: MAP.muted }}
                          >
                            <Icon size={16} style={{ color: active ? MAP.panel : color }} />
                            <span className="text-[8px] font-black uppercase leading-tight text-center">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Neighbourhood */}
                  <div>
                    <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: MAP.muted }}>Neighbourhood</p>
                    <select
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C0392B] font-bold"
                      style={{ background: MAP.panel, border: `1.5px solid ${MAP.line}`, color: MAP.ink }}
                    >
                      <option value="">Select area…</option>
                      {NEIGHBOURHOODS.map((n) => (
                        <option key={n.name} value={n.name}>{n.name}</option>
                      ))}
                      <option value="Other">Other / Not Listed</option>
                    </select>
                  </div>

                  {/* Description */}
                  <div>
                    <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: MAP.muted }}>What's happening?</p>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Collision blocking intersection, smoke from building, person needs help…"
                      rows={3}
                      autoFocus
                      className="w-full px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#C0392B] transition-all placeholder:font-medium"
                      style={{ background: MAP.panel, border: `1.5px solid ${MAP.line}`, color: MAP.ink }}
                    />
                    <p className="font-mono text-[9px] mt-1 text-right uppercase tracking-[0.12em]" style={{ color: description.trim().length >= 5 ? MAP.ok : MAP.faint }}>
                      {description.trim().length >= 5 ? '✓ Ready to send' : `${Math.max(0, 5 - description.trim().length)} more characters`}
                    </p>
                  </div>

                  {/* Reporter */}
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5" style={{ background: MAP.paper, border: `1px solid ${MAP.line}` }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black" style={{ background: CATEGORY.emergency, color: MAP.panel }}>
                      {userName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs" style={{ color: MAP.muted }}>Posting as <span className="font-bold" style={{ color: MAP.ink }}>{userName}</span> · never anonymous for SOS</span>
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit || isSubmitting}
                    className={`w-full h-14 font-black text-base tracking-wide flex items-center justify-center gap-3 transition-transform ${
                      canSubmit && !submitted
                        ? 'hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none'
                        : 'cursor-not-allowed'
                    }`}
                    style={
                      submitted
                        ? { background: MAP.ok, color: MAP.panel }
                        : canSubmit
                        ? { background: CATEGORY.emergency, color: MAP.panel, boxShadow: `4px 4px 0 ${MAP.inkDeep}` }
                        : { background: MAP.paper, color: MAP.faint, border: `1px solid ${MAP.line}` }
                    }
                  >
                    {isSubmitting ? (
                      <><Loader2 size={20} className="animate-spin" /> Sending alert…</>
                    ) : submitted ? (
                      <>✓ Live. Stay safe out there.</>
                    ) : (
                      <><Siren size={20} /> Send emergency signal</>
                    )}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
