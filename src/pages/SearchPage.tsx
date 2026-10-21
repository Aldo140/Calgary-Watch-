import { useOrganizationLive } from '../lib/organizationLive';
import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SiteLayout } from '../components/site/SiteLayout';
import { SearchBoard } from '../components/site/SearchBoard';
import type { Suggestion } from '../components/site/GlobalSearch';
import { discoveryRepository } from '../data/discovery';
import { CALGARY_COMMUNITIES } from '../data/calgaryCommunities';
import { DISCOVERY_SECTIONS, entityPath, normalizeSearch } from '../lib/discovery';
import { bestPicks, nearbyListings, searchListings, serviceFor } from '../lib/listingSearch';
import { answerCount, normalizeWords, parseSearchIntent } from '../lib/searchIntent';
import { recordSearch } from '../lib/searchDemand';
import { BEST_CATEGORIES, type BestCategory } from '../content/bestOf';
import { bestForQuery, bestPath, isRanked } from '../lib/bestOf';
import { SAFETY_TOPICS } from '../content/safetyTopics';
import { safetyForQuery, safetyPath } from '../lib/safety';
import type { CrimeNewsFile } from '../lib/safetyNews';
import crimeNews from '../generated/crime-news.json';

const KIND: Record<string, string> = { event: 'Event', market: 'Market', business: 'Local', guide: 'Guide', neighbourhood: 'Neighbourhood' };
const SHORTCUTS: Suggestion[] = [
  ...DISCOVERY_SECTIONS.map(s => ({ label: s.label, note: 'Section', to: s.path })),
  { label: 'Date night', note: 'Section', to: '/date-night' },
  { label: 'Live map', note: 'Section', to: '/map' },
  { label: 'Check your community', note: 'Section', to: '/check-your-community' },
  { label: 'Best of Calgary', note: 'Section', to: '/best' },
  { label: 'Calgary safety news', note: 'Section', to: '/safety' },
];
const NEWS = crimeNews as CrimeNewsFile;
const NEWS_WORDS = /\b(?:police|crime|crimes|news|safety)\b/i;
const bestLabel = (c: BestCategory) => c.kind === 'food' ? `Best ${c.noun} in Calgary` : `${c.label} in Calgary`;
const bestNote = (c: BestCategory) => `${c.places.length} ${c.kind === 'food' ? 'spots' : 'companies'}, ${isRanked(c) ? 'ranked by how many guides name them' : 'A–Z with a source for every fact'}`;
const COMMUNITY_KEYS = CALGARY_COMMUNITIES.flatMap(c => [c.name, ...(c.aliases ?? [])].map(raw => ({ label: raw.replace(/\b\p{Ll}/gu, ch => ch.toUpperCase()), key: normalizeWords(raw).join(' '), c })));

/**
 * /search, in its own small chunk: listings ranked by searchListings, the
 * ready-made report answers from parseSearchIntent, and suggestions while
 * typing, all from data already in the page. Nothing waits on the network.
 */
export default function SearchPage() {
  useOrganizationLive();
  const [params] = useSearchParams();
  const q = normalizeSearch(params.get('q') ?? '');
  const all = discoveryRepository.list();
  const occurrences = useMemo(() => discoveryRepository.occurrences(), []);
  const now = useMemo(() => Date.now(), [q]);
  const results = useMemo(() => searchListings(all, occurrences, q, new Date(now)), [all, occurrences, q, now]);
  const intent = useMemo(() => parseSearchIntent(q, now), [q, now]);
  const bestLists = useMemo(() => bestForQuery(q).map(c => ({ to: bestPath(c), label: bestLabel(c), note: bestNote(c) })), [q]);
  // A cited Best of Calgary list beats the "best …" card; the card covers everything else.
  const best = useMemo(() => intent.best && !bestLists.length
    ? { picks: bestPicks(all, occurrences, intent.best.thing, new Date(now)), service: serviceFor(intent.best.thing) }
    : undefined, [intent.best, bestLists.length, all, occurrences, now]);
  // "Best pho" counts as answered only when we list one, so Search demand still shows what to add.
  const safety = useMemo(() => {
    const topics = safetyForQuery(q);
    if (!topics.length && !NEWS_WORDS.test(q)) return undefined;
    const slugs = new Set(topics.map(t => t.slug));
    const where = intent.communities[0]?.community.name;
    const onTopic = slugs.size ? NEWS.items.filter(h => h.topics.some(s => slugs.has(s))) : NEWS.items;
    const local = where ? onTopic.filter(h => h.community === where) : [];
    return {
      topics: topics.map(t => ({ to: safetyPath(t), label: `${t.label} in Calgary`, note: 'Recent headlines, what to do and who to call' })),
      headlines: (local.length ? local : onTopic).slice(0, 4),
    };
  }, [q, intent]);
  const answers = q ? answerCount(intent) + (best?.picks.length ? 1 : 0) : 0;
  const resultCount = results.total + answers + bestLists.length + (safety?.topics.length ?? 0);
  const place = intent.communities[0]?.community;
  const nearby = useMemo(() => {
    if (results.total || !place || place.quadrant === 'Centre') return undefined;
    const items = nearbyListings(all, occurrences, place.quadrant, new Date(now));
    return items.length ? { title: <>Near {place.name}, <span>in the {place.quadrant}.</span></>, items } : undefined;
  }, [results.total, place, all, occurrences, now]);

  // Record what people look for (anonymously), after they stop typing.
  useEffect(() => {
    if (!q) return;
    const t = window.setTimeout(() => recordSearch(q, resultCount), 1200);
    return () => clearTimeout(t);
  }, [q, resultCount]);

  const suggest = useCallback((typed: string): Suggestion[] => {
    const text = normalizeWords(typed).join(' ');
    if (text.length < 2) return [];
    const out: Suggestion[] = [];
    const seen = new Set<string>();
    for (const { label, key, c } of COMMUNITY_KEYS) {
      if (out.length >= 3) break;
      if (!(key.startsWith(text) || key.split(' ').some(w => w.startsWith(text))) || seen.has(key)) continue;
      seen.add(key);
      // An alias ("Kensington") shows as typed, with the official community beside it.
      const where = label === c.name ? c.quadrant : `${c.name}, ${c.quadrant}`;
      out.push({ label, note: c.quadrant === 'Centre' && label === c.name ? 'Community' : `Community · ${where}`, to: `/search?q=${encodeURIComponent(label)}` });
    }
    for (const c of BEST_CATEGORIES) {
      if (out.length >= 5) break;
      if (c.keywords.some(k => normalizeWords(k).join(' ').startsWith(text)) || normalizeWords(bestLabel(c)).join(' ').startsWith(text)) out.push({ label: bestLabel(c), note: 'Best of Calgary', to: bestPath(c) });
    }
    for (const t of SAFETY_TOPICS) {
      if (out.length >= 5) break;
      if ([t.label, ...t.keywords].some(k => normalizeWords(k).join(' ').startsWith(text))) out.push({ label: `${t.label} in Calgary`, note: 'Safety news', to: safetyPath(t) });
    }
    for (const s of SHORTCUTS) if (normalizeWords(s.label).join(' ').startsWith(text) && out.length < 5) out.push(s);
    // Listings whose title or place starts a word with what's typed, one per title.
    const last = text.split(' ').at(-1) ?? '';
    for (const e of Object.values(searchListings(all, occurrences, typed).groups).flat()) {
      if (!e || out.length >= 7) break;
      const title = normalizeWords(e.title).join(' ');
      if (seen.has(title) || !normalizeWords(`${e.title} ${e.neighbourhood ?? ''}`).some(w => w.startsWith(last))) continue;
      seen.add(title);
      out.push({ label: e.title, note: KIND[e.kind], to: entityPath(e) });
    }
    return out;
  }, [all, occurrences]);

  return (
    <SiteLayout>
      <SearchBoard key={q} q={q} best={best} bestLists={bestLists} safety={safety} intent={intent} now={now} groups={results.groups as Record<string, typeof all[number][]>}
        listingCount={results.total} resultCount={resultCount} answers={answers}
        partial={results.partial} didYouMean={results.didYouMean} suggest={suggest} nearby={nearby} />
    </SiteLayout>
  );
}
