/**
 * Pure HTML tag-rewriting used by the prerender step.
 *
 * Kept separate from the file I/O in prerender.ts so the interesting logic is
 * unit-testable without touching the filesystem or running a build.
 */

import {
  ROBOTS_INDEX,
  ROBOTS_NOINDEX,
  buildPageJsonLd,
  getSeoConfig,
  pageUrlFor,
} from '../../src/lib/seo.js';
import { discoveryRepository } from '../../src/data/discovery';
import { DISCOVERY_SECTIONS, entityPath } from '../../src/lib/discovery';
import {
  GUIDE_COMPARISON,
  GUIDE_FAQS,
  GUIDE_PATH,
  GUIDE_SOURCES,
  GUIDE_UPDATED,
} from '../../src/content/neighbourhoodWatchGuide.js';
import {
  AIRDRIE_GUIDE_FAQS,
  AIRDRIE_GUIDE_PATH,
  AIRDRIE_GUIDE_SOURCES,
  AIRDRIE_GUIDE_UPDATED,
  AIRDRIE_MAP_COMPARISON,
} from '../../src/content/airdrieCrimeMapGuide.js';
import { COMMUNITY_FAQS } from '../../src/content/communityWatch.js';
import {
  COVERAGE_BROWSER_SOURCES,
  COVERAGE_FAQS,
  COVERAGE_SERVER_SOURCES,
  coverageSourceLink,
  type CoverageSource,
} from '../../src/content/coverage.js';
import { weekAgenda } from '../../src/lib/discoveryCalendar.js';
import type { DiscoveryEntity } from '../../src/types/discovery';

/**
 * Where a route's static HTML is written, relative to dist/.
 *
 * Flat `<route>.html` rather than `<route>/index.html` on purpose: a directory
 * makes Firebase Hosting 301-redirect /map to /map/, which contradicts the
 * canonical URL and the sitemap. With `cleanUrls: true` Firebase serves
 * map.html at /map with no redirect, and GitHub Pages resolves extensionless
 * URLs to the matching .html file natively.
 */
export function outputPathForRoute(route: string): string {
  if (route === '/') return 'index.html';
  return `${route.replace(/^\//, '').replace(/\/$/, '')}.html`;
}

/** Escape a string for safe use inside a double-quoted HTML attribute. */
export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape text placed inside <title>. */
export function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Prevent a JSON-LD payload from terminating its own <script> block.
 * `</script>` inside JSON would end the element early and break the page.
 */
export function escapeJsonLd(json: string): string {
  return json.replace(/</g, '\\u003c');
}

/**
 * Replace the content of an existing meta tag, or append one before </head>.
 *
 * `[^>]*` spans newlines, so this handles the multi-line meta tags already in
 * index.html (where name and content sit on separate lines).
 */
export function upsertMeta(
  html: string,
  attr: 'name' | 'property',
  key: string,
  content: string,
): string {
  const tag = `<meta ${attr}="${key}" content="${escapeAttr(content)}" />`;
  const existing = new RegExp(`<meta[^>]*${attr}=["']${key}["'][^>]*>`, 'i');

  if (existing.test(html)) return html.replace(existing, tag);
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

/** Replace <link rel="canonical">, or append one. */
export function upsertCanonical(html: string, href: string): string {
  const tag = `<link rel="canonical" href="${escapeAttr(href)}" />`;
  const existing = /<link[^>]*rel=["']canonical["'][^>]*>/i;

  if (existing.test(html)) return html.replace(existing, tag);
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

/** Keep language alternates on the same route as its canonical. */
export function upsertAlternate(
  html: string,
  hreflang: 'en-CA' | 'x-default',
  href: string,
): string {
  const tag = `<link rel="alternate" hreflang="${hreflang}" href="${escapeAttr(href)}" />`;
  const existing = new RegExp(
    `<link[^>]*rel=["']alternate["'][^>]*hreflang=["']${hreflang}["'][^>]*>`,
    'i',
  );
  if (existing.test(html)) return html.replace(existing, tag);
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

/** Replace the <title> element's text. */
export function upsertTitle(html: string, title: string): string {
  const tag = `<title>${escapeText(title)}</title>`;
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(/<title>[\s\S]*?<\/title>/i, tag);
  }
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function staticLink(href: string, label: string): string {
  return `<a href="${escapeAttr(href)}">${escapeText(label)}</a>`;
}

function faqList(faqs: readonly { question: string; answer: string }[]): string {
  return faqs.map((faq) => `<details><summary>${escapeText(faq.question)}</summary><p>${escapeText(faq.answer)}</p></details>`).join('');
}

function sourceTable(items: readonly CoverageSource[]): string {
  const rows = items.map((source) => {
    const href = coverageSourceLink(source);
    return `<tr><td>${href ? staticLink(href, source.name) : escapeText(source.name)}</td><td>${escapeText(source.covers)}</td><td>${escapeText(source.often)}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Source</th><th>What it covers</th><th>How often</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const calgaryDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
const calgaryDateTime = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dayLabel = (date: string) => calgaryDay.format(new Date(`${date}T12:00:00Z`));

/** The homepage week planner, as plain lists: the same days and listings the page shows. */
function weekPlannerHtml(now: Date): string {
  const days = weekAgenda(discoveryRepository.list(), discoveryRepository.occurrences(), 7, now).filter((day) => day.items.length);
  if (!days.length) return '';
  const lists = days.map((day) => {
    const items = day.items.slice(0, 15).map((item) => `<li>${staticLink(item.to, item.title)}${item.place ? ` · ${escapeText(item.place)}` : ''}</li>`).join('');
    return `<h3>${escapeText(dayLabel(day.date))}</h3><ul>${items}</ul>`;
  }).join('');
  return `<section><h2>This week in Calgary</h2>${lists}</section>`;
}

/** A hub's listings, linked, with the line each card shows. */
function hubListingsHtml(kind: DiscoveryEntity['kind'], label: string, now: Date): string {
  const occurrences = discoveryRepository.occurrences();
  const nextMarketDate = (id: string) => occurrences.filter((o) => o.marketId === id && !o.cancelled && Date.parse(o.end) > now.getTime()).map((o) => o.start).sort()[0];
  const entities = discoveryRepository.list()
    .filter((e) => e.kind === kind && !(e.kind === 'event' && Date.parse(e.end) < now.getTime()))
    .sort((a, b) => (a.kind === 'event' && b.kind === 'event' ? Date.parse(a.start) - Date.parse(b.start) : a.title.localeCompare(b.title)));
  if (!entities.length) return '';
  const items = entities.map((e) => {
    const when = e.kind === 'event' ? e.start : e.kind === 'market' ? nextMarketDate(e.id) : undefined;
    const meta = [when ? calgaryDateTime.format(new Date(when)) : '', 'venue' in e && e.venue ? e.venue : e.neighbourhood ?? ''].filter(Boolean).join(' · ');
    return `<li>${staticLink(entityPath(e), e.title)}${meta ? ` — ${escapeText(meta)}` : ''}<br />${escapeText(e.summary)}</li>`;
  }).join('');
  return `<section><h2>${escapeText(label)} in Calgary</h2><ul>${items}</ul></section>`;
}

/** Extra sections for routes whose page shows more than a heading and a paragraph. */
function routeSections(pathname: string, now: Date): string {
  const hub = DISCOVERY_SECTIONS.find((section) => section.path === pathname);
  if (hub) return hubListingsHtml(hub.kind, hub.label, now);
  switch (pathname) {
    case '/':
      return weekPlannerHtml(now);
    case '/community':
      return `<section><h2>Questions people ask</h2>${faqList(COMMUNITY_FAQS)}</section>`;
    case '/coverage':
      return `<section><h2>Official feeds collected by our server</h2>${sourceTable(COVERAGE_SERVER_SOURCES)}</section>
        <section><h2>Layers loaded when you open the map</h2>${sourceTable(COVERAGE_BROWSER_SOURCES)}</section>
        <section><h2>Questions about coverage</h2>${faqList(COVERAGE_FAQS.map((f) => ({ question: f.q, answer: f.a })))}</section>`;
    case '/map': {
      const seen = new Set<string>();
      const layers = [...COVERAGE_SERVER_SOURCES, ...COVERAGE_BROWSER_SOURCES].filter((source) => !seen.has(source.name) && seen.add(source.name));
      return `<section><h2>What’s on the Calgary crime map</h2><ul>${layers.map((source) => `<li><strong>${escapeText(source.name)}</strong>: ${escapeText(source.covers)}</li>`).join('')}</ul>
        <p>Neighbour reports are posted by signed-in Calgarians and show up right away. Neighbours can mark a report as seen, still happening or resolved, and it comes off the map after 5 days.</p>
        <p>Call 911 for an emergency or a crime in progress. For Calgary police matters that are not in progress, call 403-266-1234.</p></section>`;
    }
    case '/about':
      return `<section><h2>What Calgary Watch does</h2><ul><li>Community-powered incident reporting</li><li>Real-time map updates and context</li><li>Verified data from official sources</li><li>Privacy-first, anonymous reporting option</li></ul>
        <p>Calgary Police, the City of Calgary, Environment Canada, ENMAX and Alberta Emergency Alerts each publish a real piece of what is happening in the city. Calgary Watch puts them in one view next to what neighbours report, with the source and time on every pin.</p></section>`;
    default:
      return '';
  }
}

/**
 * Meaningful first-response HTML for crawlers and browsers before React boots.
 * The copy mirrors content that is visible in the corresponding React page;
 * it is not crawler-only content or a separate keyword variant.
 */
export function buildStaticRouteBody(pathname: string, now = new Date()): string {
  if (pathname === AIRDRIE_GUIDE_PATH) {
    const comparisons = AIRDRIE_MAP_COMPARISON.map((row) => `
      <tr>
        <td>${escapeText(row.need)}</td>
        <td>${escapeText(row.source)}</td>
        <td>${staticLink(row.action, row.actionLabel)}</td>
      </tr>`).join('');
    const faqs = AIRDRIE_GUIDE_FAQS.map((faq) => `
      <details>
        <summary>${escapeText(faq.question)}</summary>
        <p>${escapeText(faq.answer)}</p>
      </details>`).join('');
    const sources = AIRDRIE_GUIDE_SOURCES.map((source) =>
      `<li>${staticLink(source.url, source.name)}</li>`,
    ).join('');

    return `<main data-prerendered-route="${escapeAttr(pathname)}">
      <article>
        <header>
          <p>Airdrie community safety guide · Reviewed ${escapeText(AIRDRIE_GUIDE_UPDATED)}</p>
          <h1>Airdrie crime maps: know which map you’re reading.</h1>
          <p>Check recent community reports around Airdrie, compare them with the City’s official RCMP-reported crime map, and use the right reporting channel when something needs action.</p>
          <p>${staticLink('/map', 'View Airdrie-area reports')} · ${staticLink(AIRDRIE_GUIDE_SOURCES[0].url, 'Official Airdrie crime map')}</p>
        </header>
        <section>
          <h2>Two maps answer different questions.</h2>
          <p>Calgary Watch helps with recent local awareness. Its markers can come from community submissions or attributed public sources, so each one should be read with its time and source.</p>
          <p>The City of Airdrie’s crime map is the official starting point for crime reported to Airdrie RCMP. Neither map is a public dispatch feed, and neither should be used to follow officers or confirm that a specific response is underway.</p>
        </section>
        <section>
          <h2>Start with the source that matches the need.</h2>
          <table><thead><tr><th>What you need</th><th>Best starting point</th><th>Action</th></tr></thead><tbody>${comparisons}</tbody></table>
        </section>
        <section>
          <h2>Read an incident before drawing a conclusion.</h2>
          <p>Start with the timestamp and then check whether the item was submitted by a community member or attributed to a public source. Marker counts are not crime rates: they depend on the selected time window, available sources, and what people choose to report.</p>
        </section>
        <section>
          <h2>Report through the right channel first.</h2>
          <p>Call 911 for immediate danger or a crime in progress. For an Airdrie police matter that is not in progress, call RCMP non-emergency at 403-945-7267. Calgary Watch posts are not police reports.</p>
        </section>
        <section><h2>Frequently asked questions</h2>${faqs}</section>
        <section><h2>Official Airdrie references</h2><ul>${sources}</ul></section>
      </article>
    </main>`;
  }

  if (pathname === GUIDE_PATH) {
    const comparisons = GUIDE_COMPARISON.map((row) => `
      <tr>
        <td>${escapeText(row.need)}</td>
        <td>${escapeText(row.source)}</td>
        <td>${staticLink(row.action, row.actionLabel)}</td>
      </tr>`).join('');
    const faqs = GUIDE_FAQS.map((faq) => `
      <details>
        <summary>${escapeText(faq.question)}</summary>
        <p>${escapeText(faq.answer)}</p>
      </details>`).join('');
    const sources = GUIDE_SOURCES.map((source) =>
      `<li>${staticLink(source.url, source.name)}</li>`,
    ).join('');

    return `<main data-prerendered-route="${escapeAttr(pathname)}">
      <article>
        <header>
          <p>Independent community safety guide · Reviewed ${escapeText(GUIDE_UPDATED)}</p>
          <h1>Calgary crime map and neighbourhood watch, without the guesswork.</h1>
          <p>Check recent Calgary reports near you, understand where the information came from, and choose the right official channel when something needs action.</p>
          <p>${staticLink('/map', 'Check incidents near me')} · ${staticLink('/map?report=true', 'Sign in to report')}</p>
        </header>
        <section>
          <h2>“Current police activity near me” is not one kind of data.</h2>
          <p>People use that search to mean different things: a siren nearby, a road closed after a collision, a community report, or official crime statistics. No single public map contains every live police call or officer location.</p>
          <p>Calgary Watch shows recent community observations and selected public-source incidents. Every marker should be read with its timestamp and source. It is useful for awareness, but it is not a dispatch feed and cannot confirm that police attended an event.</p>
        </section>
        <section>
          <h2>Choose the source that matches the question.</h2>
          <table><thead><tr><th>What you need</th><th>Best starting point</th><th>Action</th></tr></thead><tbody>${comparisons}</tbody></table>
        </section>
        <section>
          <h2>Block Watch Calgary and Calgary Watch are different.</h2>
          <p>Block Watch generally means neighbours organizing on their own block to reduce opportunities for crime, share prevention information, and report suspicious activity through the appropriate channels.</p>
          <p>Calgary Watch is an independent public map. It is not a Block Watch chapter and is not operated by Calgary Police Service.</p>
        </section>
        <section>
          <h2>Report through the right channel first.</h2>
          <p>Call 911 for an emergency or crime in progress. For Calgary police matters not in progress, call 403-266-1234. Posting to Calgary Watch does not create a police report.</p>
        </section>
        <section><h2>Frequently asked questions</h2>${faqs}</section>
        <section><h2>Official references</h2><ul>${sources}</ul></section>
      </article>
    </main>`;
  }

  const summaries: Record<string, { heading: string; copy: string; links: [string, string][] }> = {
    '/community': {
      heading: 'Calgary crime watch: crime and safety reports from your neighbours, on one map.',
      copy: 'CalgaryWatch Community Watch is a free live crime and safety map for Calgary. Neighbours post what they see, and we add Calgary Police news releases, City of Calgary 311 and traffic data, weather and emergency alerts and power outages. Every pin shows its source. It works alongside Block Watch, neighbourhood watch groups, Facebook groups and Nextdoor. In an emergency call 911.',
      links: [['/map', 'Open the Calgary crime map'], [GUIDE_PATH, 'Start a neighbourhood watch'], ['/coverage', 'Every source we use'], [AIRDRIE_GUIDE_PATH, 'Airdrie crime map guide']],
    },
    '/': {
      heading: 'What’s happening in Calgary.',
      copy: 'CalgaryWatch is Calgary’s crime watch: a live Calgary crime map and public safety map, plus events, markets and local places. Community Watch puts crime and safety reports from neighbours next to Calgary Police news releases, City data, weather and outages. The week planner lists real events and markets by day.',
      links: [['/community', 'Calgary crime watch'], ['/map', 'Live safety map'], ['/events', 'Events'], ['/markets', 'Markets'], ['/local', 'Local'], ['/neighbourhoods', 'Neighbourhoods']],
    },
    '/events': {
      heading: 'Events in Calgary this week.',
      copy: 'What’s on in Calgary, from the organizers’ own listings: theatre, concerts, talks, exhibitions, festivals and family events from Theatre Calgary, Wordfest, Alberta Ballet, the Scotiabank Saddledome, Heritage Park, the University of Calgary, Mount Royal University and more. Every listing links back to the organizer and is checked again every day, so cancelled and past events drop off.',
      links: [['/events/today', 'Today in Calgary'], ['/events/this-weekend', 'This weekend in Calgary'], ['/date-night', 'Date night ideas'], ['/markets', 'Markets']],
    },
    '/markets': {
      heading: 'Calgary farmers’ markets and makers’ markets.',
      copy: 'Calgary’s farmers’ and makers’ markets with their next real dates and hours: Calgary Farmers’ Market South and West, Crossroads Market, Hillhurst Sunnyside, Bridgeland-Riverside, Farmers & Makers at cSPACE, Dalhousie, the Calgary Winter Market, Market Collective and the Spruce Meadows International Christmas Market. Dates come from each market’s own site.',
      links: [['/markets/this-weekend', 'Markets this weekend'], ['/guides', 'Calgary guides'], ['/events', 'Events']],
    },
    '/guides': {
      heading: 'Calgary guides.',
      copy: 'Local guides to Calgary: a day along the Bow River from Harvie Passage to the Peace Bridge, Calgary’s farmers’ markets and artisan food halls, and the historic laneways and craft coffee of Inglewood and Ramsay. Each guide links to the places and official sources it’s built from.',
      links: [['/neighbourhoods', 'Neighbourhood guides'], ['/markets', 'Markets'], ['/date-night', 'Date night ideas']],
    },
    '/neighbourhoods': {
      heading: 'Calgary neighbourhood guides.',
      copy: 'Guides to Calgary neighbourhoods and what’s on in them: Inglewood, Kensington, the Beltline, Bridgeland-Riverside, Marda Loop, Bowness and Ramsay, quadrant by quadrant. Each one draws on its community association or business improvement area.',
      links: [['/events', 'Events'], ['/guides', 'Calgary guides'], ['/community', 'Calgary crime watch']],
    },
    '/date-night': {
      heading: 'Date night in Calgary.',
      copy: 'Date night ideas in Calgary, from the organizers’ own listings: Theatre Calgary’s Little Shop of Horrors, Wordfest’s Literary Death Match, the 18+ Friday evenings at the Spruce Meadows International Christmas Market, Alberta Ballet’s Nutcracker with the Calgary Philharmonic, and concerts at the Saddledome. Plus arts and nights out on this week and free ideas like the Bow River walk, Inglewood and Kensington. Picks are CalgaryWatch’s own and never paid for.',
      links: [['/events', 'Events this week'], ['/events/this-weekend', 'This weekend in Calgary'], ['/neighbourhoods', 'Neighbourhoods'], ['/partners', 'How we pick']],
    },
    '/map': {
      heading: 'Calgary crime map with recent reports near you',
      copy: 'Explore recent community observations and attributed public-source reports across Calgary and nearby communities. Crime, traffic, weather, infrastructure and emergency markers each include a report time and source. Calgary Watch supports local awareness; it is not a police scanner, dispatch feed or officer tracker.',
      links: [[GUIDE_PATH, 'Understand Calgary crime maps and current activity'], [AIRDRIE_GUIDE_PATH, 'Compare Airdrie crime-map sources'], ['/about', 'How Calgary Watch verifies report sources']],
    },
    '/about': {
      heading: 'How Calgary Watch works',
      copy: 'Calgary Watch combines community reports with selected, attributed public-source information to support local awareness. It is independent from Calgary Police Service and is not a substitute for 911.',
      links: [['/map', 'View the live map'], [GUIDE_PATH, 'Neighbourhood watch and reporting guide']],
    },
    '/coverage': {
      heading: 'Where every pin on the Calgary safety map comes from',
      copy: 'Every source behind the CalgaryWatch map: neighbour reports, Calgary Police news releases, City of Calgary 311, traffic and water main breaks, Environment Canada and Alberta Emergency Alerts, ENMAX outages and river levels, with how often each updates. Built for Calgary.',
      links: [['/map', 'View the Calgary-area incident map'], [AIRDRIE_GUIDE_PATH, 'Read the Airdrie crime map guide'], [GUIDE_PATH, 'Read the neighbourhood watch guide']],
    },
    '/partners': {
      heading: 'How CalgaryWatch works with businesses.',
      copy: 'CalgaryWatch lists Calgary events, markets and local places for free, checked against each business’s own page, and @calgarydaily, our sister Instagram account, posts from the same listings. Our picks are never sold. Featured partner placements, when they open, will always be labelled. We email a listed business only at an address it publishes itself, and a reply of “stop” is permanent.',
      links: [['/local', 'Local places'], ['/events', 'Events'], ['/markets', 'Markets'], ['/about', 'About CalgaryWatch']],
    },
    '/privacy': {
      heading: 'Calgary Watch privacy policy',
      copy: 'Read what Calgary Watch collects, why each piece of information is needed, how long it is retained, and how to make a privacy request. Public incident reports do not expose a reporter email address.',
      links: [['/map', 'Return to the Calgary crime map'], ['/about', 'Learn how Calgary Watch works']],
    },
  };
  const summary = summaries[pathname];
  if (!summary) return '';
  const links = summary.links.map(([href, label]) => staticLink(href, label)).join(' · ');
  return `<main data-prerendered-route="${escapeAttr(pathname)}"><article><h1>${escapeText(summary.heading)}</h1><p>${escapeText(summary.copy)}</p><p>${links}</p>${routeSections(pathname, now)}</article></main>`;
}

/** Place route content inside the React mount point for the first response. */
export function upsertStaticRouteBody(html: string, pathname: string): string {
  const entity = discoveryRepository.list().find(e => entityPath(e) === pathname);
  const section = DISCOVERY_SECTIONS.find(s => pathname === s.path);
  const dated = (start: string, end: string) => `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', dateStyle:'full',timeStyle:'short' }).format(new Date(start))} to ${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', dateStyle:'full',timeStyle:'short' }).format(new Date(end))} (Calgary time)`;
  const sourceLinks = entity?.sources.map(s=>staticLink(s.url,s.name)).join(' · ');
  const dates = entity?.kind === 'event' ? `<p>${escapeText(dated(entity.start,entity.end))}${entity.cancelled ? ' — Cancelled' : ''}</p>` : entity?.kind === 'market' ? `<ul>${discoveryRepository.occurrences().filter(o=>o.marketId===entity.id).map(o=>`<li>${escapeText(dated(o.start,o.end))}${o.cancelled?' — Cancelled':''}</li>`).join('')}</ul>` : '';
  const body = entity ? `<main><article><h1>${escapeText(entity.title)}</h1><p>${escapeText(entity.summary)}</p><p>${escapeText(entity.description)}</p>${'address' in entity ? `<p>${escapeText(entity.address)}</p>`:''}${dates}<p>Last checked: ${escapeText(entity.verifiedAt||entity.updatedAt)}</p><p>${sourceLinks}</p></article></main>` : section && !buildStaticRouteBody(pathname) ? `<main><h1>${escapeText(section.label)} in Calgary</h1><ul>${discoveryRepository.list().filter(e=>e.kind===section.kind).map(e=>`<li>${staticLink(entityPath(e),e.title)}</li>`).join('')}</ul></main>` : buildStaticRouteBody(pathname);
  if (!body) return html;
  return html.replace(/<div id=["']root["']>[\s\S]*?<\/div>/i, `<div id="root">${body}</div>`);
}

/**
 * Replace the per-page JSON-LD block, or append one.
 *
 * Tagged with data-ld="page-schema" so it matches the id SeoManager uses at
 * runtime — the client then updates this same element rather than adding a
 * second, conflicting one on the first client-side navigation.
 */
export function upsertJsonLd(html: string, data: object): string {
  const tag = `<script type="application/ld+json" data-ld="page-schema">${escapeJsonLd(JSON.stringify(data))}</script>`;
  const existing = /<script[^>]*data-ld=["']page-schema["'][^>]*>[\s\S]*?<\/script>/i;

  if (existing.test(html)) return html.replace(existing, tag);
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

/**
 * Produce the static HTML for one route from the built index.html shell.
 *
 * Everything here mirrors what SeoManager sets at runtime, sourced from the
 * same src/lib/seo.ts config, so a crawler that never runs JavaScript sees
 * exactly what a browser would end up with.
 */
export function renderRouteHtml(shell: string, pathname: string, origin: string): string {
  const config = getSeoConfig(pathname);
  const pageUrl = pageUrlFor(pathname, origin);

  let html = shell;
  if (pathname !== '/') html = html.replace(/<link[^>]*rel="preload"[^>]*as="image"[^>]*>/g, '');
  html = upsertTitle(html, config.title);
  html = upsertMeta(html, 'name', 'description', config.description);
  html = upsertMeta(html, 'name', 'robots', config.index ? ROBOTS_INDEX : ROBOTS_NOINDEX);

  html = upsertMeta(html, 'property', 'og:title', config.title);
  html = upsertMeta(html, 'property', 'og:description', config.description);
  html = upsertMeta(html, 'property', 'og:url', pageUrl);
  if (config.image) html = upsertMeta(html, 'property', 'og:image', config.image);

  html = upsertMeta(html, 'name', 'twitter:title', config.title);
  html = upsertMeta(html, 'name', 'twitter:description', config.description);

  html = upsertCanonical(html, pageUrl);
  html = upsertAlternate(html, 'en-CA', pageUrl);
  html = upsertAlternate(html, 'x-default', pageUrl);
  html = upsertJsonLd(html, buildPageJsonLd(pathname, origin));
  html = upsertStaticRouteBody(html, pathname);

  return html;
}

/**
 * dist/404.html. Firebase Hosting serves it with a real 404 status for any URL that has no
 * prerendered file, so a mistyped link or an expired listing is not a soft 404 that copies
 * the homepage. The app still boots on it and renders NotFoundPage.
 */
export function renderNotFoundHtml(shell: string): string {
  let html = shell.replace(/<link[^>]*rel="preload"[^>]*as="image"[^>]*>/g, '');
  html = upsertTitle(html, 'Page not found | CalgaryWatch');
  html = upsertMeta(html, 'name', 'description', 'This page could not be found on CalgaryWatch.');
  html = upsertMeta(html, 'name', 'robots', ROBOTS_NOINDEX);
  for (const [attr, key] of [['property', 'og:title'], ['name', 'twitter:title']] as const) html = upsertMeta(html, attr, key, 'Page not found | CalgaryWatch');
  for (const [attr, key] of [['property', 'og:description'], ['name', 'twitter:description']] as const) html = upsertMeta(html, attr, key, 'This page could not be found on CalgaryWatch.');
  html = html
    .replace(/\s*<meta[^>]*property=["']og:url["'][^>]*>/gi, '')
    .replace(/\s*<link[^>]*rel=["']canonical["'][^>]*>/gi, '')
    .replace(/\s*<link[^>]*rel=["']alternate["'][^>]*hreflang=[^>]*>/gi, '')
    .replace(/\s*<script[^>]*data-ld=["']page-schema["'][^>]*>[\s\S]*?<\/script>/i, '');
  const links = [['/', 'Home'], ['/community', 'Community Watch'], ['/map', 'Live safety map'], ['/events', 'Events']]
    .map(([href, label]) => staticLink(href, label)).join(' · ');
  const body = `<main><h1>Page not found.</h1><p>The link may be old or mistyped. Here’s where most people head next.</p><p>${links}</p></main>`;
  return html.replace(/<div id=["']root["']>[\s\S]*?<\/div>/i, `<div id="root">${body}</div>`);
}
