import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/src/firebase';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 2000;

/**
 * Re-encode a picked photo to JPEG when it is not already a web-safe size and
 * format.
 *
 * Two real failures motivated this. iPhone photos are usually HEIC, which the
 * Storage rule rejects outright and which Chrome and Firefox cannot display
 * even if it were stored — but Safari, where HEIC actually comes from, can
 * decode it, so converting on the client turns a hard rejection into a normal
 * upload. Second, a modern phone photo routinely exceeds the 5 MB ceiling;
 * refusing it lost the report rather than the megabytes.
 *
 * Anything the browser cannot decode still throws, with a message a reporter
 * can act on rather than a raw MIME type.
 */
export async function prepareIncidentImage(file: File): Promise<File> {
  if (ALLOWED_TYPES.includes(file.type) && file.size <= MAX_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('That photo could not be read on this device. Try a JPEG or PNG.');
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close?.();
    throw new Error('That photo could not be processed on this device.');
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('That photo could not be processed on this device.');
  if (blob.size > MAX_BYTES) throw new Error('That photo is too large even after compression. Try a smaller one.');

  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

export async function uploadIncidentImage(uid: string, file: File): Promise<string> {
  if (!storage) throw new Error('Photo uploads are unavailable right now.');
  const prepared = await prepareIncidentImage(file);
  if (!ALLOWED_TYPES.includes(prepared.type))
    throw new Error(`Unsupported file type: ${prepared.type}. Use JPEG, PNG, or WebP.`);
  if (prepared.size > MAX_BYTES)
    throw new Error('Image must be smaller than 5 MB.');
  const ext = prepared.type.split('/')[1]; // jpeg | png | webp
  const path = `incidents/${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, prepared);
  return getDownloadURL(storageRef);
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
