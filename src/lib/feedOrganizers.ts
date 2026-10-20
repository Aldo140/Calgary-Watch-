import type { Business, DiscoveryEntity, Event } from '../types/discovery';
import { organizationIdentityForName } from './organizations';

/**
 * Every event names an organizer, but not every organizer earns a profile on Local.
 * An organizer gets one, built from its own calendar, when it publishes enough of
 * its own events to fill a page: at least FEED_PROFILE_MIN upcoming listings whose
 * official source is that organizer's calendar (Mount Royal University, University
 * of Calgary). One-off organizers and names that reach us only through Tourism
 * Calgary relists keep a plain organizer line and a private claim workspace.
 *
 * Built at export, before associateOrganizers, which then links the events by the
 * same exact name + official host rule it uses for curated profiles.
 */
export const FEED_PROFILE_MIN = 3;

const PLACEHOLDER = /^(organizer not listed|see the organizer|tbd|tba|unknown)$/i;
const normalize = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const slugify = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const top = (values: (string | undefined)[], n: number) => {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([v]) => v);
};

/** The id a feed organizer's profile always gets, so claims and links survive rebuilds. */
export const feedProfileId = (name: string) => `biz-${slugify(name)}`;

/**
 * `keep` holds profile ids that must not vanish when a calendar runs thin (an approved
 * organization claim points at them); those need only one upcoming listing.
 */
export function feedOrganizerProfiles<T extends { id: string; kind: string; status?: string }>(entities: readonly T[], now = Date.now(), keep: ReadonlySet<string> = new Set()): Business[] {
  const all = entities as unknown as readonly DiscoveryEntity[];
  const taken = new Set(all.filter(e => e.kind === 'business').flatMap(e => [e.id, normalize(e.title), normalize((e as Business).name ?? '')]));
  const groups = new Map<string, Event[]>();
  for (const e of all) {
    if (e.kind !== 'event' || e.status !== 'published' || e.cancelled || !(Date.parse(e.end) > now)) continue;
    const name = String(e.organizer ?? '').trim();
    if (!name || PLACEHOLDER.test(name) || !e.sources.some(s => s.kind === 'official' && host(s.url))) continue;
    groups.set(name, [...(groups.get(name) ?? []), e]);
  }
  const profiles: Business[] = [];
  for (const [name, events] of groups) {
    const id = feedProfileId(name);
    if (!slugify(name) || taken.has(id) || taken.has(normalize(name)) || organizationIdentityForName(name)) continue;
    if (events.length < (keep.has(id) ? 1 : FEED_PROFILE_MIN)) continue;
    const official = events.flatMap(e => e.sources.filter(s => s.kind === 'official' && host(s.url)));
    const calendars = [...new Map(official.map(s => [host(s.url), s])).values()]
      .map(s => ({ name: s.name, url: `https://${new URL(s.url).hostname}/`, kind: 'official' as const, ...(s.retrievedAt ? { retrievedAt: s.retrievedAt } : {}) }));
    const calendar = calendars[0];
    const neighbourhood = top(events.map(e => e.neighbourhood), 1)[0];
    const updatedAt = events.map(e => e.updatedAt).sort().at(-1) ?? new Date(now).toISOString();
    profiles.push({
      id, kind: 'business', slug: slugify(name), title: name, name,
      summary: `Public events from ${name}, listed from its own calendar.`,
      description: `Every date here comes from ${name}’s public events calendar (${host(calendar.url)}). Check each event page for tickets, times and access.`,
      categories: top(events.flatMap(e => e.categories), 2), tags: ['organizer', 'feed-profile'],
      sources: calendars, address: 'Calgary, AB', ...(neighbourhood ? { neighbourhood } : {}),
      website: calendar.url, images: [], socials: { website: calendar.url }, services: ['Public events'],
      claimed: false, partner: false, editorialSelection: false,
      status: 'published', verification: 'source-feed', verifiedAt: updatedAt, updatedAt,
    });
  }
  return profiles.sort((a, b) => a.id.localeCompare(b.id));
}
