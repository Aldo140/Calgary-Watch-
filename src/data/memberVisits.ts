/**
 * Member visits: when a CalgaryWatch member goes to a show, screening or meal as
 * an organizer's partner, the organizer's /local profile gets a short note.
 *
 * Rules (see docs/member-visits.md):
 * - `attended` is true only when we know a member actually went.
 * - Everything under `about` comes from the organizer's own published info or
 *   press, with the source named in `sources`. No invented details.
 * - `impressions` holds only what the member who went told us, in their words
 *   (edited for length). Leave it empty until then; the card never fills the gap.
 * - Describe the relationship as a partnership; never mention comp tickets.
 */
export interface MemberVisit {
  /** What the member went to. */
  event: string;
  /** Calgary date of the visit, YYYY-MM-DD. */
  on: string;
  venue: string;
  attended: boolean;
  partnerLabel: string;
  /** Facts about the event from the organizer's own info, one line each. */
  about: string[];
  /** Our recommendation for readers, framed as a suggestion, not a memory. */
  recommendation: string;
  /** What's next, from the organizer's published schedule. */
  next?: { label: string; url: string };
  /** The member's own impressions, added only after they share them. */
  impressions: string[];
  sources: { label: string; url: string }[];
}

export const MEMBER_VISITS: Record<string, MemberVisit> = {
  'biz-spiritus-chamber-choir': {
    event: 'The Turning Season',
    on: '2026-11-08',
    venue: 'Calgary',
    attended: true,
    partnerLabel: 'In partnership with Spiritus Chamber Choir',
    about: [
      'The Turning Season opened Spiritus Chamber Choir’s 30th season.',
      'The 2026–27 season runs across four concerts, with venues that vary by concert.',
      'Still to come: Radiant Joy on December 13, From This Land on March 14 and The Sacred Veil on May 16, each at 3 p.m.',
    ],
    recommendation: 'If you’re building a December list, Radiant Joy on Sunday, December 13 at 3 p.m. is an easy afternoon to add. Check the choir’s tickets page for the venue and prices.',
    next: { label: 'Radiant Joy, Dec 13 · tickets', url: 'https://www.spirituschamberchoir.ca/tickets' },
    impressions: [],
    sources: [
      { label: 'Spiritus Chamber Choir, tickets and season', url: 'https://www.spirituschamberchoir.ca/tickets' },
    ],
  },
  'biz-calgary-underground-film-festival': {
    event: 'CUFF.Docs opening night: Ladies and Gentlemen, Brian Mulroney',
    on: '2026-11-18',
    venue: 'Globe Cinema, 617 8 Ave SW',
    attended: true,
    partnerLabel: 'In partnership with the Calgary Underground Film Festival',
    about: [
      'Opening night of the 14th CUFF.Docs Documentary Film Festival, which ran November 18 to 22 at Globe Cinema with 15 features, 17 shorts and CATVIDEOFEST.',
      'Visiting and local filmmakers walked the red carpet before the screening, including opening-night director Matthew Rankin.',
      'Ladies and Gentlemen, Brian Mulroney is Rankin’s 99-minute NFB documentary, told in six episodes, about the rise of Canada’s 18th prime minister. It won the People’s Choice Midnight Madness Award at TIFF 2026.',
    ],
    recommendation: 'CUFF’s main festival is the next big one: the 24th Calgary Underground Film Festival runs April 15 to 25, 2027, with the programme and passes due in late March. Worth a spot on your spring calendar now.',
    next: { label: 'CUFF 2027, April 15–25', url: 'https://www.calgaryundergroundfilm.org/plan-your-trip/' },
    impressions: [],
    sources: [
      { label: 'CUFF.Docs, official festival information', url: 'https://www.calgaryundergroundfilm.org/cuffdocs/' },
      { label: 'Ladies and Gentlemen, Brian Mulroney, NFB press kit', url: 'https://mediaspace.nfb.ca/epk/ladies-and-gentlemen-brian-mulroney/' },
      { label: 'Huge documentary film festival returns to Calgary this fall, Daily Hive', url: 'https://dailyhive.com/calgary/cuff-docs-documentary-film-festival-calgary-2026' },
    ],
  },
};
