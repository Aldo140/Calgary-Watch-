import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Loader2, Navigation, MapPin, AlertTriangle, ExternalLink, Image, Siren, AlertCircle, Car, Construction, CloudRain, ArrowRight, Check } from 'lucide-react';
import { INCIDENT_CATEGORY_VALUES } from '@/src/constants';
import { uploadIncidentImage } from '@/src/lib/storage';
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useRef, useEffect, useCallback } from 'react';

// ── Field-atlas palette (explicit hexes: several Tailwind color utilities are
//    globally remapped in index.css) ──────────────────────────────────────────
const P = {
  paper: '#FFFDF8',
  card: '#F7F3EA',
  ink: '#1C2B3A',
  soft: '#5A6B7D',
  line: '#E7E0D2',
  bow: '#2E8B7A',
  sky: '#4A90D9',
};

const CATEGORY_CHIPS = [
  { id: 'crime' as const,          label: 'Crime',   Icon: AlertCircle,  color: '#DC2626' },
  { id: 'traffic' as const,        label: 'Traffic', Icon: Car,          color: '#EA580C' },
  { id: 'infrastructure' as const, label: 'Infra',   Icon: Construction, color: '#2563EB' },
  { id: 'weather' as const,        label: 'Weather', Icon: CloudRain,    color: '#0284C7' },
  { id: 'emergency' as const,      label: 'SOS',     Icon: Siren,        color: '#E11D48' },
];

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
  category: z.enum(INCIDENT_CATEGORY_VALUES),
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

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className="font-mono text-[9.5px] font-bold uppercase tracking-[0.22em] mb-2 flex items-baseline justify-between" style={{ color: P.soft }}>
      <span>{children}</span>
      {hint && <span className="normal-case tracking-normal font-medium text-[10px]" style={{ color: '#9AA6B2' }}>{hint}</span>}
    </label>
  );
}

const inputStyle: React.CSSProperties = { background: P.paper, border: `1.5px solid ${P.line}`, color: P.ink };

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
  const watchedCategory = watch('category');
  const watchedDescription = watch('description');
  const [neighborhoodOverride, setNeighborhoodOverride] = useState(false);

  // When pin mode exits without confirmation (Cancel), close the form via onClose so
  // the parent can clean up in a separate render from when isPinMode cleared.
  // This avoids flipping isFormOpen and isPinMode in one batch (which opens the
  // MobileMapSheet while Leaflet is still processing the cancel touch event).
  // Guard on !pinLocation so a successful confirm (parent sets pinLocation + clears
  // isPinMode atomically) doesn't race into a close.
  useEffect(() => {
    if (!isPinMode && step === 'pinning' && !pinLocation) {
      onClose();
    }
  }, [isPinMode, step, pinLocation, onClose]);

  // When a confirmed pin arrives while we're in pinning step, advance to form
  useEffect(() => {
    if (step === 'pinning' && pinLocation) {
      setStep('form');
    }
  }, [pinLocation, step]);

  // Reset when form is reopened.
  // If a confirmed pin already exists (user tapped pin → returned to form state),
  // skip straight to 'form' so the choose-location step never flashes.
  useEffect(() => {
    if (isOpen) {
      setStep(pinLocation ? 'form' : 'choose');
      setUsingGPS(false);
      setNeighborhoodOverride(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // intentionally omit pinLocation — only re-run when the form opens

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

  // ── Header: progress dots make the promise explicit — 2 steps, <30 s ──────
  const stepIndex = step === 'choose' ? 0 : 1;
  const header = (
    <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 shrink-0 relative" style={{ borderBottom: `1px solid ${P.line}` }}>
      <div className="absolute top-0 inset-x-0 h-1" style={{ background: `linear-gradient(to right, ${P.sky}, ${P.bow})` }} aria-hidden="true" />
      <div>
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.28em]" style={{ color: P.bow }}>
          New report · under 30 seconds
        </p>
        <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-0.02em]" style={{ color: P.ink }}>
          Put it on the map
        </h2>
        <div className="mt-2.5 flex items-center gap-2" aria-hidden="true">
          {['Location', 'Details'].map((label, i) => (
            <span key={label} className="flex items-center gap-1.5">
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-black transition-colors"
                style={i <= stepIndex ? { background: P.ink, color: P.paper } : { background: P.card, color: P.soft, border: `1px solid ${P.line}` }}
              >
                {i < stepIndex ? <Check size={9} /> : i + 1}
              </span>
              <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em]" style={{ color: i <= stepIndex ? P.ink : P.soft }}>
                {label}
              </span>
              {i === 0 && <span className="h-px w-5" style={{ background: P.line }} />}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={handleClose}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5"
        style={{ color: P.soft }}
        aria-label="Close report form"
      >
        <X size={17} />
      </button>
    </div>
  );

  // Single copy of steps in the DOM - never mount desktop + mobile forms together (breaks RHF / zod).
  const reportSteps = (
    <AnimatePresence>
      {step === 'choose' && (
        <motion.div key="choose" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.18 }}>
          <div className="space-y-3 p-6">
            <p className="text-sm font-semibold" style={{ color: P.soft }}>
              Where did it happen?
            </p>

            {locationAvailable ? (
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={handleUseCurrentLocation}
                className="w-full p-4 rounded-2xl text-left transition-all group flex items-center gap-4 hover:-translate-y-0.5"
                style={{ background: P.paper, border: `1.5px solid ${P.line}`, boxShadow: '0 10px 24px -18px rgba(28,43,58,0.4)' }}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(74,144,217,0.12)' }}>
                  <Navigation size={19} style={{ color: P.sky }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-black" style={{ color: P.ink }}>Right where I'm standing</span>
                  <span className="block text-xs mt-0.5" style={{ color: P.soft }}>Uses your device GPS — fastest option</span>
                </span>
                <ArrowRight size={16} className="shrink-0 transition-transform group-hover:translate-x-1" style={{ color: P.sky }} />
              </motion.button>
            ) : (
              <div className="p-4 rounded-2xl" style={{ background: 'rgba(180,83,9,0.07)', border: '1px solid rgba(180,83,9,0.3)' }}>
                <div className="flex items-start gap-3">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: '#B45309' }} />
                  <div className="flex-1 space-y-1.5">
                    <p className="text-[13px] font-black" style={{ color: '#92400E' }}>Location access is off</p>
                    <p className="text-xs leading-relaxed" style={{ color: P.soft }}>
                      Your browser hasn't shared your location — no problem, just drop a pin below.
                    </p>
                    <a
                      href="https://support.google.com/chrome/answer/142065"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold underline underline-offset-2"
                      style={{ color: '#92400E' }}
                    >
                      How to enable location
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>
            )}

            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={handlePinOnMap}
              className="w-full p-4 rounded-2xl text-left transition-all group flex items-center gap-4 hover:-translate-y-0.5"
              style={{ background: P.paper, border: `1.5px solid ${P.line}`, boxShadow: '0 10px 24px -18px rgba(28,43,58,0.4)' }}
            >
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(46,139,122,0.12)' }}>
                <span className="absolute inset-2 rounded-full animate-ping opacity-25" style={{ background: P.bow }} aria-hidden="true" />
                <MapPin size={19} style={{ color: P.bow }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-black" style={{ color: P.ink }}>Drop a pin on the map</span>
                <span className="block text-xs mt-0.5" style={{ color: P.soft }}>
                  {locationAvailable ? 'Pan to any spot in Calgary' : 'Pan to the exact spot'}
                </span>
              </span>
              <ArrowRight size={16} className="shrink-0 transition-transform group-hover:translate-x-1" style={{ color: P.bow }} />
            </motion.button>

            <p className="pt-1 text-center font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: '#9AA6B2' }}>
              The exact spot helps neighbours nearby
            </p>
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
            {/* Location confirmation bar */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl" style={{ background: 'rgba(46,139,122,0.09)', border: '1px solid rgba(46,139,122,0.35)' }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <MapPin size={14} className="shrink-0" style={{ color: P.bow }} />
                <div className="min-w-0">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: P.bow }}>
                    {pinLocation ? 'Pin locked' : usingGPS ? 'GPS locked' : 'City centre (approx.)'}
                  </p>
                  <p className="font-mono text-[10.5px] mt-0.5 truncate tabular-nums" style={{ color: P.ink }}>
                    {activeLocation?.lat.toFixed(5)}, {activeLocation?.lng.toFixed(5)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClearPin?.();
                  setStep('choose');
                  setUsingGPS(false);
                }}
                className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors hover:bg-black/5"
                style={{ color: P.ink, border: `1px solid ${P.line}`, background: P.paper }}
              >
                Change
              </button>
            </div>

            {/* 911 notice — compact strip */}
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl" style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.25)' }}>
              <AlertTriangle size={13} className="shrink-0" style={{ color: '#DC2626' }} />
              <p className="text-[11px] leading-snug font-medium" style={{ color: '#7F1D1D' }}>
                Not sent to police. Emergencies: call <b>911</b> — this alerts neighbours in parallel.
              </p>
            </div>

            {/* Category — one-tap colour chips, same language as the map */}
            <div>
              <FieldLabel>Category</FieldLabel>
              <div className="grid grid-cols-5 gap-1.5">
                {CATEGORY_CHIPS.map(({ id, label, Icon, color }) => {
                  const active = watchedCategory === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setValue('category', id, { shouldValidate: true, shouldDirty: true })}
                      className="flex flex-col items-center gap-1 rounded-xl py-2.5 transition-all active:scale-95"
                      style={active
                        ? { background: color, border: `1.5px solid ${color}`, color: '#fff' }
                        : { background: P.paper, border: `1.5px solid ${P.line}`, color: P.soft }}
                      aria-pressed={active}
                    >
                      <Icon size={16} style={{ color: active ? '#fff' : color }} />
                      <span className="text-[9.5px] font-black uppercase tracking-[0.06em]">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Neighbourhood */}
            <div>
              <FieldLabel>Neighbourhood</FieldLabel>
              {activeLocation && watchedNeighborhood && !neighborhoodOverride ? (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'rgba(46,139,122,0.09)', border: '1px solid rgba(46,139,122,0.35)' }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: P.bow }} />
                    <span className="font-bold text-sm" style={{ color: P.ink }}>{watchedNeighborhood}</span>
                    <span className="font-mono text-[8.5px] font-bold uppercase tracking-[0.14em]" style={{ color: P.bow }}>Auto-detected</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNeighborhoodOverride(true)}
                    className="text-[10px] font-bold uppercase tracking-wider transition-colors hover:opacity-70"
                    style={{ color: P.soft }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <select
                    {...register('neighborhood')}
                    className="w-full appearance-none px-4 py-3 pr-10 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9]"
                    style={inputStyle}
                  >
                    <option value="">Select area</option>
                    {NEIGHBOURHOODS.map((n) => (
                      <option key={n.name} value={n.name}>{n.name}</option>
                    ))}
                    <option value="Other">Other / Not listed</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: P.soft }}><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </div>
              )}
              {errors.neighborhood && (
                <p className="text-xs mt-1.5 font-bold" style={{ color: '#DC2626' }}>{errors.neighborhood.message}</p>
              )}
            </div>

            {/* Headline */}
            <div>
              <FieldLabel>Headline</FieldLabel>
              <input
                {...register('title')}
                placeholder="e.g. Stolen bike — blue Norco, 9 Ave SE"
                className="w-full h-11 px-4 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-[#4A90D9] placeholder:font-medium"
                style={inputStyle}
              />
              {errors.title && (
                <p className="text-xs mt-1.5 font-bold" style={{ color: '#DC2626' }}>{errors.title.message}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <FieldLabel hint={`${(watchedDescription ?? '').length}/1000`}>What happened?</FieldLabel>
              <textarea
                {...register('description')}
                placeholder="Give neighbours the details they need — what, when, anything identifying. Your bike's serial number. The truck's colour."
                rows={3}
                className="w-full px-4 py-3 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#4A90D9] placeholder:font-medium"
                style={inputStyle}
              />
              {errors.description && (
                <p className="text-xs mt-1.5 font-bold" style={{ color: '#DC2626' }}>{errors.description.message}</p>
              )}
            </div>

            {/* Photo */}
            <div>
              <FieldLabel hint="Optional · JPEG/PNG/WebP · max 5 MB">Photo</FieldLabel>
              {/* Photos are published on a public map. People do not think about
                  what is in the frame until it is already up there, so the
                  guidance sits at the point of choosing rather than in a policy
                  page nobody opens. */}
              <p className="-mt-1 text-[10px] leading-snug" style={{ color: P.soft }}>
                Anyone can see this. Avoid faces, licence plates and house numbers.
              </p>
              {imagePreview ? (
                <div className="relative rounded-xl overflow-hidden" style={{ border: `1px solid ${P.line}` }}>
                  <img src={imagePreview} alt="Preview" className="w-full max-h-40 object-cover" />
                  <button
                    type="button"
                    onClick={() => { setImageFile(null); setImagePreview(null); setImageError(null); }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg transition-all"
                    style={{ background: 'rgba(28,43,58,0.8)', color: '#fff' }}
                    aria-label="Remove photo"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label
                  className="flex items-center justify-center gap-3 w-full h-16 rounded-xl cursor-pointer transition-colors hover:bg-black/[0.02]"
                  style={{ border: `1.5px dashed ${P.line}`, background: P.card }}
                >
                  <Image size={18} style={{ color: P.soft }} />
                  <span className="text-sm font-bold" style={{ color: P.soft }}>Attach a photo</span>
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
              {imageError && <p className="text-xs mt-1.5 font-bold" style={{ color: '#DC2626' }}>{imageError}</p>}
            </div>

            {/* Anonymous toggle */}
            <label
              className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors hover:bg-black/[0.02]"
              style={{ background: P.card, border: `1px solid ${P.line}` }}
            >
              <input
                type="checkbox"
                {...register('anonymous', { setValueAs: (v) => v === true })}
                className="h-4 w-4 rounded cursor-pointer accent-[#2E8B7A]"
              />
              <div className="flex-1">
                <p className="text-xs font-bold" style={{ color: P.ink }}>Hide my name</p>
                {/* "Your name won't appear" understated it: the account and
                    email are still recorded against the report for moderation.
                    Saying so is both honest and a disclosure obligation. */}
                <p className="text-[10px]" style={{ color: P.soft }}>
                  Hidden from the public map. Moderators can still see your account.
                </p>
              </div>
              <span
                className="font-mono text-[8.5px] font-bold uppercase tracking-[0.12em] px-2 py-1 rounded-full"
                style={isAnonymous ? { background: 'rgba(46,139,122,0.14)', color: P.bow } : { background: P.paper, color: '#9AA6B2', border: `1px solid ${P.line}` }}
              >
                {isAnonymous ? 'Name hidden' : 'Named'}
              </span>
            </label>

            {errors.root && (
              <p className="text-xs font-bold px-1" role="alert" style={{ color: '#DC2626' }}>
                {errors.root.message}
              </p>
            )}

            {/* Submit row */}
            <div className="flex items-center gap-3 pt-3" style={{ borderTop: `1px solid ${P.line}` }}>
              <img
                src={userProfile?.photoURL || 'https://ui-avatars.com/api/?name=Calgary+User&background=1C2B3A&color=fff'}
                alt=""
                className="w-9 h-9 rounded-full object-cover"
                style={{ border: `1px solid ${P.line}`, opacity: isAnonymous ? 0.4 : 1 }}
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate" style={{ color: P.ink }}>
                  {isAnonymous ? 'Anonymous' : userProfile?.displayName || 'Calgary User'}
                </p>
                <p className="font-mono text-[8.5px] uppercase tracking-[0.14em]" style={{ color: P.soft }}>Reporting live</p>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-12 px-6 rounded-2xl font-black text-sm flex items-center gap-2 transition-transform active:scale-[0.97] disabled:opacity-50 whitespace-nowrap"
                style={{ background: P.ink, color: P.paper, boxShadow: '0 14px 28px -14px rgba(28,43,58,0.55)' }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    Send it live
                    <ArrowRight size={14} className="opacity-80" />
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!isOpen) return null;

  // Keep the modal mounted while pinning — visibility:hidden hides it but lets
  // Framer Motion animations still complete in the background (display:none stops them).
  const hiddenStyle: React.CSSProperties | undefined =
    step === 'pinning' ? { visibility: 'hidden', pointerEvents: 'none' } : undefined;

  return isLgUp ? (
    <div
      className="fixed inset-0 z-[115] flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: 'rgba(20,28,38,0.5)', ...hiddenStyle }}
      onClick={handleClose}
    >
      <div
        className="relative z-50 w-full max-w-xl max-h-[90vh] rounded-3xl overflow-hidden flex flex-col shadow-[0_32px_80px_-32px_rgba(28,43,58,0.6)]"
        style={{ background: P.paper, border: `1px solid ${P.line}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {header}
        <div className="flex-1 overflow-y-auto no-scrollbar">{reportSteps}</div>
      </div>
    </div>
  ) : (
    <>
      <div
        className="fixed inset-0 backdrop-blur-sm z-[110]"
        style={{ background: 'rgba(20,28,38,0.45)', ...hiddenStyle }}
        onClick={handleClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[111] rounded-t-[1.6rem] flex flex-col"
        style={{ maxHeight: '92dvh', background: P.paper, borderTop: `1px solid ${P.line}`, ...hiddenStyle }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: P.line }} />
        </div>
        {header}
        <div className="flex-1 overflow-y-auto no-scrollbar pb-[max(0.5rem,env(safe-area-inset-bottom))]">{reportSteps}</div>
      </div>
    </>
  );
}
