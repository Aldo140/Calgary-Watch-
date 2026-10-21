import type { PlansDraft } from './plans';
import type { PlansProfile } from './plansProfile';
import { canonicalNeighborhood, looksLikeStreetAddress } from './homeArea';

/** Area is optional; permission to store a supplied area remains explicit. */
export function plansSetupProblem(draft: PlansDraft, existing: PlansProfile | null): string {
  const hasArea = Boolean(draft.neighborhood.trim() || draft.address.trim());
  if (hasArea && !existing?.piiConsentAt && !draft.consent) return 'Tick the box to save your area, or continue without a location.';
  if (draft.eventsDigestOptIn && !draft.interests.length) return 'Pick at least one interest for your event picks, or untick that email.';
  return '';
}

export function plansAreaPatch(draft: Pick<PlansDraft, 'neighborhood' | 'address' | 'inferredNeighborhood' | 'consent'>, existing: { piiConsentAt?: number | null } | null, now: number) {
  // A street address typed into the neighbourhood box is saved as the address,
  // where the Thursday email can place it; a community gets its proper spelling.
  const typed = draft.neighborhood.trim();
  const movedAddress = Boolean(typed && !draft.address.trim() && looksLikeStreetAddress(typed));
  const neighborhood = movedAddress ? '' : canonicalNeighborhood(typed).slice(0, 80);
  const address = (movedAddress ? typed : draft.address.trim()).slice(0, 160);
  const hasArea = Boolean(neighborhood || address);
  if (hasArea && !existing?.piiConsentAt && !draft.consent) throw Error('Permission is required to save your area.');
  return {
    neighborhood,
    address,
    inferredNeighborhood: address ? draft.inferredNeighborhood.trim().slice(0, 80) : '',
    locationPreferenceType: address ? 'address' : neighborhood ? 'neighborhood' : 'none',
    piiConsentAt: hasArea ? existing?.piiConsentAt || now : null,
  };
}
