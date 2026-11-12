/**
 * Search and AI answers for the Pick desks (docs/cw-picks.md). A desk is the
 * page a search for "best plumber Calgary" or "emergency electrician Calgary"
 * should land on, so it answers first: who to call, who says they answer at
 * night, what to ask, when Calgary books it. Every line here is built from the
 * desk's own data and shown on the page itself (the FAQ section), never
 * crawler-only copy, and nothing is claimed that a company's site doesn't say.
 */
import { DESK_COMPANIES } from '../content/pickDesks';
import { askFor, pickDeskPath, proofsFor, type Shelf } from './cwPicks';
import type { LocalService } from '../data/localServices';

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** What people type, as a plural noun for titles. */
const SEO_NOUN: Partial<Record<string, string>> = {
  heating: 'Furnace Repair & HVAC Companies',
  roofing: 'Roofers',
  windows: 'Window Cleaners',
  junk: 'Junk Removal Companies',
  snow: 'Snow Removal Companies',
  yard: 'Lawn Care Companies',
  pest: 'Pest Control Companies',
  cleaning: 'House Cleaners',
  appliances: 'Appliance Repair Companies',
  locksmith: 'Locksmiths',
  tires: 'Tire Shops',
  glass: 'Auto Glass Shops',
  fencing: 'Fence & Deck Builders',
};
export const seoNoun = (s: LocalService) => SEO_NOUN[s.id] ?? s.label;
/** The same noun for a sentence: "furnace repair & HVAC companies". */
export const seoNounInline = (s: LocalService) => seoNoun(s).toLowerCase().replace(/\bhvac\b/g, 'HVAC');

/** One company, in a sentence: "a plumber", "a furnace company". */
const ONE: Partial<Record<string, string>> = {
  plumbing: 'plumber', electrical: 'electrician', heating: 'furnace company', roofing: 'roofer', windows: 'window cleaner',
  junk: 'junk hauler', snow: 'snow removal company', yard: 'lawn care company', pest: 'pest control company', cleaning: 'house cleaner',
  appliances: 'appliance repair company', locksmith: 'locksmith', tires: 'tire shop', glass: 'auto glass shop', fencing: 'fence builder', mechanic: 'mechanic',
};
export const oneOf = (s: LocalService) => ONE[s.id] ?? s.trades[0];
const an = (w: string) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;

/** schema.org type for a company on this desk. */
const SCHEMA: Partial<Record<string, string>> = {
  plumbing: 'Plumber', electrical: 'Electrician', heating: 'HVACBusiness', roofing: 'RoofingContractor',
  locksmith: 'Locksmith', mechanic: 'AutoRepair', tires: 'AutoRepair', glass: 'AutoRepair', cleaning: 'HomeAndConstructionBusiness',
  handyman: 'HomeAndConstructionBusiness', fencing: 'HomeAndConstructionBusiness', windows: 'HomeAndConstructionBusiness', pest: 'HomeAndConstructionBusiness',
};
export const schemaTypeFor = (s: LocalService) => SCHEMA[s.id] ?? 'LocalBusiness';

/**
 * Indexed when it has at least three companies and isn't already a Best of
 * Calgary list (that page ranks for the service; one page per intent).
 */
export const MIN_INDEXED = 3;
export const deskIndexable = (shelf: Shelf) => shelf.contenders.length >= MIN_INDEXED && !shelf.service.best;

/** The day the desk's companies were last read off their sites. */
export const deskUpdated = (shelf: Shelf) => DESK_COMPANIES[shelf.service.id]?.checked;

const list = (names: string[]) => names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
const sortNames = (shelf: Shelf) => shelf.contenders.map(c => c.name);
export const alwaysOn = (shelf: Shelf) => shelf.contenders.filter(c => proofsFor(c).some(p => p.id === 'always-on'));
const oldest = (shelf: Shelf) => shelf.contenders
  .map(c => ({ c, y: Number(proofsFor(c).find(p => p.id === 'since')?.label.slice(-4)) }))
  .filter(x => x.y > 1800).sort((a, b) => a.y - b.y)[0];

export function deskTitle(shelf: Shelf, year: number): string {
  return `Best ${seoNoun(shelf.service)} in Calgary (${year}): ${shelf.contenders.length} Local Companies Checked | CalgaryWatch`;
}

export function deskDescription(shelf: Shelf): string {
  const n = shelf.contenders.length;
  const night = alwaysOn(shelf).length;
  const first = sortNames(shelf).slice(0, 3);
  return `${n} Calgary ${seoNounInline(shelf.service)} compared, including ${list(first)}.${night ? ` ${night} say they answer 24/7.` : ''} What to ask before you book, when Calgary is busiest, one-tap calls. Never paid for.`;
}

export interface DeskQa { q: string; a: string }

/** The questions the desk answers, shown on the page and in FAQPage JSON-LD. */
export function deskFaq(shelf: Shelf): DeskQa[] {
  const s = shelf.service;
  const names = sortNames(shelf);
  const out: DeskQa[] = [];
  if (names.length) {
    const old = oldest(shelf);
    out.push({
      q: `Who should I call for ${an(oneOf(s))} in Calgary?`,
      a: `CalgaryWatch lists ${names.length} local ${names.length === 1 ? oneOf(s) : seoNounInline(s)}, A–Z: ${list(names)}. Each one is checked against its own website, with its phone number one tap away.${old ? ` The longest-running, by its own account, is ${old.c.name} (since ${old.y}).` : ''} ${shelf.live ? `${shelf.live.contender.name} is the CalgaryWatch Pick, after seven checks we did ourselves.` : 'No company has passed all seven CalgaryWatch Pick checks yet.'} Nobody pays to be listed.`,
    });
  }
  const night = alwaysOn(shelf);
  if (night.length) {
    out.push({
      q: `Which Calgary ${seoNounInline(s)} answer 24/7 or after hours?`,
      a: `${list(night.map(c => c.name))} ${night.length === 1 ? 'says' : 'say'} on ${night.length === 1 ? 'its' : 'their'} own ${night.length === 1 ? 'site' : 'sites'} that ${night.length === 1 ? 'it offers' : 'they offer'} 24/7 or emergency service. Ask what the after-hours call-out costs before they drive out.`,
    });
  }
  out.push({ q: `What should I ask ${an(oneOf(s))} before I book?`, a: askFor(s).map((x, i) => `${i + 1}. ${x}`).join(' ') });
  out.push({
    q: `When are ${seoNounInline(s)} busiest in Calgary?`,
    a: `${s.peak.length ? `Calgary books ${seoNounInline(s)} most in ${list([...s.peak].sort((a, b) => a - b).map(m => MONTH[m - 1]))}.` : 'Demand is steady all year in Calgary.'} ${s.tip}`,
  });
  out.push({
    q: 'How does a company become the CalgaryWatch Pick?',
    a: 'One company per service, after seven checks we do ourselves and date: trade licence, insurance, WCB clearance, locally owned, 50+ public reviews at 4.5 or better, a mystery call, and a signed pledge. Neighbours who hire through CalgaryWatch keep it honest, and it is re-vetted every six months. It can’t be bought.',
  });
  return out;
}

/** ItemList of the desk's companies plus FAQPage, for buildPageJsonLd. */
export function deskJsonLd(shelf: Shelf, origin: string): Record<string, unknown> {
  const type = schemaTypeFor(shelf.service);
  return {
    about: { '@type': 'Service', serviceType: shelf.service.trades[0], areaServed: { '@type': 'City', name: 'Calgary', containedInPlace: { '@type': 'AdministrativeArea', name: 'Alberta' } } },
    mainEntity: {
      '@type': 'ItemList',
      name: `${shelf.service.label} in Calgary`,
      url: `${origin}${pickDeskPath(shelf.service.id)}`,
      numberOfItems: shelf.contenders.length,
      itemListOrder: 'https://schema.org/ItemListUnordered',
      itemListElement: shelf.contenders.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': type,
          name: c.name,
          ...(c.website ? { url: c.website, sameAs: c.website } : {}),
          ...(c.phone ? { telephone: `+1-${c.phone}` } : {}),
          ...(c.fact ? { description: c.fact.text } : {}),
          areaServed: { '@type': 'City', name: 'Calgary' },
        },
      })),
    },
    hasPart: {
      '@type': 'FAQPage',
      mainEntity: deskFaq(shelf).map(x => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
    },
  };
}
