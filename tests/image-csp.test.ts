/**
 * Listing photos are hotlinked from organizer sites. The live site's
 * Content-Security-Policy (firebase.json) blocks any image host it doesn't
 * name, and a blocked photo silently falls back to the default art: that
 * happened to every UCalgary and Mount Royal event until 2026-09-26. Local dev
 * sends no CSP, so only this test catches it.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csp = JSON.stringify(JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8')));
const imgSrc = new Set((csp.match(/img-src ([^;"]*)/)?.[1] ?? '').split(/\s+/));
const allowed = (host: string) => imgSrc.has(`https://${host}`);

describe('image hosts allowed by the live CSP', () => {
  it('covers every photo in the published discovery index', () => {
    const index = JSON.parse(readFileSync(join(root, 'src/generated/discovery-index.json'), 'utf8'));
    const hosts = new Set<string>(index.entities.map((e: any) => e.image?.src).filter((s: unknown) => typeof s === 'string' && s.startsWith('https://')).map((s: string) => new URL(s).host));
    for (const h of hosts) assert.ok(allowed(h), `firebase.json img-src is missing https://${h}`);
  });

  it('covers every feed that can supply photos from its own site', () => {
    const sources = JSON.parse(readFileSync(join(root, 'scripts/discovery/automatic-sources.json'), 'utf8'));
    for (const { source } of sources) {
      if (source.provider !== 'ics' && source.provider !== 'tribe') continue;
      for (const h of source.hosts) assert.ok(allowed(h), `${source.id}: firebase.json img-src is missing https://${h}`);
    }
    assert.ok(allowed('s1.ticketm.net'), 'Ticketmaster images come from s1.ticketm.net');
  });

  it('covers CalgaryDaily post images on the homepage', () => {
    assert.ok(allowed('cdn.jsdelivr.net'));
  });
});
