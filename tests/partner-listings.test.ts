import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createDiscoveryRepository, entityPath } from '../src/lib/discovery.ts';
import { renderRouteHtml } from '../scripts/seo/rewriteHtml.ts';
import { RecurringMarketProvider, type SourceConfig } from '../scripts/discovery/providers.ts';
import { canonicalOrganizer } from '../scripts/discovery/visitCalgary.ts';
import type { Business, DiscoveryEntity, Market } from '../src/types/discovery.ts';

// Organizations that replied to outreach (docs/partner-outreach.md). Each one we email a
// claim link must be a real published entity whose public and claim routes resolve.
const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const editorial = JSON.parse(read('src/content/editorial-inventory.json')) as { entities: DiscoveryEntity[] };
const generated = JSON.parse(read('src/generated/discovery-index.json')) as { entities: DiscoveryEntity[]; occurrences: [] };
const repository = createDiscoveryRepository(generated.entities, generated.occurrences);
const shell = '<html><head><title>CalgaryWatch</title></head><body><div id="root"></div></body></html>';
const claimable = (id: string) => repository.list().find(e => e.id === id && ['event', 'market', 'business'].includes(e.kind));

const organizations = [
  { id: 'biz-vertigo-theatre', path: '/local/vertigo-theatre', title: 'Vertigo Theatre', host: 'vertigotheatre.com' },
  { id: 'biz-wilder-institutes-calgary-zoo', path: '/local/wilder-institutes-calgary-zoo', title: 'Wilder Institute’s Calgary Zoo', host: 'calgaryzoo.com' },
  { id: 'biz-calgary-chinese-cultural-centre', path: '/local/calgary-chinese-cultural-centre', title: 'Calgary Chinese Cultural Centre', host: 'culturalcentre.ca' },
  { id: 'biz-downstage', path: '/local/downstage', title: 'Downstage', host: 'downstage.ca' },
  { id: 'biz-ghost-river-theatre', path: '/local/ghost-river-theatre', title: 'Ghost River Theatre', host: 'ghostrivertheatre.com' },
];

describe('partner organization listings', () => {
  for (const org of organizations) {
    it(`${org.title} is a published, claimable entity with working routes`, () => {
      const authored = editorial.entities.find(e => e.id === org.id) as Business | undefined;
      const exported = generated.entities.find(e => e.id === org.id);
      assert.ok(authored, 'authored in editorial-inventory.json');
      assert.deepEqual(exported, authored, 'kept as-is by the discovery export');
      assert.equal(authored.kind, 'business');
      assert.equal(authored.status, 'published');
      assert.equal(authored.developmentOnly, undefined);
      assert.equal(authored.claimed, false, 'claim state comes from approved claims, never the inventory');
      assert.equal(authored.title, org.title);
      assert.equal(entityPath(authored), org.path);
      assert.equal(claimable(org.id)?.title, org.title);
      for (const source of authored.sources) {
        assert.equal(source.kind, 'official');
        assert.ok(new URL(source.url).hostname.replace(/^www\./, '').endsWith(org.host), source.url);
      }

      const page = renderRouteHtml(shell, org.path, 'https://calgarywatch.ca');
      assert.match(page, new RegExp(`<h1>${org.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h1>`));
      const claim = renderRouteHtml(shell, `/claim/${org.id}`, 'https://calgarywatch.ca');
      assert.ok(claim.includes(`<h1>Run ${org.title}? Claim it.</h1>`));
      assert.doesNotMatch(claim, /Listing unavailable|Page not found/);
    });
  }

  it('has exactly one entity per organization (no duplicates under old names)', () => {
    const names = (e: DiscoveryEntity) => e.title.toLowerCase().replace(/[’']/g, "'");
    for (const pattern of [/vertigo theatre$/, /calgary zoo/, /chinese cultural centre/, /^downstage/, /ghost river/]) {
      assert.equal(generated.entities.filter(e => e.kind === 'business' && pattern.test(names(e))).length, 1, String(pattern));
    }
  });

  it('uses the zoo’s own name everywhere, including Tourism Calgary copies', () => {
    for (const file of ['src/generated/discovery-index.json', 'scripts/discovery/reviewed-sources.json', 'src/content/editorial-inventory.json']) {
      assert.doesNotMatch(read(file), /Wilder Institute\s*[/,]\s*Calgary Zoo|Wilder institute\/|"venue": "Wilder Institute"/, file);
    }
    for (const raw of ['Wilder institute/Calgary Zoo', 'Wilder Institute', 'Wilder Institute, Calgary Zoo', 'Calgary Zoo', 'Wilder Institute’s Calgary Zoo']) {
      assert.equal(canonicalOrganizer(raw), 'Wilder Institute’s Calgary Zoo', raw);
    }
    assert.equal(canonicalOrganizer('Calgary Zoo Lights Society'), 'Calgary Zoo Lights Society');
    const zooEvents = generated.entities.filter(e => e.kind === 'event' && /zoo/i.test(e.organizer));
    assert.ok(zooEvents.length >= 2);
    for (const e of zooEvents) assert.equal(e.kind === 'event' && e.organizer, 'Wilder Institute’s Calgary Zoo');
  });

  it('describes Ghost River without implying a fixed season', () => {
    const ghost = claimable('biz-ghost-river-theatre') as Business;
    assert.equal(ghost.socials.season, undefined);
    assert.equal(ghost.socials.experiences, 'https://www.ghostrivertheatre.com/202627experiences');
    assert.match(ghost.description, /doesn’t run a fixed subscription season/);
    assert.match(read('src/components/entity/ListingDetail.tsx'), /Current and upcoming experiences/);
  });
});

describe('Dalhousie Harvest Farmers’ Market', () => {
  const id = 'b3bbb09ef98f18fa6f66383e98f1';

  it('keeps its live route and claim route and shows the photo the organizer supplied', () => {
    const market = claimable(id) as Market;
    assert.equal(entityPath(market), '/markets/dalhousie-harvest-farmers-market-b3bbb0');
    assert.equal(market.image?.src, 'https://calgarywatch.ca/images/markets/dalhousie-harvest-farmers-market.webp');
    assert.match(market.image?.alt ?? '', /Dalhousie Harvest Farmers' Market poster: Saturday, October 24, 10 am to 3 pm/);
    assert.equal(market.image?.credit, 'Image: Dalhousie Community Association');
    assert.ok(existsSync(new URL('public/images/markets/dalhousie-harvest-farmers-market.webp', root)));
    assert.match(renderRouteHtml(shell, `/claim/${id}`, 'https://calgarywatch.ca'), /<h1>Run Dalhousie Harvest Farmers' Market\? Claim it\.<\/h1>/);
  });

  it('carries the photo through the recurring-market feed so the next export keeps it', async () => {
    const sources = JSON.parse(read('scripts/discovery/automatic-sources.json')) as Array<{ source: SourceConfig }>;
    const source = sources.find(s => s.source.id === 'recurring-markets-calgary')!.source;
    const records = await new RecurringMarketProvider({ ...source, markets: source.markets!.filter(m => m.id === 'dalhousie-harvest-farmers-market') }, new Date('2026-10-13T12:00:00-06:00')).fetch();
    assert.equal(records.length, 1);
    assert.equal(records[0].input.image?.src, 'https://calgarywatch.ca/images/markets/dalhousie-harvest-farmers-market.webp');
  });

  it('renders supplied photos fitted, not cropped, on every market surface', () => {
    const art = read('src/components/discovery/ListingArt.tsx');
    assert.match(art, /export function MarketCover/);
    assert.match(read('src/index.css'), /\.cw-art\.cw-art-photo > img \{[^}]*object-fit: contain/);
    for (const file of ['src/components/markets/MarketDetail.tsx', 'src/components/markets/MarketsBoard.tsx', 'src/components/discovery/ListingBoard.tsx', 'src/components/discovery/DiscoveryCards.tsx']) {
      assert.match(read(file), /<MarketCover market=/, file);
      assert.doesNotMatch(read(file), /<MarketArt /, file);
    }
  });
});

describe('Mercantile on 9th', () => {
  it('is one live claimable event at its known id', () => {
    const id = '6972906c904ecd4acb9407299e22';
    const event = claimable(id);
    assert.equal(event?.kind, 'event');
    assert.equal(event && entityPath(event), '/events/mercantile-on-9th-697290');
    assert.equal(generated.entities.filter(e => /mercantile on 9th/i.test(e.title)).length, 1);
    assert.match(renderRouteHtml(shell, `/claim/${id}`, 'https://calgarywatch.ca'), /<h1>Run Mercantile on 9th\? Claim it\.<\/h1>/);
  });
});
