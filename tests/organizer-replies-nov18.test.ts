import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createDiscoveryRepository, entityPath } from '../src/lib/discovery.ts';
import { renderRouteHtml } from '../scripts/seo/rewriteHtml.ts';
import type { Business, DiscoveryEntity } from '../src/types/discovery.ts';
import domain from '../functions/discovery-domain.cjs';

// Organizers who replied to the December outreach (Nov 17, 2026): each gets a profile and a claim page.
const profiles: Record<string, string> = {
  'hope-lutheran-calgary': 'Hope Lutheran Church',
  'calgary-first-church-of-the-nazarene': 'Calgary First Church of the Nazarene',
  'rockland-park-hoa': 'Rockland Park HOA',
};
const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const editorial = JSON.parse(read('src/content/editorial-inventory.json')) as { entities: DiscoveryEntity[] };
const generated = JSON.parse(read('src/generated/discovery-index.json')) as { entities: DiscoveryEntity[]; occurrences: [] };
const reviewed = JSON.parse(read('scripts/discovery/reviewed-sources.json')) as Array<{ source: any; records: Array<{ id: string; input: any }> }>;
const repository = createDiscoveryRepository(generated.entities, generated.occurrences);
const shell = '<html><head><title>CalgaryWatch</title></head><body><div id="root"></div></body></html>';
const source = (id: string) => reviewed.find(s => s.source.id === id)!;

describe('November 17 organizer replies', () => {
  for (const [slug, title] of Object.entries(profiles)) {
    it(`${title} has one published, unclaimed profile with a claim page`, () => {
      const id = `biz-${slug}`;
      const authored = editorial.entities.filter(e => e.id === id || (e.kind === 'business' && e.title === title));
      assert.equal(authored.length, 1);
      assert.deepEqual(generated.entities.filter(e => e.id === id), authored);
      assert.equal((authored[0] as Business).claimed, false);
      assert.ok((authored[0] as Business).address);
      assert.equal(entityPath(repository.find('business', slug) as Business), `/local/${slug}`);
      const html = renderRouteHtml(shell, `/claim/${id}`, 'https://calgarywatch.ca');
      assert.ok(html.includes(`<title>Claim ${title} | CalgaryWatch</title>`));
    });
  }

  it('every new event is a valid record from the organizer, with the times they sent', () => {
    const now = '2026-11-18T04:00:00Z';
    for (const id of ['calgary-first-church-of-the-nazarene', 'rockland-park-hoa']) {
      const s = source(id);
      assert.equal(s.records.length, 2);
      for (const r of s.records) {
        assert.ok(s.source.hosts.includes(new URL(r.input.sourceUrl).hostname));
        domain.normalizeRecord(r.input, s.source, r.id, now);
      }
    }
    const naz = source('calgary-first-church-of-the-nazarene').records;
    assert.deepEqual(naz.map(r => [r.input.start, r.input.end]), [['2026-12-06T16:00:00-06:00', '2026-12-06T18:30:00-06:00'], ['2026-12-24T16:00:00-06:00', '2026-12-24T17:00:00-06:00']]);
    const rp = source('rockland-park-hoa').records;
    assert.deepEqual(rp.map(r => [r.input.start, r.input.pricing]), [['2026-12-05T11:00:00-06:00', 'free'], ['2026-12-12T13:00:00-06:00', 'paid']]);
  });

  it('Hope Lutheran: no communion at either Christmas Eve service, communion on Christmas Day', () => {
    const recs = Object.fromEntries(source('hope-lutheran-calgary').records.map(r => [r.id, r.input]));
    assert.doesNotMatch(recs['christmas-eve-700-2026'].summary, /Communion/);
    assert.match(recs['christmas-eve-700-2026'].description, /does not include Holy Communion/);
    assert.doesNotMatch(recs['christmas-eve-430-2026'].description, /7 p\.m\. with Holy Communion/);
    assert.match(recs['christmas-day-2026'].summary, /with Holy Communion/);
  });

  it('Vaycay: karaoke has ended, so Date Night points at Wednesday trivia', () => {
    const dateNight = read('src/content/dateNight.ts');
    assert.doesNotMatch(dateNight, /monday-karaoke/);
    assert.match(dateNight, /wednesday-trivia-2026-11-25/);
    const vaycay = editorial.entities.find(e => e.id === 'biz-vaycay-brew-co')!;
    assert.doesNotMatch(JSON.stringify(vaycay), /karaoke/i);
  });
});
