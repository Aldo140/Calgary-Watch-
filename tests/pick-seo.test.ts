import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { discoveryRepository } from '../src/data/discovery';
import { shelfFor } from '../src/lib/cwPicks';
import { deskFaq, deskIndexable, deskJsonLd, deskTitle } from '../src/lib/pickSeo';
import { buildPageJsonLd, PRERENDER_ROUTES, ROUTE_SEO } from '../src/lib/seo';
import { picksStaticBody } from '../scripts/seo/rewriteHtml';
import { DESK_COMPANIES } from '../src/content/pickDesks';

const entities = discoveryRepository.list();

describe('pick desk SEO', () => {
  it('indexes desks with 3+ companies and no Best list; keeps the rest out', () => {
    assert.ok(deskIndexable(shelfFor('electrical', entities)!));
    assert.ok(deskIndexable(shelfFor('heating', entities)!));
    assert.ok(!deskIndexable(shelfFor('plumbing', entities)!), 'plumbing ranks through /best/plumbers');
    assert.ok(!deskIndexable(shelfFor('pets', entities)!));
    assert.ok(PRERENDER_ROUTES.includes('/picks/electrical'));
    assert.ok(PRERENDER_ROUTES.includes('/picks'));
    assert.ok(!PRERENDER_ROUTES.includes('/picks/pets'));
    assert.equal(ROUTE_SEO['/picks/pets'].index, false);
  });

  it('titles say best, the count and the year', () => {
    assert.equal(deskTitle(shelfFor('heating', entities)!, 2026), 'Best Furnace Repair & HVAC Companies in Calgary (2026): 5 Local Companies Checked | CalgaryWatch');
  });

  it('every company fact is self-cited with a site and a phone', () => {
    for (const [id, d] of Object.entries(DESK_COMPANIES)) for (const p of d!.places) {
      assert.ok(p.website?.startsWith('https://'), `${id}: ${p.name} website`);
      assert.match(p.phone ?? '', /^\d{3}-\d{3}-\d{4}$/, `${id}: ${p.name} phone`);
      assert.ok(p.facts.length && p.facts.every(f => f.self && f.source.startsWith('https://')), `${id}: ${p.name} facts`);
    }
  });

  it('FAQ answers from the desk: names, 24/7 claims, honest Pick status', () => {
    const faq = deskFaq(shelfFor('electrical', entities)!);
    assert.match(faq[0].a, /4-Star Electric/);
    assert.match(faq[0].a, /No company has passed all seven/);
    const night = faq.find(x => /24\/7/.test(x.q))!;
    assert.match(night.a, /4-Star Electric says on its own site/);
  });

  it('JSON-LD carries the ItemList, typed businesses and the FAQ', () => {
    const ld = buildPageJsonLd('/picks/heating', 'https://calgarywatch.ca') as Record<string, any>;
    assert.equal(ld.mainEntity['@type'], 'ItemList');
    assert.equal(ld.mainEntity.itemListElement[0].item['@type'], 'HVACBusiness');
    assert.match(ld.mainEntity.itemListElement[0].item.telephone, /^\+1-\d{3}-/);
    assert.equal(ld.hasPart['@type'], 'FAQPage');
    assert.equal(ld.breadcrumb.itemListElement.at(-1).name, 'Furnace and AC in Calgary');
    assert.deepEqual(Object.keys(deskJsonLd(shelfFor('heating', entities)!, 'x')).sort(), ['about', 'hasPart', 'mainEntity']);
  });

  it('prerendered HTML lists the companies and the FAQ', () => {
    const html = picksStaticBody('/picks/heating');
    assert.match(html, /<h1>Best furnace repair (&amp;|&) HVAC companies in Calgary\.<\/h1>/);
    assert.match(html, /Fagnan/);
    assert.match(html, /Questions Calgarians ask/);
    assert.match(picksStaticBody('/picks'), /Electricians in Calgary/);
  });
});
