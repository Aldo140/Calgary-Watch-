// /date-night: CalgaryWatch's picks for a night out for two. Each pick points at a
// real listing (by source and record id, so dates and expiry come from the
// organizer's own data) and adds a take written only from facts on that listing
// or its source page. Picks are editorial and never sold; see /partners.

export type DateVibe = 'Dinner and a show' | 'Laugh together' | 'Dress up' | 'Something festive' | 'Loud night out' | 'Quiet and bookish';

export interface DatePick {
  sourceId: string;
  recordId: string;
  vibe: DateVibe;
  /** Why it works as a date. Facts only; no invented visits. */
  take: string;
  /** A line quoted from the organizer, with who said it. */
  quote?: { text: string; by: string };
  /** A practical tip for making a night of it, from the listing's facts. */
  tip?: string;
}

export const DATE_PICKS: DatePick[] = [
  {
    sourceId: 'theatre-calgary', recordId: 'little-shop-of-horrors-2026', vibe: 'Dinner and a show',
    take: 'A musical that is funny and a little gruesome gives you plenty to talk about at intermission, and it doesn’t ask either of you to love musicals.',
    quote: { text: 'A darkly comic tale about ambition, love, and the price of getting what you wish for.', by: 'Theatre Calgary' },
    tip: 'Evening shows start at 7:30 and run 2 hours 5 minutes with an intermission, so an early dinner downtown fits.',
  },
  {
    sourceId: 'wordfest', recordId: 'imaginairium-2026-literary-death-match', vibe: 'Laugh together',
    take: 'For a couple that likes books but not sitting in silence: it’s a competition, it’s on a Friday night, and it’s in the Beltline.',
    tip: 'It’s part of Wordfest’s Imaginairium week (Oct. 13–18), 41 shows in all, so there’s a backup if it sells out.',
  },
  {
    sourceId: 'spruce-meadows', recordId: 'international-christmas-market-2026', vibe: 'Something festive',
    take: 'New this year, Friday evenings from 6 to 9 are 18+ only: the whole Christmas market, minus the strollers.',
    tip: 'Adult tickets are $20 plus GST and general parking is included, so skip the transit planning.',
  },
  {
    sourceId: 'alberta-ballet', recordId: 'nutcracker-calgary-2026', vibe: 'Dress up',
    take: 'An easy excuse to dress up, and the Calgary Philharmonic plays Tchaikovsky live, which you don’t get with most holiday shows.',
    tip: 'Evening shows are at 6 or 7 pm, early enough for a late dinner afterwards.',
  },
  {
    sourceId: 'scotiabank-saddledome', recordId: 'smashing-pumpkins-2026-11-03', vibe: 'Loud night out',
    take: 'Two sets, and one of the last big concerts in the Saddledome before it closes for good after this season.',
    tip: 'Doors and show times are on the ticket; the listing says 8 pm.',
  },
  {
    sourceId: 'wordfest', recordId: 'imaginairium-2026-bonnie-garmus', vibe: 'Quiet and bookish',
    take: 'The closing show of Wordfest week, in Bella Concert Hall at Mount Royal: a sit-down evening for two readers.',
  },
  {
    sourceId: 'wordfest', recordId: 'imaginairium-2026-opening-night', vibe: 'Quiet and bookish',
    take: 'Two Olympians, Cassie Campbell-Pascall and Clara Hughes, open the festival. A good first date if one of you is the sporty one.',
  },
];

/** No tickets needed: evergreen ideas that point at our own guides and neighbourhoods. */
export const DATE_FREE_IDEAS: Array<{ title: string; body: string; to: string; cta: string; neighbourhood?: string }> = [
  { title: 'Walk the Bow at dusk', body: 'Prince’s Island Park to the Peace Bridge is flat, free and about as close to the river as downtown gets.', to: '/guides/a-day-along-the-bow-river', cta: 'The Bow River walk' },
  { title: 'An evening in Inglewood', body: 'Calgary’s oldest neighbourhood has the bars, music rooms and shops of 9 Avenue SE within a few blocks.', to: '/neighbourhoods', cta: 'Neighbourhood guide', neighbourhood: 'Inglewood' },
  { title: 'Kensington for the night', body: 'Two walkable streets of restaurants and a cinema, with the river a block away.', to: '/neighbourhoods', cta: 'Neighbourhood guide', neighbourhood: 'Kensington' },
];
