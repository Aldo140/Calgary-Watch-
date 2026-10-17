/** The shape and checks of a White Pages recommendation, kept free of Firebase so tests can import it. */

/** "place" for a shop, café or venue; otherwise a LOCAL_SERVICES id. */
export interface RecommendationInput {
  businessName: string;
  kind: string;
  contact: string;
  neighbourhood: string;
  why: string;
  /** How the recommender wants to be credited on the listing, or '' for no credit. */
  creditAs: string;
}

export interface Recommendation extends RecommendationInput {
  id: string;
  uid: string;
  status: 'new' | 'listed' | 'outreach' | 'declined';
  createdAt: number;
}

export const REC_LIMITS = { businessName: 120, contact: 200, neighbourhood: 80, why: 1000, creditAs: 60 } as const;

/** Trimmed, clipped input, or an error message a person can act on. */
export function cleanRecommendation(raw: RecommendationInput): RecommendationInput | string {
  const clip = (v: string, n: number) => v.trim().replace(/\s+/g, ' ').slice(0, n);
  const out: RecommendationInput = {
    businessName: clip(raw.businessName, REC_LIMITS.businessName),
    kind: clip(raw.kind, 40) || 'place',
    contact: clip(raw.contact, REC_LIMITS.contact),
    neighbourhood: clip(raw.neighbourhood, REC_LIMITS.neighbourhood),
    why: raw.why.trim().slice(0, REC_LIMITS.why),
    creditAs: clip(raw.creditAs, REC_LIMITS.creditAs),
  };
  if (out.businessName.length < 2) return 'Add the business’s name.';
  if (out.contact.length < 4) return 'Add their website or phone number so we can check them.';
  if (out.why.length < 10) return 'Tell us a little about why they’re good.';
  return out;
}

