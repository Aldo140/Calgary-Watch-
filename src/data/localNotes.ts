/**
 * CalgaryWatch's editorial notes for Local picks. Every line is built from facts in the
 * listing and its official source; "Our pick" lines are our opinion and are never sold.
 * Paid placement is labelled "Featured partner" and never becomes a pick.
 */
export interface LocalNote {
  pick: string;
  note: string;
  dontMiss: string[];
  since?: string;
  /** Lowercase text that identifies a market held at this place, for a real next-date cross-link. */
  marketMatch?: string;
}

export const LOCAL_NOTES: Record<string, LocalNote> = {
  'biz-rosso-inglewood': {
    pick: 'Our pick for coffee in Inglewood',
    note: 'Order a single-origin pour-over, add a sourdough pastry and take both out to the patio. It’s an easy stop on a ride along the Bow.',
    dontMiss: ['Single-origin pour-overs', 'Cold brew', 'Beans roasted in SE Calgary, to take home'],
    since: 'Roasting since 2007',
  },
  'biz-higher-ground-kensington': {
    pick: 'Our pick for a late coffee in Kensington',
    note: 'Come after dark. It stays open late, there’s a fireplace, and the brick walls hang local art.',
    dontMiss: ['Organic, fair-trade coffee', 'Warm comfort meals', 'Outdoor seating on 10th Street'],
    since: 'A Kensington anchor for 20+ years',
  },
  'biz-cspace-marda-loop': {
    pick: 'Our pick for an afternoon of art in Marda Loop',
    note: 'Wander the halls of a 1912 sandstone school: studios, galleries and a coffee bar, with more than 30 artists and makers under one roof.',
    dontMiss: ['Galleries', 'Artist studios', 'Indoor-outdoor artisan fairs'],
    since: 'In a 1912 sandstone school',
    marketMatch: 'cspace',
  },
  'biz-lukes-drug-mart-bridgeland': {
    pick: 'Our favourite corner of Bridgeland',
    note: 'Flip through the vinyl while your espresso’s pulled, then leave with a soft serve when it’s in season. It’s still a working pharmacy, too.',
    dontMiss: ['Curated vinyl', 'Espresso bar', 'Seasonal soft serve', 'Specialty groceries'],
    since: 'In Bridgeland since 1951',
  },
};
