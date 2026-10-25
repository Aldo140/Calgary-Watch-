/**
 * Getting a reporter's photo ready for a public map.
 *
 * Every photo is decoded and re-encoded on the device before it leaves it, even
 * one that is already a small JPEG. That is the point, not a side effect:
 *
 * - Re-encoding drops EXIF, which on a phone photo carries the GPS position
 *   it was taken at (often the reporter's own home), the device model and the
 *   exact time. Storage objects under incidents/ are world-readable, so a photo
 *   passed through untouched published all of that.
 * - Phone photos are 3 to 12 MB. Resized to 1600px they are a few hundred KB,
 *   which is the difference between a two second upload and a stalled one on
 *   mobile data.
 * - Orientation is baked in, so a sideways EXIF-rotated photo shows upright on
 *   every browser.
 *
 * Blur patches are drawn into the same canvas before encoding, so what the
 * reporter sees in the preview is exactly the file that is uploaded.
 */

export const PHOTO_MAX_DIMENSION = 1600;
export const PHOTO_QUALITY = 0.82;
/** Upload ceiling, mirrored by storage.rules. */
export const PHOTO_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
/** Picker ceiling. Anything below is resized; above, decoding risks running a phone out of memory. */
export const PHOTO_PICK_MAX_BYTES = 40 * 1024 * 1024;

export type PhotoKind = 'ok' | 'heic' | 'svg' | 'not-image' | 'empty' | 'too-big';

const HEIC_RE = /\.(heic|heif)$/i;
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i;

/** Sort a picked file before trying to decode it, so each failure gets its own honest message. */
export function classifyPhotoFile(file: { name: string; type: string; size: number }): PhotoKind {
  if (file.size === 0) return 'empty';
  if (file.size > PHOTO_PICK_MAX_BYTES) return 'too-big';
  const type = (file.type || '').toLowerCase();
  if (type === 'image/svg+xml' || /\.svg$/i.test(file.name)) return 'svg';
  if (type === 'image/heic' || type === 'image/heif' || HEIC_RE.test(file.name)) return 'heic';
  if (type.startsWith('image/')) return 'ok';
  // Some Android galleries hand over photos with an empty type.
  if (!type && IMAGE_EXT_RE.test(file.name)) return 'ok';
  return 'not-image';
}

export function photoKindMessage(kind: PhotoKind): string {
  switch (kind) {
    case 'empty': return 'That file is empty. Try picking the photo again.';
    case 'too-big': return 'That file is over 40 MB. Pick a regular photo instead.';
    case 'svg': return 'Drawings and SVG files cannot be posted. Pick a photo.';
    case 'not-image': return "That isn't a photo. Pick a JPEG, PNG or WebP image.";
    case 'heic': return 'This browser cannot open HEIC photos. Use the camera button here, or pick the photo from Safari on your iPhone.';
    default: return '';
  }
}

/** Largest size that fits inside `max` on both sides without upscaling. */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_DIMENSION): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** A blur patch in image-relative units (0..1), so it survives any preview size. */
export interface BlurPatch { x: number; y: number; r: number }

/** Patch radius, as a share of the image's longer side. Big enough for a face or a plate at arm's length. */
export const BLUR_RADIUS = 0.11;

/**
 * Pixel block size for a patch of `diameter` px. Coarse on purpose: a light
 * blur on a licence plate can be read back; 7 blocks across cannot.
 */
export function pixelBlockSize(diameter: number): number {
  return Math.max(6, Math.round(diameter / 7));
}

export interface DecodedPhoto {
  source: CanvasImageSource & { width: number; height: number };
  width: number;
  height: number;
  close: () => void;
}

/** Decode a picked file, upright, at its natural size. */
export async function decodePhoto(file: File): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    } catch {
      // Fall through: older Safari decodes some files only via <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty');
    return {
      source: Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight }),
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    const kind = classifyPhotoFile(file);
    throw new Error(kind === 'heic' ? photoKindMessage('heic') : 'That photo could not be opened on this device. Try a JPEG or PNG.');
  }
}

/** Draw the photo (and its blur patches) at upload size and encode it as JPEG. */
export async function renderPhoto(decoded: DecodedPhoto, blurs: BlurPatch[] = []): Promise<Blob> {
  const { width, height } = fitWithin(decoded.width, decoded.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('That photo could not be processed on this device.');
  // JPEG has no transparency; a PNG screenshot with alpha would turn black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(decoded.source, 0, 0, width, height);

  if (blurs.length) {
    const long = Math.max(width, height);
    for (const patch of blurs) {
      const r = Math.round(patch.r * long);
      const cx = Math.round(patch.x * width);
      const cy = Math.round(patch.y * height);
      const x0 = Math.max(0, cx - r);
      const y0 = Math.max(0, cy - r);
      const w = Math.min(width, cx + r) - x0;
      const h = Math.min(height, cy + r) - y0;
      if (w <= 0 || h <= 0) continue;
      const block = pixelBlockSize(r * 2);
      const tiny = document.createElement('canvas');
      tiny.width = Math.max(1, Math.ceil(w / block));
      tiny.height = Math.max(1, Math.ceil(h / block));
      const tctx = tiny.getContext('2d');
      if (!tctx) continue;
      tctx.drawImage(canvas, x0, y0, w, h, 0, 0, tiny.width, tiny.height);
      ctx.save();
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x0, y0, w, h, Math.min(w, h) * 0.22);
      else ctx.rect(x0, y0, w, h);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, x0, y0, w, h);
      ctx.restore();
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY));
  if (!blob) throw new Error('That photo could not be processed on this device.');
  if (blob.size > PHOTO_UPLOAD_MAX_BYTES) throw new Error('That photo is too large even after resizing. Try another one.');
  return blob;
}

export function photoFileName(original: string): string {
  const base = original.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 40) || 'photo';
  return `${base}.jpg`;
}

/**
 * A download URL that points at the reporter's own folder in our bucket.
 * Mirrors isOwnIncidentPhoto() in firestore.rules.
 */
export function isOwnIncidentPhotoUrl(url: string, uid: string): boolean {
  const prefix = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/incidents%2F/;
  if (!prefix.test(url)) return false;
  const rest = url.replace(prefix, '');
  return rest.startsWith(`${encodeURIComponent(uid)}%2F`) && !/[/]/.test(rest.split('?')[0]);
}

export type PhotoCategory = 'crime' | 'traffic' | 'infrastructure' | 'weather' | 'emergency';

/** What a useful photo of each kind of report shows. Short enough to read while standing there. */
export const PHOTO_SHOT_LIST: Record<PhotoCategory, string[]> = {
  crime: ['The damage or the scene', 'What was taken, if you have a photo of it', 'A street sign or landmark'],
  traffic: ['The blockage and which lanes', 'Facing the way traffic moves', 'From the sidewalk. Never while driving'],
  infrastructure: ['The broken thing, up close', 'A wide shot with a landmark', 'Any City sign or ticket on it'],
  weather: ['The ice, water or damage', 'Something for scale, like a curb', 'Only where it is safe to stand'],
  emergency: ['Only if you are safe', 'The scene, from a distance', 'Call 911 first'],
};

export function shotListFor(category: string): string[] {
  return PHOTO_SHOT_LIST[(category in PHOTO_SHOT_LIST ? category : 'crime') as PhotoCategory];
}
