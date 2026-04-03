import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Siren, X, Loader2, MapPin, AlertCircle, Car, Construction, CloudRain, Navigation, AlertTriangle } from 'lucide-react';

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
  /** GPS location — null when denied */
  location: { lat: number; lng: number } | null;
  /** Coordinates set via crosshair pin — managed by parent */
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

  // Crosshair pin coordinates take precedence over GPS
  const activeLocation = pinLocation ?? location;

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
    const title = `${label} — ${description.trim().slice(0, 60)}`;
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
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 40 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-md bg-slate-950 border border-red-500/40 rounded-[2rem] shadow-[0_0_80px_rgba(239,68,68,0.25)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pulsing top bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-red-600 via-rose-500 to-orange-500 animate-pulse" />

            <div className="p-6 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Siren size={16} className="text-red-400 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-red-400">Emergency Report</span>
                  </div>
                  <h2 className="text-xl font-black text-white leading-tight">
                    {step === 'choose' ? 'Where is it?' : "What's happening?"}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">Goes live instantly for everyone nearby</p>
                </div>
                <button onClick={handleClose} className="p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                  <X size={18} />
                </button>
              </div>

              {/* ── Disclaimer ── */}
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl bg-red-950/40 border border-red-500/25">
                <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-red-200 leading-relaxed">
                  <span className="font-black">For life-threatening emergencies call 911 first.</span>{' '}
                  This tool is for community awareness only — not a substitute for emergency services. Do not submit false reports.
                </p>
              </div>

              {/* ── Step 1: Location ── */}
              {step === 'choose' && (
                <div className="space-y-2.5">
                  {locationAvailable ? (
                    <button
                      onClick={() => setStep('form')}
                      className="w-full flex items-center justify-between p-4 rounded-2xl border border-blue-500/30 bg-blue-600/10 hover:bg-blue-600/20 transition-all text-left group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                          <Navigation size={16} className="text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-white">Use My Location</p>
                          <p className="text-[11px] text-slate-400">
                            {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'GPS active'}
                          </p>
                        </div>
                      </div>
                      <span className="text-blue-400 group-hover:translate-x-1 transition-transform">→</span>
                    </button>
                  ) : (
                    <div className="p-4 rounded-2xl border border-amber-500/25 bg-amber-950/20 flex items-start gap-3">
                      <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-200">GPS unavailable. Use the pin below to mark the location.</p>
                    </div>
                  )}

                  <button
                    onClick={() => { onRequestMapPin?.(); }}
                    className="w-full flex items-center justify-between p-4 rounded-2xl border border-emerald-500/30 bg-emerald-600/10 hover:bg-emerald-600/20 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
                        <MapPin size={16} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-white">Drop a Pin</p>
                        <p className="text-[11px] text-slate-400">Pan the map to the exact spot</p>
                      </div>
                    </div>
                    <span className="text-emerald-400 group-hover:translate-x-1 transition-transform">→</span>
                  </button>
                </div>
              )}

              {/* ── Step 2: Details ── */}
              {step === 'form' && (
                <>
                  {/* Active location display */}
                  <div className="flex items-center justify-between px-3 py-2.5 bg-white/[0.04] border border-white/10 rounded-xl">
                    <div className="flex items-center gap-2">
                      <MapPin size={13} className={activeLocation ? 'text-green-400' : 'text-red-400'} />
                      <span className="text-xs text-slate-300 font-mono">
                        {activeLocation
                          ? `${activeLocation.lat.toFixed(5)}, ${activeLocation.lng.toFixed(5)}`
                          : 'No location set'}
                      </span>
                    </div>
                    <button
                      onClick={() => setStep('choose')}
                      className="text-[11px] font-bold text-blue-400 hover:text-white transition-colors"
                    >
                      Change
                    </button>
                  </div>

                  {/* Type selector */}
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.18em] mb-2">Type</p>
                    <div className="grid grid-cols-5 gap-2">
                      {EMERGENCY_TYPES.map(({ id, label, icon: Icon, color, ring }) => (
                        <button
                          key={id}
                          onClick={() => setSelectedType(id)}
                          className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                            selectedType === id
                              ? `${color} border-transparent ring-2 ${ring} text-white`
                              : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
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
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.18em] mb-2">Neighbourhood</p>
                    <select
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 font-bold"
                    >
                      <option value="">Select area…</option>
                      <option value="Beltline">Beltline</option>
                      <option value="Kensington">Kensington</option>
                      <option value="Bridgeland">Bridgeland</option>
                      <option value="Mission">Mission</option>
                      <option value="Inglewood">Inglewood</option>
                      <option value="Bowness">Bowness</option>
                      <option value="Downtown">Downtown</option>
                      <option value="Saddleridge">Saddleridge</option>
                      <option value="Evanston">Evanston</option>
                      <option value="Mahogany">Mahogany</option>
                      <option value="Auburn Bay">Auburn Bay</option>
                      <option value="Signal Hill">Signal Hill</option>
                      <option value="Tuscany">Tuscany</option>
                      <option value="Royal Oak">Royal Oak</option>
                      <option value="Panorama Hills">Panorama Hills</option>
                      <option value="Midnapore">Midnapore</option>
                      <option value="Shawnessy">Shawnessy</option>
                      <option value="McKenzie Towne">McKenzie Towne</option>
                      <option value="Cranston">Cranston</option>
                      <option value="Copperfield">Copperfield</option>
                      <option value="Other">Other / Not Listed</option>
                    </select>
                  </div>

                  {/* Description */}
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.18em] mb-2">What's happening?</p>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Collision blocking intersection, smoke from building, person needs help…"
                      rows={3}
                      autoFocus
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-slate-600 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all"
                    />
                    <p className="text-[10px] text-slate-600 mt-1 text-right">{description.trim().length} / 5 min</p>
                  </div>

                  {/* Reporter */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] border border-white/10 rounded-xl">
                    <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center text-white text-[10px] font-black">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs text-slate-400">Posting as <span className="text-white font-bold">{userName}</span></span>
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit || isSubmitting}
                    className={`w-full h-14 rounded-2xl font-black text-base tracking-wide transition-all flex items-center justify-center gap-3 ${
                      submitted
                        ? 'bg-green-600 text-white'
                        : canSubmit
                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-2xl shadow-red-600/40 active:scale-[0.98]'
                        : 'bg-white/10 text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    {isSubmitting ? (
                      <><Loader2 size={20} className="animate-spin" /> Sending alert…</>
                    ) : submitted ? (
                      '✓ Reported — stay safe'
                    ) : (
                      <><Siren size={20} /> Report Emergency Now</>
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
