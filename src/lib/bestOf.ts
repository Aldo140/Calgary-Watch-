import { BEST_CATEGORIES, BEST_SOURCES, type BestCategory, type BestPlace, type BestSource } from '../content/bestOf';

export const BEST_PATH = '/best';
export const bestPath = (c: Pick<BestCategory, 'slug'>) => `${BEST_PATH}/${c.slug}`;

// Same folding as searchIntent's normalizeWords, kept here so the SEO config
// that imports this file doesn't pull in the community tables.
const normalizeWords = (q: string) => q.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-CA')
  .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

const SOURCES = new Map(BEST_SOURCES.map(s => [s.id, s]));

export function sourceOf(id: string): BestSource | undefined {
  return SOURCES.get(id);
}

export function bestCategory(slug: string | undefined): BestCategory | undefined {
  return slug ? BEST_CATEGORIES.find(c => c.slug === slug) : undefined;
}

/** Distinct publishers that name a place. Two lists from one outlet count once. */
export function publishersOf(place: BestPlace): string[] {
  return [...new Set(place.namedBy.map(id => SOURCES.get(id)?.publisher).filter((p): p is string => !!p))];
}

const collator = new Intl.Collator('en-CA', { sensitivity: 'base', ignorePunctuation: true });
const sortName = (name: string) => name.replace(/^the\s+/i, '');

/**
 * The published order, and the only one: owner-verified first, then the
 * number of independent publishers that name the place, then A–Z (ignoring a
 * leading "The"). Nothing here can be bought, and nothing is our own opinion.
 */
export function rankPlaces(places: readonly BestPlace[]): BestPlace[] {
  return [...places].sort((a, b) =>
    Number(!!b.verified) - Number(!!a.verified)
    || publishersOf(b).length - publishersOf(a).length
    || collator.compare(sortName(a.name), sortName(b.name)));
}

/** True when a list's order says something (some place is named more than others). */
export function isRanked(c: BestCategory): boolean {
  return new Set(c.places.map(p => publishersOf(p).length)).size > 1;
}

/** Every source a category cites, recommendations first, newest first. */
export function sourcesFor(c: BestCategory): BestSource[] {
  const ids = new Set(c.places.flatMap(p => [...p.namedBy, ...p.facts.filter(f => !f.self).map(f => f.source)]));
  return BEST_SOURCES.filter(s => ids.has(s.id)).sort((a, b) => b.published.localeCompare(a.published));
}

export function directionsUrl(place: BestPlace): string {
  const where = place.address ?? place.area ?? '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${where} Calgary AB`.replace(/\s+/g, ' ').trim())}`;
}

const FILLER = new Set(['best', 'of', 'in', 'the', 'calgary', 'yyc', 'top', 'lists', 'list']);

/**
 * The lists a search is asking for: "pho", "best pizza near me", "junk
 * removal". Keywords are matched as whole word runs, so "phone" never finds pho.
 */
export function bestForQuery(q: string): BestCategory[] {
  const words = normalizeWords(q);
  if (!words.length) return [];
  if (words.includes('best') && words.every(w => FILLER.has(w))) return BEST_CATEGORIES;
  const text = ` ${words.join(' ')} `;
  return BEST_CATEGORIES.filter(c => c.keywords.some(k => text.includes(` ${normalizeWords(k).join(' ')} `)));
}

/** schema.org ItemList for a category page, in the order the page shows. */
export function bestItemListJsonLd(c: BestCategory, origin: string): object {
  const places = rankPlaces(c.places);
  return {
    '@type': 'ItemList',
    name: c.kind === 'food' ? `Best ${c.noun} in Calgary` : `${c.label} in Calgary`,
    url: `${origin}${bestPath(c)}`,
    numberOfItems: places.length,
    itemListOrder: isRanked(c) ? 'https://schema.org/ItemListOrderDescending' : 'https://schema.org/ItemListUnordered',
    itemListElement: places.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': c.schemaType,
        name: p.name,
        ...(c.cuisine ? { servesCuisine: c.cuisine } : {}),
        ...(p.website ? { url: p.website } : {}),
        ...(p.address
          ? { address: { '@type': 'PostalAddress', streetAddress: p.address, addressLocality: 'Calgary', addressRegion: 'AB', addressCountry: 'CA' } }
          : { areaServed: { '@type': 'City', name: 'Calgary' } }),
      },
    })),
  };
}

/** The index page's list of lists. */
export function bestIndexJsonLd(origin: string): object {
  return {
    '@type': 'ItemList',
    name: 'Best of Calgary',
    numberOfItems: BEST_CATEGORIES.length,
    itemListElement: BEST_CATEGORIES.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.seoTitle.split(' | ')[0], url: `${origin}${bestPath(c)}` })),
  };
}

export function formatPublished(published: string): string {
  const [y, m, d] = published.split('-').map(Number);
  if (!m) return String(y);
  const month = new Date(Date.UTC(y, m - 1, d || 1)).toLocaleString('en-CA', { month: 'short', timeZone: 'UTC' });
  return d ? `${month} ${d}, ${y}` : `${month} ${y}`;
}
