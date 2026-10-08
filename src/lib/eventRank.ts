import type { DiscoveryEntity } from '../types/discovery';
import { calgaryDateTimeFormat } from './calgaryTz';

/**
 * How likely a listing is to be something Calgarians actually go out for. The day
 * list on the homepage sorts by this, so a Flames game, ScreamFest or a Saddledome
 * concert leads and a campus lecture sinks. Every signal is something the listing
 * itself carries (venue, title, source, image); nothing here is invented.
 */

/** Places people plan a night around. */
const MARQUEE_VENUE = /saddledome|scotia place|stampede park|bmo centre|gmc stadium|big four|nutrien western|mcmahon|jubilee|jack singer|werklund|arts commons|grey eagle|studio bell|national music centre|calgary zoo|wilder institute|telus spark|heritage park|spruce meadows|olympic plaza|shaw millennium|prince'?s island|winsport|canada olympic park|calaway|max bell|theatre calgary|stephen avenue|east village|the confluence|contemporary calgary|glenbow|central library|bella concert hall|vertigo|chinook centre|eau claire/i;

/** Pro and major-junior teams that fill an arena. */
const BIG_LEAGUE = /\b(flames|stampeders|grey cup)\b/i;
const PRO_SPORTS = /\b(wranglers|hitmen|roughnecks|cavalry|surge)\b/i;

/** Kinds of outing that draw a crowd. */
const BIG_DRAW = /scream ?fest|scare ?fest|zoo ?lights|zoo ?boo|festival|\bfest\b|parade|fireworks|philharmonic|symphony|ballet|opera|broadway|musical|nutcracker|\btour\b|\blive\b|presents|concert|comedy|stand-?up|night market|halloween|haunted|pumpkin|corn maze|christmas market|holiday market|ghost|spooky|fright/i;

/** Small-room formats: real, but rarely a reason to cross town. */
const SMALL_FORMAT = /workshop|lecture|seminar|webinar|symposium|conference|speaker series|info(rmation)? session|orientation|book club|craft club|open studio|drop-?in|conversation table|professional development|support group|meeting|homeschool|@ ?noon|recital hour|\bclass\b|^tour\s*[–—-]/i;

/** Varsity games ("Women's Hockey — MacEwan Griffins vs. Mount Royal Cougars"). */
const VARSITY = /\b(men'?s|women'?s|volleyball|basketball|soccer|hockey)\b.*\bvs\.?\b.*\b(cougars|dinos)\b/i;

/** Campus-only listings that a university calendar publishes for its own students
 * and staff: a room code in the venue ("MSC 171", "Craigie Hall Room Block C 119")
 * or a student-services format. These are hidden from the public listings. */
const ROOM_CODE = /\b(room|rm\.?)\s*\w+|\b[A-Z]{2,4}\s?\d{3}\b/;
const CAMPUS_ONLY = /\bunwind\b|wellness|student|staff|faculty|alumni|orientation|convocation|commitments|info(rmation)? session|professional development|conversation table|research (symposium|day|showcase)|thesis|defen[cs]e|speaker series|elders on campus/i;
const CAMPUS_SOURCES = new Set(['ucalgary-arts', 'mru-public']);

type Rankable = Pick<DiscoveryEntity, 'kind' | 'title' | 'categories' | 'tags' | 'image' | 'sourceId' | 'verification' | 'scores'> & { venue?: string; neighbourhood?: string; pricing?: string };

const text = (e: Rankable) => `${e.title} ${[...e.categories, ...e.tags].join(' ')}`;
const hour = (iso: string) => Number(calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)));

/** A university-calendar listing meant for its own campus, not the city. */
export function isCampusOnly(e: Rankable): boolean {
  if (!e.sourceId || !CAMPUS_SOURCES.has(e.sourceId)) return false;
  return ROOM_CODE.test(e.venue ?? '') || CAMPUS_ONLY.test(e.title);
}

/** Higher is more worth going to. `start` is when this occurrence begins. */
export function interestScore(e: Rankable, start?: string): number {
  const t = text(e);
  const venue = `${e.venue ?? ''} ${e.neighbourhood ?? ''}`;
  let s = 0;
  if (BIG_LEAGUE.test(e.title)) s += 6;
  else if (PRO_SPORTS.test(e.title)) s += 4;
  if (BIG_DRAW.test(t)) s += 3;
  if (MARQUEE_VENUE.test(venue) || MARQUEE_VENUE.test(e.title)) s += 3;
  if (e.sourceId === 'ticketmaster-calgary') s += 2;
  else if (e.sourceId === 'visit-calgary') s += 1;
  if (e.verification === 'source-checked') s += 2; // hand-reviewed by an editor
  if (e.image) s += 1;
  if (e.kind === 'market') s += 2;
  s += Math.min(5, (e.scores?.featured ?? 0) + (e.scores?.editorial ?? 0));
  if (start) { const h = hour(start); if (h >= 17 && h <= 21) s += 1; }
  if (SMALL_FORMAT.test(e.title)) s -= 4;
  if (VARSITY.test(e.title)) s -= 3;
  if (e.sourceId && CAMPUS_SOURCES.has(e.sourceId)) s -= 2;
  if (isCampusOnly(e)) s -= 10;
  return s;
}
