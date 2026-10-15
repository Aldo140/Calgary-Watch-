import { businessAccountPatch } from './businessAccount';
import { claimId, type ListingClaim } from './claims';

/** All approval writes must commit together. Identity comes from the claim, never CRM contacts. */
export function claimApprovalWrites(c: ListingClaim, profile: Record<string, unknown> | undefined, by: string, now: number) {
  if (c.status !== 'pending' && c.status !== 'approved') throw new Error('Only a pending or already approved claim can be approved.');
  if (!c.uid || !c.entityId || !profile || profile.uid !== c.uid) throw new Error('The claimant has no matching user profile. Ask them to sign in again, then retry approval.');
  const at = c.status === 'approved' ? (c.reviewedAt ?? 0) : now;
  return {
    claim: { status: 'approved', reviewedAt: at, reviewedBy: by, reviewNote: '' },
    mark: { entityId: c.entityId, title: c.entityTitle, claimId: claimId(c.uid, c.entityId), verifiedAt: at, verifiedBy: by },
    account: businessAccountPatch(profile, c.entityId, at || now),
  };
}

/** Old public marks alone aren't evidence. Legacy approvals still verify through the exported stamp. */
export function approvedPublicMark(entityId: string, mark: Record<string, unknown> | undefined): boolean {
  return mark?.entityId === entityId && typeof mark.claimId === 'string' && mark.claimId.endsWith(`_${entityId}`);
}
