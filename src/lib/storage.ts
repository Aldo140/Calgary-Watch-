import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/src/firebase';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadIncidentImage(uid: string, file: File): Promise<string> {
  if (!storage) throw new Error('Firebase Storage is not configured.');
  if (!ALLOWED_TYPES.includes(file.type))
    throw new Error(`Unsupported file type: ${file.type}. Use JPEG, PNG, or WebP.`);
  if (file.size >= MAX_BYTES)
    throw new Error('Image must be smaller than 5 MB.');
  const ext = file.type.split('/')[1]; // jpeg | png | webp
  const path = `incidents/${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}
