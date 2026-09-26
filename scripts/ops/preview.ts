// Renders sample posts from the real discovery index, both profile images and a
// 3x3 grid preview into brand/preview/, for design review. Touches nothing remote.
//
//   npm run ops:preview            (uses src/generated/discovery-index.json)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { ALL_BRANDS as BRANDS, ROOT, brandKit } from './lib/brand';
import { selectCandidates, templateDraft, type DiscoveryIndex } from './lib/posts';
import { renderPost, renderProfile } from './lib/render';
import { addDays, calgaryDate, calgaryToEpoch } from './lib/time';

const out = join(ROOT, 'brand', 'preview');
await mkdir(out, { recursive: true });
const index = JSON.parse(await readFile(join(ROOT, 'src', 'generated', 'discovery-index.json'), 'utf8')) as DiscoveryIndex;

// Pretend it's this Wednesday morning so the weekend roundup is exercised too.
const today = calgaryDate(Date.now());
const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
const wednesday = calgaryToEpoch(addDays(today, (3 - dow + 7) % 7), '06:30');

const written: string[] = [];
for (const brand of BRANDS) {
  const kit = brandKit(brand);
  await writeFile(join(out, `${brand}-profile.png`), await renderProfile(kit));
  const candidates = selectCandidates(index, { ...kit, postsPerDay: 4 }, brand === 'calgarydaily' ? calgaryToEpoch(addDays(today, 1), '06:30') : wednesday, new Set());
  let i = 0;
  for (const c of candidates) {
    const d = templateDraft(c, kit);
    const file = `${brand}-${++i}-${c.template}.png`;
    await writeFile(join(out, file), await renderPost(kit, c.template, d.imageText));
    written.push(file);
    console.log(`${file}\n  ${d.caption.split('\n').slice(0, 2).join(' / ')}`);
  }
  await writeFile(join(out, `${brand}-partner.png`), await renderPost(kit, 'partner', {
    eyebrow: 'FEATURED PARTNER · LOCAL', headline: 'Sample business name', details: ['1402 9 Ave SE, Inglewood', 'Open daily 7 am to 5 pm'], footer: 'calgarywatch.ca/local',
  }));
  await writeFile(join(out, `${brand}-update.png`), await renderPost(kit, 'update', {
    eyebrow: 'CITY UPDATE · SAMPLE', headline: 'Sample headline for a verified city update', details: ['What changed, in one line', 'Source: City of Calgary'], footer: 'calgarywatch.ca',
  }));
}

// A 3x3 grid of CalgaryWatch posts, roughly how the profile will read.
const tiles = [...written.filter(f => f.startsWith('calgarywatch')), 'calgarywatch-partner.png', 'calgarywatch-update.png'].slice(0, 9);
const data = await Promise.all(tiles.map(async f => `data:image/png;base64,${(await readFile(join(out, f))).toString('base64')}`));
const w = 360, h = 450, gap = 6;
const svg = await satori(
  { type: 'div', props: { style: { display: 'flex', flexWrap: 'wrap', gap, width: w * 3 + gap * 2, background: '#fff' },
    children: data.map((src, i) => ({ type: 'img', key: i, props: { src, width: w, height: h, style: { objectFit: 'cover' } } })) } } as any,
  { width: w * 3 + gap * 2, height: h * Math.ceil(tiles.length / 3) + gap * (Math.ceil(tiles.length / 3) - 1), fonts: [] },
);
await writeFile(join(out, 'calgarywatch-grid.png'), new Resvg(svg).render().asPng());
console.log(`\nWrote previews to ${out}`);
