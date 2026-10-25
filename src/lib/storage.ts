import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/src/firebase';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export interface PhotoUploadOptions {
  /** 0..1 as bytes reach the bucket. */
  onProgress?: (fraction: number) => void;
  /** Aborting cancels the upload task; the promise rejects with an AbortError. */
  signal?: AbortSignal;
}

function abortError(): Error {
  const error = new Error('Photo upload cancelled.');
  error.name = 'AbortError';
  return error;
}

/**
 * Upload a photo that has already been through photoPrep (re-encoded JPEG,
 * metadata stripped, blur patches applied).
 *
 * Resumable rather than a single PUT so a reporter on mobile data sees real
 * progress, and so a slow or stalled upload can be cancelled from the form
 * instead of holding the Post button on a spinner with no way out.
 */
export async function uploadIncidentPhoto(uid: string, file: Blob, options: PhotoUploadOptions = {}): Promise<string> {
  const { onProgress, signal } = options;
  if (!uid) throw new Error('Sign in again to attach a photo.');
  if (!ALLOWED_TYPES.includes(file.type))
    throw new Error(`Unsupported file type: ${file.type || 'unknown'}. Use JPEG, PNG, or WebP.`);
  if (file.size > MAX_BYTES)
    throw new Error('Image must be smaller than 5 MB.');
  if (signal?.aborted) throw abortError();

  // Local screenshot harness only: simulates a slow, failing or hanging upload
  // without Firebase. `import.meta.env.DEV` is false in every production build.
  if (import.meta.env.DEV) {
    const fx = (window as { __CW_UPLOAD_FIXTURE__?: { ms?: number; fail?: string; hang?: boolean } }).__CW_UPLOAD_FIXTURE__;
    if (fx) return fakeUpload(file, fx, options);
  }

  if (!storage) throw new Error('Photo uploads are unavailable right now.');
  const ext = file.type.split('/')[1]; // jpeg | png | webp
  const path = `incidents/${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
    cacheControl: 'public, max-age=31536000, immutable',
  });
  const onAbort = () => task.cancel();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => onProgress?.(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
        (error) => reject(signal?.aborted ? abortError() : new Error(uploadErrorMessage((error as { code?: string }).code))),
        () => resolve(),
      );
    });
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  onProgress?.(1);
  return getDownloadURL(storageRef);
}

function uploadErrorMessage(code?: string): string {
  switch (code) {
    case 'storage/unauthorized':
    case 'storage/unauthenticated':
      return 'Your sign-in expired, so the photo was refused. Sign in again, or post without it.';
    case 'storage/retry-limit-exceeded':
      return 'The connection dropped for too long. Try again when you have signal.';
    case 'storage/quota-exceeded':
      return 'Photo uploads are paused right now. Post without the photo.';
    default:
      return 'The photo could not be uploaded.';
  }
}

async function fakeUpload(file: Blob, fx: { ms?: number; fail?: string; hang?: boolean }, { onProgress, signal }: PhotoUploadOptions): Promise<string> {
  const total = fx.ms ?? 1500;
  const started = Date.now();
  return new Promise<string>((resolve, reject) => {
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / total);
      onProgress?.(fx.hang ? Math.min(t, 0.37) : t);
      if (t >= 1 && !fx.hang) {
        clearInterval(timer);
        if (fx.fail) reject(new Error(uploadErrorMessage(fx.fail)));
        else resolve(URL.createObjectURL(file));
      }
    }, 100);
    signal?.addEventListener('abort', () => { clearInterval(timer); reject(abortError()); }, { once: true });
  });
}

/**
 * Delete an incident photo from Storage.
 *
 * Deleting an incident used to remove only its Firestore document, leaving the
 * image publicly readable at its original URL indefinitely. Returns false
 * rather than throwing so the caller can record the orphan and retry, instead
 * of aborting a moderation action that has already succeeded.
 */
export async function deleteIncidentImage(imageUrl: string): Promise<boolean> {
  if (!storage || !imageUrl) return false;
  try {
    await deleteObject(ref(storage, imageUrl));
    return true;
  } catch (error) {
    const code = error instanceof Error ? (error as { code?: string }).code : undefined;
    // Already gone is a success for our purposes.
    if (code === 'storage/object-not-found') return true;
    console.error('Failed to delete incident image:', error);
    return false;
  }
}
