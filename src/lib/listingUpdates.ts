import { UPDATE_FIELDS, type ListingUpdate, type UpdateField } from './claims';

/** A request for review, never an edit to discovery records. Photos remain email attachments. */
export function listingUpdateProblem(field: UpdateField, details: string, url: string): string {
  if (!UPDATE_FIELDS.some(f => f.id === field)) return 'Choose what should change.';
  if (details.trim().length < 3) return 'Add a few details about the change.';
  if (details.trim().length > 2000) return 'Keep the details under 2,000 characters.';
  if (field === 'link' && !url.trim()) return 'Add the official HTTPS link.';
  if (url.trim()) {
    try { if (new URL(url.trim()).protocol !== 'https:' || url.trim().length > 2000) return 'Use a valid HTTPS source link.'; }
    catch { return 'Use a valid HTTPS source link.'; }
  }
  return '';
}
export function listingUpdateRequest(uid: string, claim: { entityId: string; entityTitle: string }, field: UpdateField, details: string, url: string, now: number): ListingUpdate {
  const problem = listingUpdateProblem(field, details, url);
  if (problem || !uid || !claim.entityId) throw new Error(problem || 'Sign in to manage this listing.');
  return { uid, entityId: claim.entityId, entityTitle: claim.entityTitle.slice(0, 160), field, details: details.trim(), url: url.trim(), status: 'pending', createdAt: now };
}
