/**
 * Calgary Watch — post-build SEO prerender
 *
 * Run automatically after `npm run build`:
 *   npx tsx scripts/seo/prerender.ts
 *
 * Why this exists: the app is a client-rendered SPA behind a catch-all rewrite,
 * so every URL previously served byte-identical HTML carrying the homepage's
 * title, description and Open Graph tags. Googlebot runs JavaScript and
 * eventually resolves the real tags, but Bing and every social scraper
 * (Facebook, LinkedIn, Slack, X) do not — sharing a link to /map showed
 * homepage metadata.
 *
 * This writes a real dist/<route>/index.html per indexable route with the tags
 * baked in. Firebase Hosting and GitHub Pages both serve a matching static file
 * before falling through to the SPA rewrite, so crawlers get correct markup
 * while the app itself still boots and behaves exactly as before.
 *
 * Nothing about the runtime bundle changes — this only adds sibling HTML files.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRERENDER_ROUTES, PRODUCTION_ORIGIN } from '../../src/lib/seo.js';
import { renderRouteHtml } from './rewriteHtml.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = join(REPO_ROOT, 'dist');

async function run(): Promise<void> {
  const shellPath = join(DIST, 'index.html');

  let shell: string;
  try {
    shell = await readFile(shellPath, 'utf8');
  } catch {
    console.error(`[prerender] ${shellPath} not found — run the build first.`);
    process.exit(1);
  }

  let written = 0;

  for (const route of PRERENDER_ROUTES) {
    const html = renderRouteHtml(shell, route, PRODUCTION_ORIGIN);

    // "/" overwrites dist/index.html itself; every other route gets its own
    // directory so the host serves <route>/index.html for a clean URL.
    const outPath =
      route === '/' ? shellPath : join(DIST, route.replace(/^\//, ''), 'index.html');

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, html, 'utf8');
    written += 1;
    console.log(`[prerender] ${route} → ${outPath.replace(REPO_ROOT + '/', '')}`);
  }

  console.log(`[prerender] Wrote ${written} page(s).`);
}

run().catch((error) => {
  console.error('[prerender] Failed:', error);
  process.exit(1);
});
