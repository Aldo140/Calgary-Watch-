import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/src/firebase';

export async function uploadIncidentImage(uid: string, file: File): Promise<string> {
  if (!storage) throw new Error('Firebase Storage is not configured.');
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `incidents/${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}
