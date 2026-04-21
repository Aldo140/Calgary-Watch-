import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { X, Loader2, Navigation, MapPin, AlertTriangle, ExternalLink, Image } from 'lucide-react';
import { uploadIncidentImage } from '@/src/lib/storage';
import { motion, AnimatePresence } from 'motion/react';
import { useState, useRef, useEffect, useCallback } from 'react';

// Approximate neighbourhood centres for Calgary.
// Returns the closest neighbourhood name or '' if outside all radii.
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
  const MAX_DIST = 0.035; // ~3 km in degrees
  let best = { name: '', dist: Infinity };
  for (const n of NEIGHBOURHOODS) {
    const dLat = lat - n.lat;
    const dLng = (lng - n.lng) * Math.cos(n.lat * (Math.PI / 180));
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist < MAX_DIST && dist < best.dist) best = { name: n.name, dist };
  }
  return best.name;
}

// Swear word filter — only thing blocking submissions
const PROFANITY = [
  /\bfuck(ing|er|s)?\b/i, /\bshit\b/i, /\bass(hole)?\b/i, /\bbitch\b/i,
  /\bcunt\b/i, /\bdick\b/i, /\bpiss\b/i, /\bcock\b/i, /\bwhore\b/i,
];

function hasProfanity(text: string): boolean {
  return PROFANITY.some((re) => re.test(text));
}

const incidentSchema = z.object({
  title: z.string().trim()
    .min(5, 'Headline is too short')
    .max(100, 'Headline is too long')
    .refine(v => !hasProfanity(v), 'Please keep it clean'),
  description: z.string().trim()
    .min(10, 'Description must be at least 10 characters')
    .max(1000, 'Description is too long')
    .refine(v => !hasProfanity(v), 'Please keep it clean'),
  category: z.enum(['crime', 'traffic', 'infrastructure', 'weather', 'emergency']),
  neighborhood: z.string().trim().min(2, 'Please choose a neighbourhood from the list'),
  anonymous: z.boolean(),
});

export type IncidentFormData = z.infer<typeof incidentSchema>;

/** One mounted tree for the report flow - avoids duplicate inputs (desktop + mobile) breaking react-hook-form. */
function useLgUp() {
  const [lg, setLg] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const fn = () => setLg(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return lg;
}

interface IncidentFormProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after Storage upload succeeds. Firestore write happens in MapPage — errors there surface via MapPage's error state, not here. */
  onSubmit: (data: IncidentFormData & { lat: number; lng: number; image_url?: string }) => void;
  userUid: string;
  /** Neutral fallback coordinates (Calgary centre) */
  location: { lat: number; lng: number } | null;
  /** Actual GPS coordinates - only used when user explicitly taps "Use My Location" */
  gpsLocation?: { lat: number; lng: number } | null;
  /** Coordinates set by tapping the map in pin mode */
  pinLocation: { lat: number; lng: number } | null;
  /** Whether the device has granted location permission */
  locationAvailable: boolean;
  userProfile: {
    displayName: string;
    email: string;
    photoURL: string;
  } | null;
  /** Called when user chooses "drop a pin" - parent enters crosshair mode */
  onRequestMapPin?: () => void;
  /** True while the crosshair pin overlay is active on the map */
  isPinMode?: boolean;
  /** Clear parent's stored pin (e.g. after "Change" or when choosing GPS over a prior pin) */
  onClearPin?: () => void;
}

export default function IncidentForm({
  isOpen,
  onClose,
  onSubmit,
  location,
  gpsLocation,
  pinLocation,
  locationAvailable,
  userProfile,
  onRequestMapPin,
  isPinMode = false,
  onClearPin,
  userUid,
}: IncidentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const isLgUp = useLgUp();
  // 'choose'  = picking location method
  // 'pinning' = crosshair active on map; form hidden
  // 'form'    = filling in report details
  const [step, setStep] = useState<'choose' | 'pinning' | 'form'>('choose');
  // Whether user explicitly chose "Use My Location" (GPS)
  const [usingGPS, setUsingGPS] = useState(false);
  const submitLockRef = useRef(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
    reset,
  } = useForm<IncidentFormData>({
    resolver: zodResolver(incidentSchema),
    mode: 'onTouched',
    reValidateMode: 'onChange',
    defaultValues: {
      category: 'crime',
      anonymous: false,
      title: '',
      description: '',
      neighborhood: '',
    },
  });

  const isAnonymous = watch('anonymous');
  const watchedNeighborhood = watch('neighborhood');
  const [neighborhoodOverride, setNeighborhoodOverride] = useState(false);

  // When pin mode exits without confirmation (Cancel), return to choose step.
  // Do not run on successful confirm: parent sets pinLocation and clears isPinMode in the same
  // update - without the !pinLocation guard, we'd race setStep('choose') vs setStep('form').
  useEffect(() => {
    if (!isPinMode && step === 'pinning' && !pinLocation) {
      setStep('choose');
    }
  }, [isPinMode, step, pinLocation]);

  // When a confirmed pin arrives while we're in pinning step, advance to form
  useEffect(() => {
    if (step === 'pinning' && pinLocation) {
      setStep('form');
    }
  }, [pinLocation, step]);

  // Reset when form is reopened
  useEffect(() => {
    if (isOpen) { setStep('choose'); setUsingGPS(false); setNeighborhoodOverride(false); }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && pinLocation) {
      setStep('form');
      setUsingGPS(false);
    }
  }, [isOpen, pinLocation]);

  // Resolution order: tapped pin > explicit GPS choice > Calgary centre fallback
  const activeLocation = pinLocation ?? (usingGPS ? (gpsLocation ?? location) : location);

  // Auto-detect neighbourhood whenever the active location changes
  useEffect(() => {
    if (!activeLocation) return;
    const detected = detectNeighbourhood(activeLocation.lat, activeLocation.lng);
    if (detected) {
      setValue('neighborhood', detected, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
      setNeighborhoodOverride(false);
    }
  }, [activeLocation?.lat, activeLocation?.lng, setValue]);

  // Revoke blob URL to prevent memory leak when image changes
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleFormSubmit = useCallback(
    async (data: IncidentFormData) => {
      clearErrors('root');
      if (!activeLocation) {
        setError('root', { type: 'manual', message: 'Location is missing. Tap Change and pick a location again.' });
        return;
      }
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      setIsSubmitting(true);
      try {
        let image_url: string | undefined;
        if (imageFile) {
          image_url = await uploadIncidentImage(userUid, imageFile);
        }
        onSubmit({ ...data, ...activeLocation, ...(image_url ? { image_url } : {}) });
        reset({ category: 'crime', anonymous: false, title: '', description: '', neighborhood: '' });
        setImageFile(null);
        setImagePreview(null);
        setImageError(null);
        setStep('choose');
        setUsingGPS(false);
        onClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.';
        setError('root', { type: 'manual', message: msg });
      } finally {
        submitLockRef.current = false;
        setIsSubmitting(false);
      }
    },
    [activeLocation, clearErrors, imageFile, onClose, onSubmit, reset, setError, userUid]
  );

  const handleClose = () => {
    clearErrors();
    reset({
      category: 'crime',
      anonymous: false,
      title: '',
      description: '',
      neighborhood: '',
    });
    setImageFile(null);
    setImagePreview(null);
    setImageError(null);
    setStep('choose');
    setUsingGPS(false);
    onClose();
  };

  const handleUseCurrentLocation = () => {
    // Explicitly opt into GPS - this is the ONLY path that uses the device location.
    onClearPin?.();
    setUsingGPS(true);
    setStep('form');
  };

  const handlePinOnMap = () => {
    setStep('pinning');
    onRequestMapPin?.();
  };

  // Single copy of steps in the DOM - never mount desktop + mobile forms together (breaks RHF / zod).
  const reportSteps = (
    <AnimatePresence mode="wait">
      {step === 'choose' && (
        <motion.div key="choose" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.18 }}>
          <div className="space-y-4 p-6">
            <div>
              <h3 className="text-lg font-black text-white mb-1">Step 1: Select Location</h3>
              <p className="text-sm text-slate-400">Pin the exact spot where this happened</p>
            </div>
            <div className="space-y-3">
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
                      <p className="text-xs text-slate-300 mt-1.5">Fast and accurate. Uses your device GPS.</p>
                    </div>
                    <div className="text-blue-400 group-hover:translate-x-1 transition-transform">→</div>
                  </div>
                </motion.button>
              ) : (
                <div className="p-5 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-600/10 to-amber-700/10">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <p className="font-black text-white text-sm">Location Access Unavailable</p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Your browser hasn&apos;t shared your location. You can enable it in your device settings, or just drop a pin on the map below.
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
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
                      {locationAvailable ? 'Pan the map to any spot in Calgary' : 'Tap the map at the exact spot'}
                    </p>
                  </div>
                  <div className="text-emerald-400 group-hover:translate-x-1 transition-transform">→</div>
                </div>
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
      {step === 'form' && (
        <motion.div key="form" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.18 }}>
          <form
            onSubmit={handleSubmit(handleFormSubmit)}
            className="flex flex-col gap-5 p-6"
            onClick={(e) => e.stopPropagation()}
            noValidate
          >
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-blue-600/25 to-indigo-600/25 border border-blue-500/40 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black text-blue-300 uppercase tracking-wide">
                  {pinLocation ? '📍 Pin Set' : usingGPS ? '📡 GPS Location' : '🏙 City Centre (approx.)'}
                </p>
                <p className="text-xs text-slate-200 mt-0.5 font-mono">
                  {activeLocation?.lat.toFixed(5)}, {activeLocation?.lng.toFixed(5)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClearPin?.();
                  setStep('choose');
                  setUsingGPS(false);
                }}
                className="text-xs font-bold text-blue-300 hover:text-white bg-blue-600/20 hover:bg-blue-600/30 px-3 py-1.5 rounded-lg transition-all whitespace-nowrap"
              >
                Change
              </button>
            </div>

            <div className="p-3.5 rounded-xl border border-red-500/30 bg-gradient-to-br from-red-600/10 to-red-900/20 flex items-start gap-3">
              <AlertTriangle className="text-red-400 mt-0.5 shrink-0" size={16} />
              <div>
                <p className="text-[10px] items-center gap-2 font-black tracking-widest uppercase text-red-400">🚨 Not Sent To Police</p>
                <p className="text-xs text-red-200/80 mt-1 font-medium leading-relaxed">
                  Calgary Watch is peer-to-peer and <b>does NOT</b> dispatch emergency services. If you require immediate police or medical assistance, please call <b>911</b>.
                </p>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Category</label>
              <div className="relative">
                <select
                  {...register('category')}
                  className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border border-white/10 light:border-stone-200/80 bg-slate-900 light:bg-white/80 text-white light:text-slate-900 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="crime">Crime</option>
                  <option value="traffic">Traffic</option>
                  <option value="infrastructure">Infrastructure</option>
                  <option value="weather">Weather</option>
                  <option value="emergency">🚨 Emergency</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 light:text-stone-500"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Neighbourhood</label>
              {activeLocation && watchedNeighborhood && !neighborhoodOverride ? (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-white light:text-slate-900 font-bold text-sm">{watchedNeighborhood}</span>
                    <span className="text-[10px] text-emerald-400 font-black uppercase tracking-wider">Auto-detected</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNeighborhoodOverride(true)}
                    className="text-[10px] text-slate-400 light:text-stone-500 hover:text-white light:hover:text-slate-900 font-bold uppercase tracking-wider transition-colors"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <select
                    {...register('neighborhood')}
                    className="w-full appearance-none px-4 py-3 pr-10 rounded-xl border border-white/10 light:border-stone-200/80 bg-slate-900 light:bg-white/80 text-white light:text-slate-900 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 light:text-stone-500"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </div>
              )}
              {errors.neighborhood && (
                <p className="text-red-400 text-xs mt-1.5 font-bold">{errors.neighborhood.message}</p>
              )}
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Headline</label>
              <Input
                {...register('title')}
                placeholder="e.g., Major collision on 17th Ave SW"
                className="bg-slate-900 light:bg-white/80 border-white/10 light:border-stone-200/80 text-white light:text-slate-900 placeholder:text-slate-600 light:placeholder:text-stone-400 rounded-xl h-11 font-bold px-4 text-sm focus:ring-2 focus:ring-blue-500"
              />
              {errors.title && (
                <p className="text-red-400 text-xs mt-1.5 font-bold">{errors.title.message}</p>
              )}
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">What Happened?</label>
              <textarea
                {...register('description')}
                placeholder="Give neighbours the details they need to know..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-white/10 light:border-stone-200/80 bg-slate-900 light:bg-white/80 text-white light:text-slate-900 placeholder:text-slate-600 light:placeholder:text-stone-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.description && (
                <p className="text-red-400 text-xs mt-1.5 font-bold">{errors.description.message}</p>
              )}
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 flex justify-between">
                Photo <span className="text-slate-600 font-normal normal-case tracking-normal">Optional · JPEG/PNG/WebP · max 5 MB</span>
              </label>
              {imagePreview ? (
                <div className="relative rounded-xl overflow-hidden border border-white/10">
                  <img src={imagePreview} alt="Preview" className="w-full max-h-40 object-cover" />
                  <button
                    type="button"
                    onClick={() => { setImageFile(null); setImagePreview(null); setImageError(null); }}
                    className="absolute top-2 right-2 p-1.5 bg-slate-900/80 hover:bg-slate-900 rounded-lg text-slate-300 hover:text-white transition-all"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-3 w-full h-20 rounded-xl border border-dashed border-white/20 hover:border-blue-500/50 bg-white/5 hover:bg-blue-600/10 cursor-pointer transition-all">
                  <Image size={20} className="text-slate-500" />
                  <span className="text-sm text-slate-400 font-bold">Click to attach a photo</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setImageError(null);
                      if (!file) { setImageFile(null); setImagePreview(null); return; }
                      if (file.size > 5 * 1024 * 1024) {
                        setImageError('Photo must be under 5 MB.');
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
              {imageError && <p className="text-red-400 text-xs mt-1.5 font-bold">{imageError}</p>}
            </div>

            <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 light:border-stone-200/80 bg-white/5 light:bg-white/68 hover:bg-white/8 light:hover:bg-white cursor-pointer transition-colors">
              <input
                type="checkbox"
                {...register('anonymous', { setValueAs: (v) => v === true })}
                className="h-4 w-4 rounded border-white/20 light:border-stone-300 bg-slate-900 light:bg-white accent-blue-500 cursor-pointer"
              />
              <div>
                <p className="text-xs font-bold text-white light:text-slate-900">Post Anonymously</p>
                <p className="text-[10px] text-slate-400 light:text-stone-500">Your name won&apos;t appear</p>
              </div>
            </label>

            {errors.root && (
              <p className="text-red-400 text-xs font-bold px-1" role="alert">
                {errors.root.message}
              </p>
            )}

            <div className="flex items-center gap-3 pt-2 border-t border-white/8 light:border-stone-200/80">
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
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!isOpen) return null;

  // Keep the modal mounted while pinning (just hidden) so react-hook-form
  // refs and input state survive the pin flow without re-registration issues.
  const hidden = step === 'pinning';

  return isLgUp ? (
    <div
      className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-slate-950/60 light:bg-[#7c6f64]/18 backdrop-blur-xl"
      style={hidden ? { display: 'none' } : undefined}
      onClick={handleClose}
    >
      <div
        className="relative z-50 w-full max-w-xl max-h-[90vh] bg-gradient-to-br from-slate-900 via-slate-950 to-slate-950 light:from-[rgb(255,250,243)] light:via-[rgb(255,247,237)] light:to-[rgb(242,251,248)] rounded-3xl border border-white/10 light:border-stone-200/80 shadow-2xl shadow-blue-900/40 light:shadow-[0_24px_60px_-32px_rgba(120,113,108,0.35)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 light:border-stone-200/80 bg-gradient-to-r from-slate-900/80 to-blue-900/15 light:from-white/85 light:to-sky-50 flex-shrink-0">
          <div>
            <h2 className="text-xl font-black text-white light:text-slate-900">Keep Calgary Safe</h2>
            <p className="text-xs text-slate-400 light:text-stone-500 mt-0.5">Report what&apos;s happening in real-time</p>
          </div>
          <button type="button" onClick={handleClose} className="p-2 text-slate-400 light:text-stone-500 hover:text-white light:hover:text-slate-900 hover:bg-white/10 light:hover:bg-white/80 rounded-lg transition-all">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{reportSteps}</div>
      </div>
    </div>
  ) : (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110]"
        style={hidden ? { display: 'none' } : undefined}
        onClick={handleClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[111] rounded-t-[2.5rem] bg-slate-950 light:bg-[rgb(255,250,243)] border-t border-white/10 light:border-stone-200/80 flex flex-col"
        style={{ maxHeight: '92dvh', ...(hidden ? { display: 'none' } : {}) }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex justify-center pt-4 pb-2">
          <div className="w-10 h-1.5 rounded-full bg-white/15" />
        </div>
        <div className="flex items-center justify-between px-6 pb-4 flex-shrink-0">
          <div>
            <h2 className="text-xl font-black text-white light:text-slate-900">Keep Calgary Safe</h2>
            <p className="text-xs text-slate-400 light:text-stone-500 mt-0.5">Report in real-time</p>
          </div>
          <button type="button" onClick={handleClose} className="p-2 text-slate-400 light:text-stone-500 hover:text-white light:hover:text-slate-900 hover:bg-white/10 light:hover:bg-white/80 rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{reportSteps}</div>
      </div>
    </>
  );
}
