import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { X, Loader2, Navigation, MapPin, AlertTriangle, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useRef, useEffect } from 'react';

const incidentSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  category: z.enum(['crime', 'traffic', 'infrastructure', 'weather', 'gas', 'emergency']),
  neighborhood: z.string().min(2, 'Neighborhood is required'),
  anonymous: z.boolean(),
});

export type IncidentFormData = z.infer<typeof incidentSchema>;

interface IncidentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: IncidentFormData & { lat: number; lng: number }) => void;
  /** GPS / Calgary-centre coordinates (for the "use current location" path) */
  location: { lat: number; lng: number } | null;
  /** Coordinates set by the crosshair pin — stored in MapPage state, passed directly here */
  pinLocation: { lat: number; lng: number } | null;
  /** Whether the device has granted location permission */
  locationAvailable: boolean;
  userProfile: {
    displayName: string;
    email: string;
    photoURL: string;
  } | null;
  /** Called when user chooses "drop a pin" — parent enters crosshair mode */
  onRequestMapPin?: () => void;
  /** True while the crosshair pin overlay is active on the map */
  isPinMode?: boolean;
}

export default function IncidentForm({
  isOpen,
  onClose,
  onSubmit,
  location,
  pinLocation,
  locationAvailable,
  userProfile,
  onRequestMapPin,
  isPinMode = false,
}: IncidentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 'choose'  = picking location method
  // 'pinning' = crosshair active on map; form hidden
  // 'form'    = filling in report details
  const [step, setStep] = useState<'choose' | 'pinning' | 'form'>('choose');
  const submitDebounceRef = useRef(0);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<IncidentFormData>({
    resolver: zodResolver(incidentSchema),
    defaultValues: { category: 'crime', anonymous: false },
  });

  const isAnonymous = watch('anonymous');

  // When pin mode exits without confirmation (Cancel), return to choose step
  useEffect(() => {
    if (!isPinMode && step === 'pinning') {
      setStep('choose');
    }
  }, [isPinMode, step]);

  // When a confirmed pin arrives while we're in pinning step, advance to form
  useEffect(() => {
    if (step === 'pinning' && pinLocation) {
      setStep('form');
    }
  }, [pinLocation, step]);

  // Reset when form is reopened
  useEffect(() => {
    if (isOpen) setStep('choose');
  }, [isOpen]);

  // pinLocation (from crosshair) takes precedence over GPS location
  const activeLocation = pinLocation ?? location;

  const handleFormSubmit = async (data: IncidentFormData) => {
    if (!activeLocation) return;
    const now = Date.now();
    if (now - submitDebounceRef.current < 500) return;
    submitDebounceRef.current = now;
    setIsSubmitting(true);
    onSubmit({ ...data, ...activeLocation });
    setTimeout(() => {
      reset();
      setStep('choose');
      onClose();
      setIsSubmitting(false);
    }, 100);
  };

  const handleClose = () => {
    reset();
    setStep('choose');
    onClose();
  };

  const handleUseCurrentLocation = () => {
    // location is already set in MapPage to userLocation when form opens;
    // if GPS was denied, MapPage falls back to CALGARY_CENTER.
    setStep('form');
  };

  const handlePinOnMap = () => {
    setStep('pinning');
    onRequestMapPin?.();
  };

  // ─── Location step ────────────────────────────────────────────────────────
  const LocationStep = () => (
    <div className="space-y-4 p-6">
      <div>
        <h3 className="text-lg font-black text-white mb-1">Step 1: Select Location</h3>
        <p className="text-sm text-slate-400">Pin the exact spot where this happened</p>
      </div>

      <div className="space-y-3">
        {/* ── Use Current Location ── */}
        {locationAvailable ? (
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleUseCurrentLocation}
            className="w-full p-5 rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-600/20 to-blue-700/20 hover:from-blue-600/30 hover:to-blue-700/30 transition-all group text-left shadow-lg"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-black text-white text-base flex items-center gap-2">
                  <Navigation size={16} className="text-blue-400" />
                  Use My Current Location
                </p>
                <p className="text-xs text-slate-300 mt-1.5">Fast &amp; accurate — uses your device GPS</p>
              </div>
              <div className="text-blue-400 group-hover:translate-x-1 transition-transform">→</div>
            </div>
          </motion.button>
        ) : (
          /* GPS unavailable — explain and offer help */
          <div className="p-5 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-600/10 to-amber-700/10">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <p className="font-black text-white text-sm">Location Access Unavailable</p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Your browser hasn't shared your location. You can enable it in your device settings, or just drop a pin on the map below.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {/* Deep-link to browser location settings (works on most mobile browsers) */}
                  <a
                    href="https://support.google.com/chrome/answer/142065"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300 hover:text-white transition-colors underline underline-offset-2"
                  >
                    How to enable location
                    <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Drop a Pin ── */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handlePinOnMap}
          className="w-full p-5 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-600/20 to-emerald-700/20 hover:from-emerald-600/30 hover:to-emerald-700/30 transition-all group text-left shadow-lg"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="font-black text-white text-base flex items-center gap-2">
                <MapPin size={16} className="text-emerald-400" />
                Drop a Pin on the Map
              </p>
              <p className="text-xs text-slate-300 mt-1.5">
                {locationAvailable
                  ? 'Pan the map to any spot in Calgary'
                  : 'Recommended — pan the map to the exact location'}
              </p>
            </div>
            <div className="text-emerald-400 group-hover:translate-x-1 transition-transform">→</div>
          </div>
        </motion.button>
      </div>
    </div>
  );

  // ─── Form step ────────────────────────────────────────────────────────────
  const FormStep = () => (
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      className="flex flex-col gap-5 p-6"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Location confirmation */}
      <div className="p-3.5 rounded-xl bg-gradient-to-br from-blue-600/25 to-indigo-600/25 border border-blue-500/40 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black text-blue-300 uppercase tracking-wide">
            {pinLocation ? '📍 Pin Set' : locationAvailable ? '📡 GPS Location' : '🏙 City Centre (approx.)'}
          </p>
          <p className="text-xs text-slate-200 mt-0.5 font-mono">
            {activeLocation?.lat.toFixed(5)}, {activeLocation?.lng.toFixed(5)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setStep('choose')}
          className="text-xs font-bold text-blue-300 hover:text-white bg-blue-600/20 hover:bg-blue-600/30 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap"
        >
          Change
        </button>
      </div>

      {/* Category */}
      <div>
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Category</label>
        <select
          {...register('category')}
          className="w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-900 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="crime">Crime</option>
          <option value="traffic">Traffic</option>
          <option value="infrastructure">Infrastructure</option>
          <option value="weather">Weather</option>
          <option value="gas">Gas Prices</option>
          <option value="emergency">🚨 Emergency</option>
        </select>
      </div>

      {/* Neighborhood */}
      <div>
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Neighbourhood</label>
        <select
          {...register('neighborhood')}
          className="w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-900 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select Area</option>
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
        {errors.neighborhood && (
          <p className="text-red-400 text-xs mt-1.5 font-bold">{errors.neighborhood.message}</p>
        )}
      </div>

      {/* Title */}
      <div>
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Headline</label>
        <Input
          {...register('title')}
          placeholder="e.g., Major collision on 17th Ave SW"
          className="bg-slate-900 border-white/10 text-white placeholder:text-slate-600 rounded-xl h-11 font-bold px-4 text-sm focus:ring-2 focus:ring-blue-500"
        />
        {errors.title && (
          <p className="text-red-400 text-xs mt-1.5 font-bold">{errors.title.message}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">What Happened?</label>
        <textarea
          {...register('description')}
          placeholder="Give neighbours the details they need to know..."
          rows={3}
          className="w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-900 text-white placeholder:text-slate-600 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {errors.description && (
          <p className="text-red-400 text-xs mt-1.5 font-bold">{errors.description.message}</p>
        )}
      </div>

      {/* Anonymous */}
      <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 cursor-pointer transition-colors">
        <input
          type="checkbox"
          {...register('anonymous')}
          className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-blue-500 cursor-pointer"
        />
        <div>
          <p className="text-xs font-bold text-white">Post Anonymously</p>
          <p className="text-[10px] text-slate-400">Your name won't appear</p>
        </div>
      </label>

      {/* Submit */}
      <div className="flex items-center gap-3 pt-2 border-t border-white/8">
        <img
          src={userProfile?.photoURL || 'https://ui-avatars.com/api/?name=Calgary+User&background=1e293b&color=fff'}
          alt=""
          className="w-8 h-8 rounded-lg border border-white/10 object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-200 truncate">
            {isAnonymous ? 'Anonymous' : userProfile?.displayName?.toUpperCase()}
          </p>
        </div>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="px-6 h-11 font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm shadow-lg whitespace-nowrap"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Posting…
            </span>
          ) : '🚀 Post Report'}
        </Button>
      </div>
    </form>
  );

  // ─── Desktop modal ─────────────────────────────────────────────────────────
  return (
    <>
      <AnimatePresence>
        {isOpen && step !== 'pinning' && (
          <div
            className="fixed inset-0 z-[115] hidden lg:flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xl"
            onClick={handleClose}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 16 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-50 w-full max-w-xl max-h-[90vh] bg-gradient-to-br from-slate-900 via-slate-950 to-slate-950 rounded-3xl border border-white/10 shadow-2xl shadow-blue-900/40 overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-gradient-to-r from-slate-900/80 to-blue-900/15 flex-shrink-0">
                <div>
                  <h2 className="text-xl font-black text-white">Keep Calgary Safe</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Report what's happening in real-time</p>
                </div>
                <button onClick={handleClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                  {step === 'choose' && (
                    <motion.div key="choose" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.18 }}>
                      <LocationStep />
                    </motion.div>
                  )}
                  {step === 'form' && (
                    <motion.div key="form" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.18 }}>
                      <FormStep />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Mobile sheet ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && step !== 'pinning' && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[111] lg:hidden rounded-t-[2.5rem] bg-slate-950 border-t border-white/10 flex flex-col"
              style={{ maxHeight: '92dvh' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 280 }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex-shrink-0 flex justify-center pt-4 pb-2">
                <div className="w-10 h-1.5 rounded-full bg-white/15" />
              </div>

              <div className="flex items-center justify-between px-6 pb-4 flex-shrink-0">
                <div>
                  <h2 className="text-xl font-black text-white">Keep Calgary Safe</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Report in real-time</p>
                </div>
                <button onClick={handleClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                  {step === 'choose' && (
                    <motion.div key="choose" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.18 }}>
                      <LocationStep />
                    </motion.div>
                  )}
                  {step === 'form' && (
                    <motion.div key="form" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.18 }}>
                      <FormStep />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
