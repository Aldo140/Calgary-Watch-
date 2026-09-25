// Keeps Instagram-login tokens alive. Each refresh returns a new 60-day token;
// it is stored in ops_secrets (no client access at all under firestore.rules)
// and used instead of the GitHub secret, until the secret itself is replaced.

import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { BrandId } from '../../../src/types/ops';
import { igToken, isInstagramLoginToken, refreshInstagramToken } from '../lib/instagram';

const COLLECTION = 'ops_secrets';
const DAY = 86_400_000;
const fingerprint = (v: string | undefined) => (v ? createHash('sha256').update(v).digest('hex').slice(0, 16) : '');

/** The freshest usable token for a brand. */
export async function currentToken(db: Firestore | null, brand: BrandId): Promise<string | undefined> {
  const env = igToken(brand);
  if (!db || !env) return env;
  const doc = await db.collection(COLLECTION).doc(`ig-${brand}`).get();
  // A new secret in GitHub always wins over a token refreshed from the old one.
  return doc.exists && doc.get('fromSecret') === fingerprint(env) ? doc.get('token') : env;
}

/** Refresh when older than a day. Returns the expiry, or null for tokens that can't be refreshed. */
export async function keepAlive(db: Firestore, brand: BrandId, now: number): Promise<number | null> {
  const env = igToken(brand);
  const token = await currentToken(db, brand);
  if (!env || !token || !isInstagramLoginToken(token)) return null;
  const ref = db.collection(COLLECTION).doc(`ig-${brand}`);
  const doc = await ref.get();
  const fresh = doc.exists && doc.get('fromSecret') === fingerprint(env);
  if (fresh && now - (doc.get('refreshedAt') ?? 0) < DAY) return doc.get('expiresAt') ?? null;
  const next = await refreshInstagramToken(token);
  await ref.set({ token: next.token, expiresAt: next.expiresAt, refreshedAt: now, fromSecret: fingerprint(env) });
  return next.expiresAt;
}
