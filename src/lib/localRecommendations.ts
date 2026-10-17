import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { RecommendationInput } from './recommendationInput';

export { cleanRecommendation, REC_LIMITS, type Recommendation, type RecommendationInput } from './recommendationInput';

/**
 * Neighbour recommendations for the Calgary White Pages. Free to send; read
 * only by admins and the sender. A recommendation is a lead, never a listing: it goes live
 * only after we check the business against its own site, and the business is
 * then invited to claim it (outreach), which is how a gem becomes a partner.
 */
export const RECOMMENDATIONS = 'local_recommendations';

function calgaryDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Five a Calgary day per account; the rules refuse a sixth slot. */
export async function sendRecommendation(input: RecommendationInput): Promise<void> {
  if (!db || !auth?.currentUser) throw new Error('Sign in to send a recommendation.');
  const uid = auth.currentUser.uid;
  const day = calgaryDay();
  for (let slot = 1; slot <= 5; slot++) {
    const ref = doc(db, RECOMMENDATIONS, `${uid}_${day}_${slot}`);
    if ((await getDoc(ref)).exists()) continue;
    await setDoc(ref, { ...input, id: ref.id, uid, status: 'new', createdAt: Date.now() });
    return;
  }
  throw new Error('You’ve sent five recommendations today. Thank you! Send more tomorrow.');
}
