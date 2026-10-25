import type { Incident } from '@/src/types';
import { safetyForQuery, safetyPath } from '@/src/lib/safety';
import { SAFETY_CONTACTS } from '@/src/content/safetyTopics';

/**
 * What the report panel says around a report: what kind of record it is,
 * what a reader can do about it, and who to call. Plain data so every report
 * type gets the same depth, and so the copy can be tested without a browser.
 */

export type ReportOrigin = 'neighbour' | 'police' | 'news' | 'city311' | 'feed' | 'example';

export interface GuideCall {
  label: string;
  note: string;
  href: string;
  /** The one call that matters most for this report. */
  primary?: boolean;
}

export interface ReportGuide {
  origin: ReportOrigin;
  /** One short heading for the "what this is" card. */
  whatTitle: string;
  /** Two or three sentences on what kind of record this is and how far to trust it. */
  what: string;
  /** Up to three steps, in order. */
  steps: string[];
  calls: GuideCall[];
  /** A /safety guide that covers this report, when one matches. */
  topic?: { label: string; path: string };
}

const CALL_911: GuideCall = { label: '911', note: 'Danger now', href: 'tel:911' };
const CALL_CPS: GuideCall = { label: SAFETY_CONTACTS.nonEmergency.label, note: 'Police non-emergency', href: `tel:${SAFETY_CONTACTS.nonEmergency.tel}` };
const CALL_TIPS: GuideCall = { label: SAFETY_CONTACTS.crimeStoppers.label, note: 'Crime Stoppers, anonymous', href: `tel:${SAFETY_CONTACTS.crimeStoppers.tel}` };
const CALL_311: GuideCall = { label: '311', note: 'City of Calgary', href: 'tel:311' };

export function reportOrigin(incident: Pick<Incident, 'data_source' | 'source_type' | 'authorUid'>): ReportOrigin {
  if (incident.data_source === 'demo') return 'example';
  const system = (incident.data_source != null && incident.data_source !== 'community') || incident.authorUid === 'system';
  if (!system) return 'neighbour';
  if (incident.source_type === 'calgary_police_crime') return 'police';
  if (incident.source_type === 'news_rss' || incident.source_type === 'reddit_calgary') return 'news';
  if (incident.source_type === 'calgary_open_data') return 'city311';
  return 'feed';
}

function whatFor(incident: Incident, origin: ReportOrigin): { whatTitle: string; what: string } {
  const place = incident.neighborhood || 'Calgary';
  const others = (incident.related_sources ?? []).filter((s) => s && s !== incident.source_name);
  switch (origin) {
    case 'example':
      return { whatTitle: 'An example, not a real report', what: 'This pin shows how a neighbour report looks. Nothing happened here.' };
    case 'neighbour':
      return {
        whatTitle: 'What a neighbour saw',
        what: `Someone in or near ${place} posted this from what they saw. It isn't a police record. When other neighbours confirm it, it holds up better.`,
      };
    case 'police':
      return {
        whatTitle: 'A Calgary Police release',
        what: `Police publish releases after the fact, so this tells you what happened, not what's going on right now. The pin sits in ${place}, not at an exact address.`,
      };
    case 'news':
      return {
        whatTitle: others.length ? `Covered by ${others.length + 1} newsrooms` : 'A local news story',
        what: `${incident.source_name || 'A newsroom'} reported this${others.length ? `, and so did ${others.join(', ')}` : ''}. It's placed at the community the story names, not the exact spot.`,
      };
    case 'city311':
      return {
        whatTitle: 'A request to the City',
        what: `Someone told the City about this through 311. It means the City was told, not that police came. The pin sits at the middle of ${place}.`,
      };
    default:
      return {
        whatTitle: `From ${incident.source_name || 'an official feed'}`,
        what: `Shown as ${incident.source_name || 'the source'} published it. Check with them for the latest.`,
      };
  }
}

const CATEGORY_STEPS: Record<string, string[]> = {
  crime: [
    'If it\'s happening now and someone is in danger, call 911.',
    'Saw something, or have camera footage from that time? Call police non-emergency and give the time and place.',
    'Check your own doors, car and bike, and tell the neighbours on your street.',
  ],
  emergency: [
    'Stay clear so crews have room to work.',
    'Follow what police and fire tell you on scene.',
    'Call 911 only if you\'re in danger or have urgent information.',
  ],
  traffic: [
    'Give it a wide berth or allow extra time.',
    'Slow down passing crews and tow trucks.',
    'If anyone is hurt, call 911.',
  ],
  infrastructure: [
    'Tell the City through 311 if it isn\'t already reported.',
    'Stay back from crews, open water and downed lines. Downed lines: call 911.',
    'Check on a neighbour who may need a hand.',
  ],
  weather: [
    'Expect slick roads and sidewalks nearby.',
    'Check the city alerts at the top of the map for warnings.',
    'Look in on a neighbour who may need a hand.',
  ],
};

const CATEGORY_CALLS: Record<string, GuideCall[]> = {
  crime: [{ ...CALL_CPS, primary: true }, CALL_911],
  emergency: [{ ...CALL_911, primary: true }],
  traffic: [CALL_911, CALL_311],
  infrastructure: [{ ...CALL_311, primary: true }, CALL_911],
  weather: [CALL_311],
};

export function reportGuide(incident: Incident): ReportGuide {
  const origin = reportOrigin(incident);
  const { whatTitle, what } = whatFor(incident, origin);
  const category = CATEGORY_STEPS[incident.category] ? incident.category : 'crime';
  let steps = CATEGORY_STEPS[category];
  let calls = CATEGORY_CALLS[category];
  let topic: ReportGuide['topic'];

  if (category === 'crime') {
    const match = safetyForQuery(`${incident.title} ${incident.description ?? ''}`)[0];
    if (match) {
      topic = { label: match.label, path: safetyPath(match) };
      steps = match.steps.slice(0, 3);
    }
    // A release or story is after the fact: what helps is a tip, not a 911 call.
    if (origin === 'police' || origin === 'news') calls = [{ ...CALL_TIPS, primary: true }, CALL_CPS];
  }
  if (origin === 'example') calls = [];

  return { origin, whatTitle, what, steps, calls, topic };
}

/** "3 more reports in Beltline in the last day", counted from what the map holds. */
export function areaPulse(
  incident: Pick<Incident, 'id' | 'neighborhood'>,
  all: readonly Pick<Incident, 'id' | 'neighborhood' | 'timestamp'>[],
  now = Date.now(),
): number {
  const hood = (incident.neighborhood || '').trim().toLowerCase();
  if (!hood || hood === 'calgary') return 0;
  return all.filter((i) => i.id !== incident.id && (i.neighborhood || '').trim().toLowerCase() === hood && now - i.timestamp <= 86_400_000).length;
}

/** "2:14 p.m.", "Yesterday 2:14 p.m." or "Sat, Oct 24 · 2:14 p.m." in Calgary time. */
export function reportClock(timestamp: number, now = Date.now()): string {
  const tz = 'America/Edmonton';
  const day = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: tz });
  const time = new Date(timestamp).toLocaleTimeString('en-CA', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  if (day(timestamp) === day(now)) return time;
  if (day(timestamp) === day(now - 86_400_000)) return `Yesterday ${time}`;
  const date = new Date(timestamp).toLocaleDateString('en-CA', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
  return `${date} · ${time}`;
}
