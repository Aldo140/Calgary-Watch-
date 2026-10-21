import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoveryRepository } from '../src/data/discovery';
import { entityPath } from '../src/lib/discovery';
import { allShareCards, cardPath, shareCardFor, DEFAULT_SHARE_IMAGE } from '../src/lib/shareImage';
import { getSeoConfig } from '../src/lib/seo';
import { renderRouteHtml } from '../scripts/seo/rewriteHtml';
import type { Event } from '../src/types/discovery';

const shell = '<html><head><title>x</title><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" /></head><body><div id="root"></div></body></html>';

test('every listing, hub and Best list has exactly one card file', () => {
  const cards = allShareCards(discoveryRepository);
  const paths = cards.map(c => c.path);
  assert.equal(new Set(paths).size, paths.length, 'card paths are unique');
  for (const e of discoveryRepository.list()) assert.ok(paths.includes(cardPath(entityPath(e))), entityPath(e));
  for (const hub of ['/events', '/markets', '/local', '/neighbourhoods', '/guides', '/best']) assert.ok(paths.includes(cardPath(hub)), hub);
  assert.ok(cards.every(c => c.path.startsWith('/og/') && c.path.endsWith('.jpg') && c.title && c.alt));
});

test('an event card only states what the listing holds', () => {
  const event = discoveryRepository.list().find((e): e is Event => e.kind === 'event' && e.pricing === 'free' && !!e.venue)!;
  const card = shareCardFor(entityPath(event), discoveryRepository)!;
  assert.equal(card.theme, 'event');
  assert.equal(card.title, event.title.replace(/\s+/g, ' ').trim());
  assert.equal(card.pill, 'Free');
  assert.ok(card.lines.some(l => l.includes(event.venue!.trim())));
  assert.ok(card.dateBlock?.day);
});

test('listing pages carry the card with size, type and alt; other pages the JPEG site picture', () => {
  const event = discoveryRepository.list().find(e => e.kind === 'event')!;
  const html = renderRouteHtml(shell, entityPath(event), 'https://calgarywatch.ca');
  const url = `https://calgarywatch.ca${cardPath(entityPath(event))}`;
  assert.match(html, new RegExp(`property="og:image" content="${url.replace(/[.?]/g, '\\$&')}"`));
  assert.match(html, new RegExp(`name="twitter:image" content="${url.replace(/[.?]/g, '\\$&')}"`));
  assert.match(html, /property="og:image:type" content="image\/jpeg"/);
  assert.match(html, /property="og:image:alt" content="[^"]+"/);
  assert.equal(getSeoConfig('/about').image, DEFAULT_SHARE_IMAGE);
  assert.match(DEFAULT_SHARE_IMAGE, /\.jpg$/);
});
