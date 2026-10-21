import { SAFETY_FAQS, SAFETY_PATH, SAFETY_TOPICS, type SafetyFaq, type SafetyTopic } from '../content/safetyTopics';

/**
 * Lookups shared by the /safety pages, SEO config and search. Kept free of the
 * news file and the community tables so seo.ts can import it cheaply.
 */

export const safetyPath = (t: Pick<SafetyTopic, 'slug'>) => `${SAFETY_PATH}/${t.slug}`;

export function safetyTopic(slug: string | undefined): SafetyTopic | undefined {
  return slug ? SAFETY_TOPICS.find(t => t.slug === slug) : undefined;
}

// Same folding as searchIntent's normalizeWords.
const fold = (q: string) => q.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-CA')
  .replace(/&/g, ' and ').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The topics a search is asking about: "calgary car theft", "shooting
 * yesterday", "B&E Bowness". Keywords match as whole words only.
 */
export function safetyForQuery(q: string): SafetyTopic[] {
  const text = ` ${fold(q)} `;
  if (!text.trim()) return [];
  const hits = SAFETY_TOPICS.filter(t => [t.label, ...t.keywords].some(k => text.includes(` ${fold(k)} `)));
  return hits.filter(t => !t.notWith?.some(o => hits.some(h => h.slug === o)));
}

function faqJsonLd(faqs: readonly SafetyFaq[]) {
  return faqs.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } }));
}

/** mainEntity and about for a /safety route. Static copy only, so SeoManager and the prerender agree. */
export function safetyJsonLd(pathname: string): { about: string[]; mainEntity: object[] } | undefined {
  if (pathname === SAFETY_PATH) {
    return { about: ['Calgary crime news', 'Calgary police news', 'Calgary public safety'], mainEntity: faqJsonLd(SAFETY_FAQS) };
  }
  const t = pathname.startsWith(`${SAFETY_PATH}/`) ? safetyTopic(pathname.split('/')[2]) : undefined;
  if (!t) return undefined;
  return { about: [`Calgary ${t.noun}`, `${t.label} in Calgary`, 'Calgary Police Service'], mainEntity: faqJsonLd([...t.faqs, ...SAFETY_FAQS]) };
}
