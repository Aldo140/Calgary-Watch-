import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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

const EMERGENCY_TYPES = [
  { id: 'emergency',      label: 'Emergency',  icon: Siren,         color: 'bg-red-600',    ring: 'ring-red-500' },
  { id: 'crime',          label: 'Crime',       icon: AlertCircle,   color: 'bg-rose-600',   ring: 'ring-rose-500' },
  { id: 'traffic',        label: 'Crash',       icon: Car,           color: 'bg-orange-500', ring: 'ring-orange-400' },
  { id: 'infrastructure', label: 'Hazard',      icon: Construction,  color: 'bg-yellow-600', ring: 'ring-yellow-500' },
  { id: 'weather',        label: 'Weather',     icon: CloudRain,     color: 'bg-purple-600', ring: 'ring-purple-500' },
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
            className="w-full max-w-md rounded-[1.6rem] overflow-hidden shadow-[0_32px_80px_-24px_rgba(127,29,29,0.5)]"
            style={{ background: '#FFFDF8', border: '1px solid rgba(220,38,38,0.35)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pulsing top bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-red-600 via-rose-500 to-orange-500 animate-pulse" />

            <div className="p-6 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Siren size={15} className="animate-pulse" style={{ color: '#C0392B' }} />
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[0.26em]" style={{ color: '#C0392B' }}>Emergency signal</span>
                  </div>
                  <h2 className="font-display text-xl font-extrabold tracking-[-0.02em] leading-tight" style={{ color: '#1C2B3A' }}>
                    {step === 'choose' ? 'Where is it?' : "What's happening?"}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: '#5A6B7D' }}>Goes live instantly for everyone nearby</p>
                </div>
                <button onClick={handleClose} className="p-2 text-stone-500 light:text-stone-500 hover:text-white light:hover:text-stone-900 hover:bg-white/10 light:hover:bg-white/80 rounded-xl transition-all">
                  <X size={18} />
                </button>
              </div>

              {/* ── Disclaimer ── */}
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl" style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.3)' }}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: '#C0392B' }} />
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
                      className="w-full flex items-center justify-between p-4 rounded-2xl transition-all text-left group hover:-translate-y-0.5"
                      style={{ background: '#FFFDF8', border: '1.5px solid #E7E0D2', boxShadow: '0 10px 24px -18px rgba(28,43,58,0.4)' }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(74,144,217,0.12)' }}>
                          <Navigation size={17} style={{ color: '#4A90D9' }} />
                        </div>
                        <div>
                          <p className="text-sm font-black" style={{ color: '#1C2B3A' }}>Right where I am</p>
                          <p className="font-mono text-[10px] tabular-nums" style={{ color: '#5A6B7D' }}>
                            {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'GPS active'}
                          </p>
                        </div>
                      </div>
                      <span className="transition-transform group-hover:translate-x-1" style={{ color: '#4A90D9' }}>→</span>
                    </button>
                  ) : (
                    <div className="p-4 rounded-2xl flex items-start gap-3" style={{ background: 'rgba(180,83,9,0.07)', border: '1px solid rgba(180,83,9,0.3)' }}>
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: '#8A5710' }} />
                      <p className="text-xs" style={{ color: '#8A5710' }}>GPS unavailable. Use the pin below to mark the location.</p>
                    </div>
                  )}

                  <button
                    onClick={() => { onRequestMapPin?.(); }}
                    className="w-full flex items-center justify-between p-4 rounded-2xl transition-all text-left group hover:-translate-y-0.5"
                    style={{ background: '#FFFDF8', border: '1.5px solid #E7E0D2', boxShadow: '0 10px 24px -18px rgba(28,43,58,0.4)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(46,139,122,0.12)' }}>
                        <span className="absolute inset-2 rounded-full animate-ping opacity-25" style={{ background: '#2E8B7A' }} aria-hidden="true" />
                        <MapPin size={17} style={{ color: '#2E8B7A' }} />
                      </div>
                      <div>
                        <p className="text-sm font-black" style={{ color: '#1C2B3A' }}>Drop a pin</p>
                        <p className="text-[11px]" style={{ color: '#5A6B7D' }}>Pan the map to the exact spot</p>
                      </div>
                    </div>
                    <span className="transition-transform group-hover:translate-x-1" style={{ color: '#2E8B7A' }}>→</span>
                  </button>
                </div>
              )}

              {/* ── Step 2: Details ── */}
              {step === 'form' && (
                <>
                  {/* Active location display */}
                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl" style={{ background: 'rgba(46,139,122,0.09)', border: '1px solid rgba(46,139,122,0.35)' }}>
                    <div className="flex items-center gap-2">
                      <MapPin size={13} style={{ color: activeLocation ? '#2E8B7A' : '#C0392B' }} />
                      <span className="text-xs font-mono tabular-nums" style={{ color: '#1C2B3A' }}>
                        {activeLocation
                          ? `${activeLocation.lat.toFixed(5)}, ${activeLocation.lng.toFixed(5)}`
                          : 'No location set'}
                      </span>
                    </div>
                    <button
                      onClick={() => setStep('choose')}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors hover:bg-black/5"
                      style={{ color: '#1C2B3A', border: '1px solid #E7E0D2', background: '#FFFDF8' }}
                    >
                      Change
                    </button>
                  </div>

                  {/* Type selector */}
                  <div>
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.18em] mb-2">Type</p>
                    <div className="grid grid-cols-5 gap-2">
                      {EMERGENCY_TYPES.map(({ id, label, icon: Icon, color, ring }) => (
                        <button
                          key={id}
                          onClick={() => setSelectedType(id)}
                          className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all active:scale-95 ${
                            selectedType === id
                              ? `${color} border-transparent ring-2 ${ring} text-white`
                              : 'bg-[#FFFDF8] border-[#E7E0D2] text-[#5A6B7D] hover:bg-[#F7F3EA]'
                          }`}
                        >
                          <Icon size={16} />
                          <span className="text-[8px] font-black uppercase leading-tight text-center">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Neighbourhood */}
                  <div>
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.18em] mb-2">Neighbourhood</p>
                    <select
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 font-bold"
                      style={{ background: '#FFFDF8', border: '1.5px solid #E7E0D2', color: '#1C2B3A' }}
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
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.18em] mb-2">What's happening?</p>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Collision blocking intersection, smoke from building, person needs help…"
                      rows={3}
                      autoFocus
                      className="w-full px-4 py-3 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 transition-all placeholder:font-medium"
                      style={{ background: '#FFFDF8', border: '1.5px solid #E7E0D2', color: '#1C2B3A' }}
                    />
                    <p className="font-mono text-[9px] mt-1 text-right uppercase tracking-[0.12em]" style={{ color: description.trim().length >= 5 ? '#2E8B7A' : '#9AA6B2' }}>
                      {description.trim().length >= 5 ? '✓ Ready to send' : `${Math.max(0, 5 - description.trim().length)} more characters`}
                    </p>
                  </div>

                  {/* Reporter */}
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl" style={{ background: '#F7F3EA', border: '1px solid #E7E0D2' }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black" style={{ background: '#C0392B', color: '#fff' }}>
                      {userName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs" style={{ color: '#5A6B7D' }}>Posting as <span className="font-bold" style={{ color: '#1C2B3A' }}>{userName}</span> · never anonymous for SOS</span>
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit || isSubmitting}
                    className={`w-full h-14 rounded-2xl font-black text-base tracking-wide transition-all flex items-center justify-center gap-3 ${
                      submitted
                        ? 'bg-emerald-600 text-[#fff]'
                        : canSubmit
                        ? 'bg-red-600 hover:bg-red-500 text-[#fff] shadow-2xl shadow-red-600/40 active:scale-[0.98]'
                        : 'bg-[#F7F3EA] text-[#9AA6B2] border border-[#E7E0D2] cursor-not-allowed'
                    }`}
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
