/**
 * CalgaryWatch Spotlights: long-form features on the people behind what's on
 * in Calgary. Hand-written, never paid for. Every fact here is either cited to
 * a public page (`sources`) or attributed to the person who told us, and the
 * page shows which.
 *
 * Time-sensitive promotion (the homepage and /events cards) runs only inside
 * `promo`; the feature itself stays up afterwards as an evergreen story.
 *
 * To add a film to a showcase, add a `ShowcaseFilm` with only the fields you
 * can source. Blank fields are left out of the card, never guessed. A still or
 * poster needs `permission` saying who allowed it.
 */

export interface SpotlightSource { id: string; label: string; url: string; publisher: string }

export interface SpotlightLink {
  /** Analytics key for the click (≤ 32 chars). */
  id: 'festival' | 'tickets' | 'submissions' | 'facebook' | 'screamfest' | 'venue-2025' | (string & {});
  label: string;
  url: string;
  note?: string;
  /** Shown as the main call to action. */
  primary?: boolean;
}

export interface ShowcasePerson { name: string; role: string; url?: string }

export interface ShowcaseFilm {
  title: string;
  /** Directors and the rest of the team, as credited by the film itself. */
  team: ShowcasePerson[];
  synopsis?: string;
  genre?: string;
  runtimeMinutes?: number;
  year?: number;
  /** Where the filmmakers are from, when they say so. */
  origin?: string;
  image?: { src: string; alt: string; credit: string; permission: string; kind: 'poster' | 'still' };
  links?: { label: string; url: string; kind: 'website' | 'trailer' | 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'vimeo' | 'other' }[];
  /** Which public page or person each detail comes from. */
  source: string;
}

export interface SpotlightQuestion { topic: string; question: string; answer?: string }

export interface Spotlight {
  slug: string;
  /** Short name used in cards and analytics. */
  name: string;
  title: string;
  dek: string;
  published: string;
  updated: string;
  seo: { title: string; description: string };
  /** The link-preview card: a word for the cover and one fact line. */
  card: { mark: string; line: string };
  organizer: { name: string; role: string };
  /** The organizer's /local profile, which carries the spotlight card. */
  profileId?: string;
  /** The organizer's plans, attributed to them, in one sentence. */
  future: string;
  /** Disclosure shown at the top and bottom of the feature. */
  /** Short label for cards and the hero kicker, e.g. "In partnership with …". */
  partnerLabel: string;
  disclosure: string;
  /** The homepage / events cards run while now is inside this window. */
  promo: { from: string; until: string };
  /** Reviewed-source ids whose event pages carry the spotlight card. */
  relatedSourceIds: string[];
  venue: { name: string; address: string; hours: string; mapQuery: string };
  links: SpotlightLink[];
  sources: SpotlightSource[];
  showcase: { heading: string; season: string; films: ShowcaseFilm[]; callForFilmmakers: string };
  interview: { with: string; status: 'requested' | 'published'; questions: SpotlightQuestion[] };
  review: { status: 'pending' | 'published'; visitOn: string; body: string[] };
}

export const SPOTLIGHT_CONTACT = 'aldo@calgarywatch.ca';

export const HEX_AFTER_DARK: Spotlight = {
  slug: 'hex-after-dark',
  name: 'Hex After Dark',
  title: 'The Dark Side of Calgary Cinema: Inside Hex After Dark',
  dek: 'A festival of short horror films, playing in the bar at ScreamFest this October, and the people who make them.',
  published: '2026-10-27',
  updated: '2026-10-27',
  seo: {
    title: 'Hex After Dark: Short Horror Films at ScreamFest Calgary | CalgaryWatch',
    description: 'Inside Hex After Dark, the short horror film festival playing in the bar at ScreamFest Calgary, included with admission. How to go, the filmmakers, and the festival’s hopes for The GRAND.',
  },
  card: { mark: 'HEX', line: 'Short horror films in the bar at ScreamFest' },
  organizer: { name: 'Cameron Gall', role: 'Organizer, Hex After Dark Film Festival' },
  profileId: 'biz-hex-after-dark',
  future: 'Cameron Gall has told CalgaryWatch he hopes to bring Hex After Dark back to The GRAND next year, if the festival secures grant funding.',
  disclosure: 'CalgaryWatch is partnering with Hex After Dark on this spotlight, as part of our work with Calgary’s independent arts community. It isn’t paid advertising: the story and any opinions are our own.',
  // ScreamFest's last night ends at midnight on Oct 31 (Calgary is UTC-6 year-round).
  partnerLabel: 'In partnership with Hex After Dark',
  promo: { from: '2026-10-27T00:00:00-06:00', until: '2026-11-01T00:00:00-06:00' },
  relatedSourceIds: ['screamfest'],
  venue: {
    name: 'The bar at ScreamFest, GMC Stadium, Stampede Park',
    address: '2200 Stampede Trail SE, Calgary',
    hours: '7 p.m. to midnight on ScreamFest nights',
    mapQuery: 'GMC Stadium, 2200 Stampede Trail SE, Calgary, AB',
  },
  links: [
    { id: 'tickets', label: 'ScreamFest tickets', url: 'https://www.showpass.com/screamfest-28/', note: 'The films are included with ScreamFest admission', primary: true },
    { id: 'festival', label: 'Hex After Dark', url: 'https://hexafterdark.com/', note: 'The festival’s own site' },
    { id: 'screamfest', label: 'ScreamFest', url: 'https://screamfest.ca/', note: 'Nights, age rules and packages' },
    { id: 'facebook', label: 'Hex After Dark on Facebook', url: 'https://www.facebook.com/p/HEX-After-Dark-100064707322929/' },
    { id: 'submissions', label: 'Submit a film', url: 'https://filmfreeway.com/HEXFilmFestival', note: 'The festival’s FilmFreeway page' },
  ],
  sources: [
    { id: 'filmfreeway', label: 'HEX After Dark Film Festival', url: 'https://filmfreeway.com/HEXFilmFestival', publisher: 'FilmFreeway' },
    { id: 'grand-2025', label: 'HEX After Dark Film Festival, October 27, 2025', url: 'https://www.thegrandyyc.ca/hexafterdark', publisher: 'The GRAND' },
    { id: 'burnaby-2022', label: 'HEX After Dark Film Festival', url: 'https://tourismburnaby.com/events/hex-after-dark-film-festival/', publisher: 'Tourism Burnaby' },
    { id: 'screamfest', label: 'ScreamFest Calgary', url: 'https://screamfest.ca/', publisher: 'ScreamFest' },
  ],
  showcase: {
    heading: 'The films and the people who made them',
    season: '2026',
    films: [],
    callForFilmmakers: 'Made a short that’s screening at Hex After Dark this year? Email us the title, who made it, a one-line synopsis, the runtime and a still you own, and we’ll add your card.',
  },
  interview: {
    with: 'Cameron Gall',
    status: 'requested',
    questions: [
      { topic: 'The start', question: 'How did Hex After Dark begin, and what was the first screening like?' },
      { topic: 'The films', question: 'How do you choose the films? Who watches the submissions, and what makes one stand out?' },
      { topic: 'The room', question: 'What changes when horror shorts play in a bar at ScreamFest instead of a theatre?' },
      { topic: 'Calgary', question: 'What does Calgary’s horror and indie film community look like from where you sit?' },
      { topic: 'The filmmakers', question: 'Which filmmakers from past years should Calgary keep an eye on?' },
      { topic: 'Next year', question: 'What would it take to bring the festival back to The GRAND, and how can people help?' },
    ],
  },
  review: { status: 'pending', visitOn: '2026-10-30', body: [] },
};

export const SPOTLIGHTS: Spotlight[] = [HEX_AFTER_DARK];
