import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Loader2, Navigation, MapPin, ExternalLink, Image, Siren, AlertCircle, Car, Construction, CloudRain, ArrowRight, ArrowLeft, Check, Phone } from 'lucide-react';
import { INCIDENT_CATEGORY_VALUES } from '@/src/constants';
import { uploadIncidentImage } from '@/src/lib/storage';
import { motion, AnimatePresence } from 'motion/react';
import { MAP, CATEGORY, LIVE } from '@/src/lib/tokens';
import { cn } from '@/src/lib/utils';
import '@/src/styles/map-overlays.css';
import React, { useState, useRef, useEffect, useCallback } from 'react';

// Category tiles, straight from CATEGORY: the tiles have to be the same colours
// the pins are, or the form is teaching the wrong legend. `fg` is the glyph
// colour on the fill (amber needs ink), `tint` the selected-tile wash.
const CATEGORY_CHIPS = [
  { id: 'crime' as const,          label: 'Crime',          hint: 'Theft, break-ins, something suspicious', Icon: AlertCircle,  color: CATEGORY.crime,          fg: '#FFFFFF', tint: '#FDE6DE' },
  { id: 'traffic' as const,        label: 'Traffic',        hint: 'Crashes, closures, stalled vehicles',     Icon: Car,          color: CATEGORY.traffic,        fg: LIVE.ink,  tint: '#FDEFD6' },
  { id: 'infrastructure' as const, label: 'Infrastructure', hint: 'Water, power, streetlights, roads',      Icon: Construction, color: CATEGORY.infrastructure, fg: '#FFFFFF', tint: '#E3EBFB' },
  { id: 'weather' as const,        label: 'Weather',        hint: 'Ice, flooding, storm damage',            Icon: CloudRain,    color: CATEGORY.weather,        fg: '#FFFFFF', tint: '#DDF2F7' },
  { id: 'emergency' as const,      label: 'Emergency',      hint: 'Someone may be in danger. Call 911 first.', Icon: Siren,     color: CATEGORY.emergency,      fg: '#FFFFFF', tint: '#FFE1DC' },
];

type ReportStep = 'what' | 'choose' | 'pinning' | 'details' | 'photo';
const STEP_ORDER: ReportStep[] = ['what', 'choose', 'details', 'photo'];
const STEP_LABELS = ['What', 'Where', 'Details', 'Photo'];

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

function FieldLabel({ children, hint, htmlFor }: { children: React.ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <label className="lv-o-label" htmlFor={htmlFor}>
      <span>{children}</span>
      {hint && <small>{hint}</small>}
    </label>
  );
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
  // Set when the photo upload fails. The written report is the valuable part,
  // so a failed photo offers an explicit way through instead of trapping the
  // reporter behind an error they cannot clear.
  const [photoUploadFailed, setPhotoUploadFailed] = useState(false);
  const isLgUp = useLgUp();
  // One thing at a time:
  // 'what'    = category tiles
  // 'choose'  = picking location method
  // 'pinning' = crosshair active on map; form hidden
  // 'details' = neighbourhood, headline, description
  // 'photo'   = optional photo, name toggle, post
  const [step, setStep] = useState<ReportStep>('what');
  // Whether user explicitly chose "Use My Location" (GPS)
  const [usingGPS, setUsingGPS] = useState(false);
  const submitLockRef = useRef(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    trigger,
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
      setStep('details');
    }
  }, [pinLocation, step]);

  // Reset when form is reopened. The flow always starts with "what happened";
  // a pin that already exists (Report related) skips the "where" step later.
  useEffect(() => {
    if (isOpen) {
      setStep('what');
      setUsingGPS(false);
      setNeighborhoodOverride(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // only re-run when the form opens

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
    async (data: IncidentFormData, options: { skipPhoto?: boolean } = {}) => {
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
        if (imageFile && !options.skipPhoto) {
          try {
            image_url = await uploadIncidentImage(userUid, imageFile);
          } catch (uploadError) {
            // The photo failed, but the report itself is still good. Stop here
            // with the typed report intact and offer a way past it, rather than
            // discarding everything the reporter wrote over an attachment.
            const msg = uploadError instanceof Error ? uploadError.message : 'The photo could not be uploaded.';
            setImageError(msg);
            setPhotoUploadFailed(true);
            setError('root', { type: 'manual', message: 'Your report is ready, but the photo could not be attached.' });
            return;
          }
        }
        onSubmit({ ...data, ...activeLocation, ...(image_url ? { image_url } : {}) });
        reset({ category: 'crime', anonymous: false, title: '', description: '', neighborhood: '' });
        setImageFile(null);
        setImagePreview(null);
        setImageError(null);
        setPhotoUploadFailed(false);
        setStep('what');
        setUsingGPS(false);
        onClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
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
    setPhotoUploadFailed(false);
    setStep('what');
    setUsingGPS(false);
    onClose();
  };

  const handleUseCurrentLocation = () => {
    // Explicitly opt into GPS - this is the ONLY path that uses the device location.
    onClearPin?.();
    setUsingGPS(true);
    setStep('details');
  };

  const handlePinOnMap = () => {
    setStep('pinning');
    onRequestMapPin?.();
  };

  // ── Step navigation ───────────────────────────────────────────────────────
  const visibleStep: Exclude<ReportStep, 'pinning'> = step === 'pinning' ? 'choose' : step;
  const stepIndex = STEP_ORDER.indexOf(visibleStep);
  const selectedChip = CATEGORY_CHIPS.find((c) => c.id === watchedCategory) ?? CATEGORY_CHIPS[0];

  const goNext = async () => {
    if (step === 'what') {
      // A pin that already exists (Report related) answers "where" for us.
      setStep(pinLocation ? 'details' : 'choose');
      return;
    }
    if (step === 'details') {
      const ok = await trigger(['neighborhood', 'title', 'description']);
      if (ok) setStep('photo');
    }
  };

  const goBack = () => {
    if (step === 'choose') setStep('what');
    else if (step === 'details') setStep(pinLocation || usingGPS ? 'what' : 'choose');
    else if (step === 'photo') setStep('details');
  };

  // A field that fails at the final submit lives on the details step.
  const onInvalid = () => setStep('details');
  const submitReport = handleSubmit((data) => handleFormSubmit(data), onInvalid);

  const titles: Record<typeof visibleStep, React.ReactNode> = {
    what: <>What <span>happened?</span></>,
    choose: <>Where <span>was it?</span></>,
    details: <>Tell <span>neighbours</span></>,
    photo: <>Add a photo, <span>then post</span></>,
  };

  const header = (
    <div className="lv-rf-head">
      <div className="lv-rf-head-top">
        <p className="lv-o-eyebrow">Post a report · step {stepIndex + 1} of 4</p>
        <button type="button" onClick={handleClose} className="lv-o-iconbtn" aria-label="Close report form">
          <X size={20} strokeWidth={2.2} />
        </button>
      </div>
      <h2 className="lv-rf-title">{titles[visibleStep]}</h2>
      <div className="lv-rf-progress" aria-hidden="true">
        {STEP_LABELS.map((label, i) => (
          <span key={label} className={cn(i < stepIndex && 'is-done', i === stepIndex && 'is-now')}>{label}</span>
        ))}
      </div>
    </div>
  );

  const emergencyNote = (
    <p className="lv-o-note">
      <Phone size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>For emergencies call <b>911</b>. CalgaryWatch doesn't dispatch help.</span>
    </p>
  );

  const fieldError = (message?: string) => message ? <p className="lv-o-err">{message}</p> : null;

  // Single copy of steps in the DOM - never mount desktop + mobile forms together (breaks RHF / zod).
  const reportSteps = (
    <AnimatePresence mode="wait" initial={false}>
      {step === 'what' && (
        <motion.div key="what" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.16 }} className="lv-rf-step">
          <p className="lv-rf-lead">Pick the closest fit. Neighbours see it as a coloured pin.</p>
          <div className="lv-rf-tiles" role="group" aria-label="Category">
            {CATEGORY_CHIPS.map(({ id, label, hint, Icon, color, fg, tint }) => {
              const active = watchedCategory === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setValue('category', id, { shouldValidate: true, shouldDirty: true })}
                  className={cn('lv-o-tile', id === 'emergency' && 'is-wide')}
                  style={{ ['--cat' as string]: color, ['--cat-fg' as string]: fg, ['--tint' as string]: tint }}
                  aria-pressed={active}
                >
                  <span className="lv-o-tile-icon" aria-hidden="true"><Icon size={22} strokeWidth={2.2} /></span>
                  <span className="flex flex-col gap-1">
                    <b>{label}</b>
                    <small>{hint}</small>
                  </span>
                  {active && <span className="lv-o-tile-check" aria-hidden="true"><Check size={15} strokeWidth={3} /></span>}
                </button>
              );
            })}
          </div>
          {emergencyNote}
        </motion.div>
      )}

      {(step === 'choose' || step === 'pinning') && (
        <motion.div key="choose" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.16 }} className="lv-rf-step">
          <p className="lv-rf-lead">The exact spot helps the neighbours nearby.</p>

          {locationAvailable ? (
            <button type="button" onClick={handleUseCurrentLocation} className="lv-rf-choice">
              <span className="lv-rf-choice-icon" style={{ background: '#E3EBFB', color: LIVE.blue }}><Navigation size={22} /></span>
              <span className="min-w-0 flex-1">
                <b>Right where I'm standing</b>
                <small>Uses your device location. Fastest.</small>
              </span>
              <ArrowRight size={20} className="shrink-0" />
            </button>
          ) : (
            <div className="lv-rf-warn">
              <b>Location access is off</b>
              Your browser hasn't shared your location. No problem: drop a pin instead.
              <br />
              <a href="https://support.google.com/chrome/answer/142065" target="_blank" rel="noopener noreferrer">
                How to turn location on <ExternalLink size={13} />
              </a>
            </div>
          )}

          <button type="button" onClick={handlePinOnMap} className="lv-rf-choice">
            <span className="lv-rf-choice-icon" style={{ background: LIVE.yellow, color: LIVE.ink }}><MapPin size={22} /></span>
            <span className="min-w-0 flex-1">
              <b>Drop a pin on the map</b>
              <small>{locationAvailable ? 'Pan to any spot in Calgary' : 'Pan to the exact spot'}</small>
            </span>
            <ArrowRight size={20} className="shrink-0" />
          </button>
        </motion.div>
      )}

      {step === 'details' && (
        <motion.div key="details" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.16 }} className="lv-rf-step">
          {/* Location confirmation */}
          <div className="lv-rf-loc">
            <div className="lv-rf-loc-text">
              <span className="lv-o-tile-icon" style={{ ['--cat' as string]: selectedChip.color, ['--cat-fg' as string]: selectedChip.fg, width: 38, height: 38, borderRadius: 11 }} aria-hidden="true">
                <selectedChip.Icon size={18} />
              </span>
              <span className="min-w-0">
                <b>{selectedChip.label} · {pinLocation ? 'Pin placed' : usingGPS ? 'Your location' : 'City centre (approx.)'}</b>
                <small className="truncate">{activeLocation?.lat.toFixed(5)}, {activeLocation?.lng.toFixed(5)}</small>
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClearPin?.();
                setStep('choose');
                setUsingGPS(false);
              }}
              className="lv-o-btn"
            >
              Change
            </button>
          </div>

          {/* Neighbourhood */}
          <div>
            <FieldLabel htmlFor="rf-neighbourhood">Neighbourhood</FieldLabel>
            {activeLocation && watchedNeighborhood && !neighborhoodOverride ? (
              <div className="lv-rf-auto">
                <span><b>{watchedNeighborhood}</b><small>Auto-detected</small></span>
                <button type="button" onClick={() => setNeighborhoodOverride(true)} className="lv-o-btn lv-o-btn-ghost">
                  Change
                </button>
              </div>
            ) : (
              <div className="lv-rf-select">
                <select id="rf-neighbourhood" {...register('neighborhood')} className="lv-o-input" aria-invalid={errors.neighborhood ? 'true' : undefined}>
                  <option value="">Select area</option>
                  {NEIGHBOURHOODS.map((n) => (
                    <option key={n.name} value={n.name}>{n.name}</option>
                  ))}
                  <option value="Other">Other / Not listed</option>
                </select>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            )}
            {fieldError(errors.neighborhood?.message)}
          </div>

          {/* Headline */}
          <div>
            <FieldLabel htmlFor="rf-title">Headline</FieldLabel>
            <input
              id="rf-title"
              {...register('title')}
              placeholder="e.g. Stolen bike, blue Norco, 9 Ave SE"
              className="lv-o-input"
              aria-invalid={errors.title ? 'true' : undefined}
            />
            {fieldError(errors.title?.message)}
          </div>

          {/* Description */}
          <div>
            <FieldLabel htmlFor="rf-description" hint={`${(watchedDescription ?? '').length}/1000`}>What happened?</FieldLabel>
            <textarea
              id="rf-description"
              {...register('description')}
              placeholder="What neighbours should know: what, when, anything identifying. Your bike's serial number. The truck's colour."
              rows={4}
              className="lv-o-input"
              aria-invalid={errors.description ? 'true' : undefined}
            />
            {fieldError(errors.description?.message)}
          </div>
        </motion.div>
      )}

      {step === 'photo' && (
        <motion.div key="photo" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.16 }} className="lv-rf-step">
          {/* Photo */}
          <div>
            <FieldLabel hint="Optional">Photo</FieldLabel>
            {imagePreview ? (
              <div className="lv-rf-preview">
                <img src={imagePreview} alt="Preview" />
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview(null); setImageError(null); setPhotoUploadFailed(false); }}
                  className="lv-o-iconbtn"
                  aria-label="Remove photo"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <label className="lv-rf-drop">
                <Image size={28} aria-hidden="true" />
                <b>Attach a photo</b>
                {/* Photos are published on a public map. People do not think about
                    what is in the frame until it is already up there, so the
                    guidance sits at the point of choosing rather than in a policy
                    page nobody opens. */}
                <small>Anyone can see this. Avoid faces, licence plates and house numbers.</small>
                <input
                  type="file"
                  // Broad accept on purpose: HEIC and oversized phone photos
                  // are converted to JPEG before upload, so filtering them out
                  // of the picker would reject photos we can actually handle.
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setImageError(null);
                    setPhotoUploadFailed(false);
                    if (!file) { setImageFile(null); setImagePreview(null); return; }
                    // Generous gate: anything past here is downscaled and
                    // re-encoded to fit the 5 MB upload ceiling, so rejecting
                    // at 5 MB here would turn ordinary phone photos away.
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
            {imagePreview && (
              <p className="mt-2 text-[13px]" style={{ color: MAP.muted }}>Anyone can see this. Avoid faces, licence plates and house numbers.</p>
            )}
            {fieldError(imageError ?? undefined)}
          </div>

          {/* Anonymous toggle */}
          <label className="lv-rf-toggle">
            <input
              type="checkbox"
              {...register('anonymous', { setValueAs: (v) => v === true })}
            />
            <span className="min-w-0 flex-1">
              <b>Hide my name</b>
              {/* "Your name won't appear" understated it: the account and
                  email are still recorded against the report for moderation.
                  Saying so is both honest and a disclosure obligation. */}
              <small>Hidden from the public map. Moderators can still see your account.</small>
            </span>
            <span className={cn('lv-o-chip', isAnonymous && 'lv-o-chip-yellow')}>{isAnonymous ? 'Hidden' : 'Named'}</span>
          </label>

          <div className="lv-rf-who">
            {userProfile?.photoURL && !isAnonymous ? (
              <img src={userProfile.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="lv-rf-initial" aria-hidden="true">
                {isAnonymous ? '?' : (userProfile?.displayName || 'C').charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <b className="truncate">Posting as {isAnonymous ? 'Anonymous' : userProfile?.displayName || 'Calgary User'}</b>
              <small>Shows on the map for neighbours right away.</small>
            </span>
          </div>

          {errors.root && (
            <div className="space-y-3" role="alert">
              <p className="lv-o-err">{errors.root.message}</p>
              {photoUploadFailed && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmit((data) => handleFormSubmit(data, { skipPhoto: true }), onInvalid)}
                  className="lv-o-btn lv-o-btn-navy w-full"
                >
                  Post the report without the photo
                </button>
              )}
            </div>
          )}

          {emergencyNote}
        </motion.div>
      )}
    </AnimatePresence>
  );

  const footer = (
    <div className="lv-rf-foot">
      {step === 'what' ? (
        <button type="button" onClick={handleClose} className="lv-o-btn lv-o-btn-ghost">Cancel</button>
      ) : (
        <button type="button" onClick={goBack} className="lv-o-btn lv-o-btn-ghost">
          <ArrowLeft size={18} /> Back
        </button>
      )}
      {step === 'photo' ? (
        <button type="submit" disabled={isSubmitting} className="lv-o-btn lv-o-btn-yellow">
          {isSubmitting ? (
            <><Loader2 size={18} className="animate-spin" /> Posting…</>
          ) : (
            <>Post report <ArrowRight size={18} /></>
          )}
        </button>
      ) : step === 'what' || step === 'details' ? (
        <button type="button" onClick={() => void goNext()} className="lv-o-btn lv-o-btn-blue">
          Continue <ArrowRight size={18} />
        </button>
      ) : null}
    </div>
  );

  // One <form> around every step, so Enter on the details step moves on
  // instead of posting a half-finished report.
  const body = (
    <form
      onSubmit={(e) => {
        if (step === 'photo') { void submitReport(e); return; }
        e.preventDefault();
        void goNext();
      }}
      onClick={(e) => e.stopPropagation()}
      className="flex min-h-0 flex-1 flex-col"
      noValidate
    >
      <div className="lv-rf-scroll no-scrollbar">{reportSteps}</div>
      {footer}
    </form>
  );

  if (!isOpen) return null;

  // Keep the modal mounted while pinning — visibility:hidden hides it but lets
  // Framer Motion animations still complete in the background (display:none stops them).
  const hiddenStyle: React.CSSProperties | undefined =
    step === 'pinning' ? { visibility: 'hidden', pointerEvents: 'none' } : undefined;

  return isLgUp ? (
    <div
      className="lv-o lv-rf-wrap lv-o-scrim"
      style={hiddenStyle}
      onClick={handleClose}
    >
      <div
        className="lv-rf"
        role="dialog"
        aria-modal="true"
        aria-label="Post a report"
        onClick={(e) => e.stopPropagation()}
      >
        {header}
        {body}
      </div>
    </div>
  ) : (
    <div className="lv-o">
      <div
        className="fixed inset-0 z-[110] lv-o-scrim"
        style={hiddenStyle}
        onClick={handleClose}
      />
      <div
        className="lv-rf lv-rf-phone"
        role="dialog"
        aria-modal="true"
        aria-label="Post a report"
        style={hiddenStyle}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="lv-o-grabber" aria-hidden="true" style={{ background: LIVE.paper }}><span /></div>
        {header}
        {body}
      </div>
    </div>
  );
}
