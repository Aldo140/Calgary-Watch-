/**
 * Market pages: listing copy readers never should have seen, and the date tickets.
 *
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { publicSourceName, stripEditorialNotes } from '../src/lib/discovery.ts';
import { countdown, daysUntil } from '../src/lib/marketDays.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('public listing copy', () => {
  it('drops how we found a source from its name', () => {
    assert.equal(publicSourceName('The Barn Artisan Market — user-supplied official-source research'), 'The Barn Artisan Market');
    assert.equal(publicSourceName('Werklund Centre — user-supplied What’s On inventory'), 'Werklund Centre');
    assert.equal(publicSourceName('ScreamFest — existing reviewed event inventory'), 'ScreamFest');
    assert.equal(publicSourceName('Heritage Park events'), 'Heritage Park events');
    assert.equal(publicSourceName('Calgary Stampede — Grandstand Show'), 'Calgary Stampede — Grandstand Show');
  });
  it('removes notes written for reviewers, and only those', () => {
    const text = 'Free admission and parking. These confirmed dates override any assumption that every edition falls on the fourth Sunday.';
    assert.equal(stripEditorialNotes(text), 'Free admission and parking.');
    const research = 'CrossCraft Pattern Systems is a research-creation project.';
    assert.equal(stripEditorialNotes(research), research);
  });
  it('no published listing still carries a reviewer note or an internal source label', () => {
    const index = JSON.parse(read('src/generated/discovery-index.json')) as { entities: { summary: string; description?: string }[] };
    for (const e of index.entities) {
      assert.equal(stripEditorialNotes(e.summary), e.summary);
    }
    assert.match(read('src/lib/discovery.ts'), /sources: e\.sources\.map\(s => \(\{ \.\.\.s, name: publicSourceName/);
  });
});

describe('market date tickets', () => {
  const now = new Date('2026-10-21T10:00:00-06:00');
  it('counts Calgary calendar days', () => {
    assert.equal(daysUntil('2026-10-21T23:00:00-06:00', now), 0);
    assert.equal(daysUntil('2026-10-22T08:00:00-06:00', now), 1);
    assert.equal(daysUntil('2026-10-25T11:00:00-06:00', now), 4);
  });
  it('reads like a ticket', () => {
    assert.equal(countdown({ start: '2026-10-21T09:00:00-06:00', end: '2026-10-21T15:00:00-06:00' }, now), 'Open now');
    assert.equal(countdown({ start: '2026-10-21T17:00:00-06:00', end: '2026-10-21T21:00:00-06:00' }, now), 'Today');
    assert.equal(countdown({ start: '2026-10-22T09:00:00-06:00', end: '2026-10-22T15:00:00-06:00' }, now), 'Tomorrow');
    assert.equal(countdown({ start: '2026-10-25T11:00:00-06:00', end: '2026-10-25T16:00:00-06:00' }, now), 'In 4 days');
    assert.equal(countdown({ start: '2026-11-29T11:00:00-07:00', end: '2026-11-29T16:00:00-07:00' }, now), 'In 6 weeks');
  });
  it('the page status follows the same verification the badge reads', () => {
    const page = read('src/components/markets/MarketDetail.tsx');
    assert.match(page, /const verified = useVerifiedListing\(market\.id, isOwnerVerified\(market\)\)/);
    assert.doesNotMatch(page, /ProfileRibbon/);
  });
});

describe('event page themes', async () => {
  const { eventThemeId } = await import('../src/lib/eventTheme.ts');
  const ev = (title: string, categories: string[] = [], summary = '', venue = '') => ({ kind: 'event' as const, title, categories, tags: [], summary, pricing: 'paid' as const, venue });
  it('dresses each event for what it is', () => {
    assert.equal(eventThemeId(ev("Men's Hockey — Calgary Dinos vs. Mount Royal Cougars", ['sports'])), 'sports');
    assert.equal(eventThemeId(ev('Death From Above 1979', [], 'Doors at 7pm. Dance-punk duo DEATH FROM ABOVE 1979.')), 'music');
    assert.equal(eventThemeId(ev('A Concrete Jungle Book', [], '', 'StoryBook Theatre')), 'stage');
    assert.equal(eventThemeId(ev('Jazz Combos', ['arts'], 'jazz combos', 'Reeve Theatre')), 'music');
    assert.equal(eventThemeId(ev('Nickle@Noon – Artist Talk', ['arts'])), 'talks');
    assert.equal(eventThemeId(ev('TOUR – Weaving Conflict: Afghan War Carpets at Nickle Galleries', ['arts'])), 'gallery');
    assert.equal(eventThemeId(ev('Frozen Frights — Halloween on Ice', ['sports'])), 'family');
    assert.equal(eventThemeId(ev('Ghouls’ Night Out', ['family'])), 'other');
    assert.equal(eventThemeId(ev('Mercantile on 9th', ['market', 'shopping'])), 'market');
  });
  it('the event page uses the theme, the shared organizer desk and #151’s venue list', () => {
    const page = read('src/components/entity/ListingDetail.tsx');
    assert.match(page, /const theme = eventTheme\(event\)/);
    assert.match(page, /<EventScene theme=\{theme\.id\} \/>/);
    assert.match(page, /moreAtVenue\(event, all, now\)/);
    assert.match(page, /<OrganizerDesk listing=\{event\}/);
    assert.match(read('src/components/markets/MarketDetail.tsx'), /<OrganizerDesk listing=\{market\}/);
    assert.match(read('src/styles/event-detail.css'), /prefers-reduced-motion: reduce/);
  });
});
