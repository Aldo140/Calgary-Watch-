import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/src/firebase';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadIncidentImage(uid: string, file: File): Promise<string> {
  if (!storage) throw new Error('Firebase Storage is not configured.');
  if (!ALLOWED_TYPES.includes(file.type))
    throw new Error(`Unsupported file type: ${file.type}. Use JPEG, PNG, or WebP.`);
  if (file.size > MAX_BYTES)
    throw new Error('Image must be smaller than 5 MB.');
  const ext = file.type.split('/')[1]; // jpeg | png | webp
  const path = `incidents/${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
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
