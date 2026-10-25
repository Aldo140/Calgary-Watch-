import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, EyeOff, ImagePlus, Loader2, RefreshCw, ShieldCheck, Trash2, Undo2, Zap } from 'lucide-react';
import {
  BLUR_RADIUS,
  classifyPhotoFile,
  decodePhoto,
  formatBytes,
  photoFileName,
  photoKindMessage,
  renderPhoto,
  shotListFor,
  type BlurPatch,
  type DecodedPhoto,
} from '@/src/lib/photoPrep';
import { cn } from '@/src/lib/utils';
import '@/src/styles/map-photo.css';

/** A photo that is ready to upload: re-encoded, metadata gone, blurs baked in. */
export interface PreparedPhoto {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  originalBytes: number;
  name: string;
  blurs: BlurPatch[];
  decoded: DecodedPhoto;
}

/** Free the decoded bitmap and preview URL. The owner calls this, since the step can unmount while the photo is kept. */
export function releasePhoto(photo: PreparedPhoto | null) {
  if (!photo) return;
  URL.revokeObjectURL(photo.previewUrl);
  photo.decoded.close();
}

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const fn = () => setCoarse(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return coarse;
}

interface ReportPhotoProps {
  category: string;
  photo: PreparedPhoto | null;
  onChange: (photo: PreparedPhoto | null) => void;
  /** 'sos' is the compact SOS layout: no shot list, the photo never holds up the send. */
  variant?: 'report' | 'sos';
  /** 0..1 while the photo uploads; drawn over the preview. */
  uploadProgress?: number | null;
  disabled?: boolean;
}

export default function ReportPhoto({ category, photo, onChange, variant = 'report', uploadProgress = null, disabled = false }: ReportPhotoProps) {
  const coarse = useCoarsePointer();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blurMode, setBlurMode] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rendering, setRendering] = useState(false);
  const photoRef = useRef(photo);
  photoRef.current = photo;
  const uploading = uploadProgress !== null;
  const locked = disabled || uploading;

  useEffect(() => { if (!photo) setBlurMode(false); }, [photo]);

  const pick = async (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    const kind = classifyPhotoFile(file);
    if (kind !== 'ok' && kind !== 'heic') { setError(photoKindMessage(kind)); return; }
    setBusy(true);
    try {
      const decoded = await decodePhoto(file);
      const blob = await renderPhoto(decoded);
      releasePhoto(photoRef.current);
      onChange({
        blob,
        previewUrl: URL.createObjectURL(blob),
        width: decoded.width,
        height: decoded.height,
        originalBytes: file.size,
        name: photoFileName(file.name),
        blurs: [],
        decoded,
      });
      setBlurMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That photo could not be opened on this device.');
    } finally {
      setBusy(false);
    }
  };

  const reblur = async (blurs: BlurPatch[]) => {
    const current = photoRef.current;
    if (!current) return;
    setRendering(true);
    try {
      const blob = await renderPhoto(current.decoded, blurs);
      URL.revokeObjectURL(current.previewUrl);
      onChange({ ...current, blob, blurs, previewUrl: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That blur could not be applied.');
    } finally {
      setRendering(false);
    }
  };

  const onImageTap = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!blurMode || !photo || rendering || locked) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    void reblur([...photo.blurs, { x, y, r: BLUR_RADIUS }]);
  };

  const inputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        // Opens the rear camera straight away on phones; desktops ignore it.
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }}
      />
      <input
        ref={libraryRef}
        type="file"
        // Broad on purpose: HEIC, huge and oddly typed photos are converted on
        // the device, so filtering them out of the picker would refuse photos
        // we can actually post.
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-photo-input
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }}
      />
    </>
  );

  const promises = (
    <ul className="lv-ph-promises" aria-label="What happens to your photo">
      <li><ShieldCheck size={15} aria-hidden="true" /> Location data removed</li>
      <li><Zap size={15} aria-hidden="true" /> Shrunk to upload fast</li>
      <li><EyeOff size={15} aria-hidden="true" /> Blur faces and plates</li>
    </ul>
  );

  // ── Empty: shot list + capture buttons ───────────────────────────────────
  if (!photo) {
    const shots = shotListFor(category);
    return (
      <div className={cn('lv-ph', variant === 'sos' && 'is-sos')}>
        {inputs}
        <div
          className={cn('lv-ph-hero', dragging && 'is-drag')}
          onDragOver={(e) => { if (coarse) return; e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void pick(e.dataTransfer.files?.[0]); }}
        >
          {variant === 'report' && (
            <>
              <p className="lv-ph-eyebrow">A useful photo shows</p>
              <ol className="lv-ph-shots">
                {shots.map((s, i) => <li key={s}><span aria-hidden="true">{i + 1}</span>{s}</li>)}
              </ol>
            </>
          )}
          {busy ? (
            <div className="lv-ph-busy" role="status">
              <Loader2 size={22} className="animate-spin" aria-hidden="true" />
              <span><b>Getting it ready</b><small>Removing location data and resizing</small></span>
            </div>
          ) : (
            <div className={cn('lv-ph-actions', !coarse && 'is-desk')}>
              {coarse && (
                <button type="button" className="lv-ph-btn is-cam" disabled={locked} onClick={() => cameraRef.current?.click()}>
                  <Camera size={22} strokeWidth={2.3} aria-hidden="true" />
                  <span>Take a photo</span>
                </button>
              )}
              <button type="button" className="lv-ph-btn is-lib" disabled={locked} onClick={() => libraryRef.current?.click()}>
                <ImagePlus size={22} strokeWidth={2.3} aria-hidden="true" />
                <span>{coarse ? 'From library' : 'Choose a photo'}</span>
              </button>
              {!coarse && <p className="lv-ph-drop">or drop one here</p>}
            </div>
          )}
        </div>
        {promises}
        {error && <p className="lv-o-err" role="alert">{error}</p>}
      </div>
    );
  }

  // ── Preview: exactly the file that will upload ───────────────────────────
  const pct = uploading ? Math.round((uploadProgress ?? 0) * 100) : 0;
  return (
    <div className={cn('lv-ph', variant === 'sos' && 'is-sos')}>
      {inputs}
      <div className={cn('lv-ph-frame', blurMode && 'is-blur')}>
        <div className="lv-ph-imgwrap">
          <img
            src={photo.previewUrl}
            alt={blurMode ? 'Your photo. Tap a spot to blur it.' : 'Your photo, as neighbours will see it'}
            onClick={onImageTap}
            draggable={false}
          />
          {rendering && <span className="lv-ph-spin" aria-hidden="true"><Loader2 size={22} className="animate-spin" /></span>}
          {uploading && (
            <span className="lv-ph-upbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Photo upload">
              <i style={{ width: `${Math.max(4, pct)}%` }} />
            </span>
          )}
        </div>
        <p className="lv-ph-tag">{blurMode ? 'Tap faces, plates or house numbers' : 'What neighbours will see'}</p>
      </div>

      <div className="lv-ph-tools">
        {blurMode ? (
          <>
            <button type="button" className="lv-ph-tool" disabled={!photo.blurs.length || rendering || locked} onClick={() => void reblur(photo.blurs.slice(0, -1))}>
              <Undo2 size={17} aria-hidden="true" /> Undo
            </button>
            <span className="lv-ph-count" aria-live="polite">{photo.blurs.length} blurred</span>
            <button type="button" className="lv-ph-tool is-done" onClick={() => setBlurMode(false)}>
              <Check size={17} strokeWidth={3} aria-hidden="true" /> Done
            </button>
          </>
        ) : (
          <>
            <button type="button" className="lv-ph-tool is-blur" disabled={locked} onClick={() => setBlurMode(true)} aria-pressed={false}>
              <EyeOff size={17} aria-hidden="true" /> {photo.blurs.length ? `Blur (${photo.blurs.length})` : 'Blur'}
            </button>
            <button type="button" className="lv-ph-tool" disabled={locked} onClick={() => (coarse ? cameraRef : libraryRef).current?.click()}>
              <RefreshCw size={17} aria-hidden="true" /> Retake
            </button>
            <button
              type="button"
              className="lv-ph-tool"
              disabled={locked}
              aria-label="Remove photo"
              onClick={() => { releasePhoto(photo); onChange(null); setError(null); }}
            >
              <Trash2 size={17} aria-hidden="true" /> <span className="lv-ph-hide-xs">Remove</span>
            </button>
          </>
        )}
      </div>

      <ul className="lv-ph-facts">
        <li><ShieldCheck size={15} aria-hidden="true" /> Location data removed</li>
        <li>{formatBytes(photo.originalBytes)} → <b>{formatBytes(photo.blob.size)}</b></li>
      </ul>
      {error && <p className="lv-o-err" role="alert">{error}</p>}
    </div>
  );
}
