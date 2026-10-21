import type { Event } from '../types/discovery';
import { interestsFor } from './eventPicks';

/**
 * The look and the words an event page takes from what kind of night it is:
 * a gig gets a record and an equalizer, a play gets the curtain, a match gets
 * the pitch and a scoreboard ticket. One theme per event, picked from the same
 * interests the events board filters on, so the page and the board agree.
 */
export type EventThemeId = 'music' | 'stage' | 'gallery' | 'sports' | 'family' | 'food' | 'market' | 'talks' | 'outdoors' | 'community' | 'other';

export interface EventTheme {
  id: EventThemeId;
  /** The kicker above the title. */
  label: string;
  /** The heading over the write-up. */
  about: string;
  /** What the start time is called on the ticket. */
  start: string;
  /** The line printed across the ticket. */
  admit: string;
  /** The heading over more events of the same kind. */
  more: string;
}

export const EVENT_THEMES: Record<EventThemeId, EventTheme> = {
  music: { id: 'music', label: 'Live music', about: 'The show', start: 'Show', admit: 'Admit one', more: 'More live music' },
  stage: { id: 'stage', label: 'On stage', about: 'The performance', start: 'Curtain', admit: 'Admit one', more: 'More on stage' },
  gallery: { id: 'gallery', label: 'Art & exhibitions', about: 'On view', start: 'Opens', admit: 'Take a look', more: 'More art to see' },
  sports: { id: 'sports', label: 'Game day', about: 'The game', start: 'Game time', admit: 'Be there', more: 'More games' },
  family: { id: 'family', label: 'Family day', about: 'The day out', start: 'Starts', admit: 'Bring everyone', more: 'More for families' },
  food: { id: 'food', label: 'Food & drink', about: 'On the table', start: 'Starts', admit: 'Come hungry', more: 'More food & drink' },
  market: { id: 'market', label: 'Market', about: 'On the tables', start: 'Opens', admit: 'Bring a tote', more: 'More markets and makers' },
  talks: { id: 'talks', label: 'Talks & workshops', about: 'The session', start: 'Starts', admit: 'Save a seat', more: 'More talks & workshops' },
  outdoors: { id: 'outdoors', label: 'Outdoors', about: 'The plan', start: 'Starts', admit: 'Head out', more: 'More outdoors' },
  community: { id: 'community', label: 'Community', about: 'The cause', start: 'Starts', admit: 'All welcome', more: 'More community events' },
  other: { id: 'other', label: 'Event', about: 'What to expect', start: 'Starts', admit: 'See you there', more: 'More like this' },
};

const SPORT = /\b(vs\.?|v\.|hockey|football|soccer|basketball|volleyball|baseball|lacrosse|rugby|curling|wrestling|boxing|tournament|championship|playoffs?|fc|stampeders|flames|wranglers|roughnecks|hitmen|surge|cavalry|dinos|cougars)\b/i;
const ICE = /\b(skat(e|ing)|on ice)\b/i;
const MUSIC = /\b(pianist|piano|violin|cello|guitar|singer|songwriter|choir|chorus|ensemble|combos?|symphony|orchestra|jazz|band|concert|recital|duo|trio|punk|rock|indie|folk|metal|hip-hop|rap|dj|album|doors at|r&b|soul|country music|bluegrass)\b/i;
const STAGE = /\b(theat(re|er)|play|musical|opera|ballet|dance|comedy|comedian|stand-?up|improv|film|cinema|screening|drama|circus|cabaret|drag|puppet)\b/i;
const TALK = /\b(talk|lecture|workshop|panel|conversation|author|reading|seminar|class|webinar|evening with|@noon|symposium|forum|book (launch|club)|speakers?|circle)\b/i;
const GALLERY = /\b(exhibit(ion)?|galler(y|ies)|museum|art show|installation|collection|artists?)\b/i;
const ADULT = /\b(adults?|19\+|18\+|night out|after dark|cocktail)\b/i;
const OUTSIDE = /\b(tour|walk|hike|trail|river|park|garden|outdoor)\b/i;
const MARKET = /\b(markets?|makers|craft fair|bazaar)\b/i;

/** The theme for an event: the most specific kind its categories, title and summary support. */
export function eventThemeId(event: Pick<Event, 'kind' | 'categories' | 'tags' | 'title' | 'summary' | 'pricing'> & { venue?: string }): EventThemeId {
  const interests = new Set(interestsFor(event as Event));
  const tags = [...event.categories, ...event.tags].join(' ');
  const title = event.title, text = `${event.title} ${event.summary} ${tags}`;
  if (ICE.test(title)) return 'family';
  if (SPORT.test(title) || (interests.has('sports') && !ICE.test(text))) return 'sports';
  if (interests.has('markets') || MARKET.test(tags)) return 'market';
  if ((interests.has('music') || MUSIC.test(text)) && !STAGE.test(title)) return 'music';
  if (STAGE.test(tags) || STAGE.test(title) || /\btheat(re|er)\b/i.test(event.venue ?? '')) return 'stage';
  if (interests.has('learning') || TALK.test(title)) return 'talks';
  if (GALLERY.test(text)) return 'gallery';
  if (STAGE.test(text)) return 'stage';
  if (interests.has('family') && !ADULT.test(text)) return 'family';
  if (interests.has('food')) return 'food';
  if (interests.has('outdoors') || OUTSIDE.test(title)) return 'outdoors';
  if (interests.has('community')) return 'community';
  if (interests.has('arts')) return 'gallery';
  return 'other';
}

export function eventTheme(event: Parameters<typeof eventThemeId>[0]): EventTheme {
  return EVENT_THEMES[eventThemeId(event)];
}
