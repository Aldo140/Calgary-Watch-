/**
 * Listing images from each organization's own website.
 *
 *   npx tsx scripts/images/collect-org-images.ts            # fetch (needs open network: runs in GitHub Actions)
 *   npx tsx scripts/images/collect-org-images.ts --apply    # write reviewed manifest entries into the inventory
 *
 * Collect reads the share image (og:image, then twitter:image) from the official page of every
 * published profile and every upcoming reviewed event or market that has no image yet, keeps
 * only real photos and posters (no logos, icons or tiny images), saves a resized webp under
 * public/images/orgs/ and records it in scripts/images/org-images.json for a human look.
 * Apply copies the manifest into editorial-inventory.json and reviewed-sources.json with a
 * visible credit to the site it came from, skipping any id listed in `rejected`.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const EDITORIAL = 'src/content/editorial-inventory.json';
const REVIEWED = 'scripts/discovery/reviewed-sources.json';
const MANIFEST = 'scripts/images/org-images.json';
const OUT = 'public/images/orgs';
const UA = 'Mozilla/5.0 (compatible; CalgaryWatchBot/1.0; +https://calgarywatch.ca)';
// Stock art we used before an organization had a photo of its own; those profiles are fair game.
const PLACEHOLDER = /^\/images\/(illustration|photo)\//;
const NOT_A_PHOTO = /logo|favicon|icon|sprite|placeholder|blank|spacer|avatar/i;

type Img = { src: string; alt: string; credit?: string; presentation?: 'poster' };
type Target = { id: string; title: string; page: string; scope: 'profile' | 'reviewed'; poster: boolean };
type Entry = { id: string; title: string; scope: Target['scope']; page: string; image: string; alt?: string; width: number; height: number; presentation?: 'poster'; file: string };
type Manifest = { collectedAt: string; entries: Entry[]; skipped: { id: string; page: string; reason: string }[]; rejected: string[] };

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const save = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const host = (u: string) => new URL(u).hostname.replace(/^www\./, '');
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

function targets(now = Date.now()): Target[] {
  const out: Target[] = [];
  for (const e of json(EDITORIAL).entities) {
    if (!e.id.startsWith('biz-') || e.status !== 'published' || !e.website) continue;
    if (e.image && !PLACEHOLDER.test(e.image.src)) continue;
    out.push({ id: e.id, title: e.title, page: e.website, scope: 'profile', poster: false });
  }
  for (const batch of json(REVIEWED)) for (const r of batch.records) {
    const i = r.input;
    if (i.image || !i.sourceUrl || (i.kind !== 'event' && i.kind !== 'market')) continue;
    const ends = i.kind === 'event' ? [i.end] : (i.occurrences ?? []).map((o: { end: string }) => o.end);
    if (!ends.some((t: string) => Date.parse(t) > now)) continue;
    out.push({ id: r.id, title: i.title, page: i.sourceUrl, scope: 'reviewed', poster: true });
  }
  return out;
}

async function get(url: string, ms: number) {
  const ctl = AbortSignal.timeout(ms);
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow', signal: ctl });
  if (!res.ok) throw Error(`HTTP ${res.status}`);
  return res;
}

function meta(html: string, keys: string[]) {
  for (const key of keys) {
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      const name = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
      const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
      if (name === key && content) return decode(content);
    }
  }
  return undefined;
}

async function collectOne(t: Target, seen: Map<string, string[]>): Promise<Entry | string> {
  let html: string;
  let base: string;
  try { const res = await get(t.page, 15000); base = res.url; html = (await res.text()).slice(0, 2_000_000); } catch (err) { return `page: ${(err as Error).message}`; }
  const raw = meta(html, ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']);
  if (!raw) return 'no share image';
  let image: string;
  try { image = new URL(raw, base).href; } catch { return 'bad image url'; }
  if (!/^https?:/.test(image)) return 'bad image url';
  if (NOT_A_PHOTO.test(new URL(image).pathname)) return 'logo or icon';
  let buf: Buffer;
  try { buf = Buffer.from(await (await get(image, 20000)).arrayBuffer()); } catch (err) { return `image: ${(err as Error).message}`; }
  if (buf.length > 20_000_000) return 'image too large';
  let m: sharp.Metadata;
  try { m = await sharp(buf).metadata(); } catch { return 'not an image'; }
  if (!m.width || !m.height || m.format === 'svg' || m.format === 'gif') return `format ${m.format}`;
  const ratio = m.width / m.height;
  let presentation: 'poster' | undefined;
  if (ratio >= 1.2 && m.width >= 600) presentation = undefined;
  else if (t.poster && ratio <= 0.9 && m.height >= 900) presentation = 'poster';
  else return `shape ${m.width}x${m.height}`;
  seen.set(image, [...(seen.get(image) ?? []), t.id]);
  const file = `${OUT}/${t.id}.webp`;
  await sharp(buf).rotate().resize({ width: presentation ? 900 : 1200, withoutEnlargement: true }).webp({ quality: 78 }).toFile(file);
  const alt = meta(html, ['og:image:alt', 'twitter:image:alt']);
  return { id: t.id, title: t.title, scope: t.scope, page: t.page, image, ...(alt ? { alt } : {}), width: m.width, height: m.height, ...(presentation ? { presentation } : {}), file };
}

async function collect() {
  mkdirSync(OUT, { recursive: true });
  const list = targets();
  const seen = new Map<string, string[]>();
  const entries: Entry[] = []; const skipped: Manifest['skipped'] = [];
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < list.length) {
      const t = list[next++];
      const r = await collectOne(t, seen);
      if (typeof r === 'string') skipped.push({ id: t.id, page: t.page, reason: r }); else entries.push(r);
    }
  }));
  // A share image used by an event that its organizer's site also uses is the site default, not the event's.
  const profileImages = new Set(entries.filter(e => e.scope === 'profile').map(e => e.image));
  const kept = entries.filter(e => {
    if (e.scope === 'reviewed' && profileImages.has(e.image)) { skipped.push({ id: e.id, page: e.page, reason: 'site default image' }); return false; }
    return true;
  });
  kept.sort((a, b) => a.id.localeCompare(b.id));
  skipped.sort((a, b) => a.id.localeCompare(b.id));
  save(MANIFEST, { collectedAt: new Date().toISOString(), entries: kept, skipped, rejected: [] } satisfies Manifest);
  console.log(`${list.length} targets, ${kept.length} images, ${skipped.length} skipped`);
}

function apply() {
  const manifest: Manifest = json(MANIFEST);
  const rejected = new Set(manifest.rejected);
  const byId = new Map(manifest.entries.filter(e => !rejected.has(e.id) && existsSync(e.file)).map(e => [e.id, e]));
  const image = (e: Entry): Img => ({
    src: `https://calgarywatch.ca/${e.file.replace(/^public\//, '')}`,
    alt: (e.alt && e.alt.length <= 300 ? e.alt : `${e.title}, from its official website`),
    credit: `Image from ${host(e.page)}`,
    ...(e.presentation ? { presentation: e.presentation } : {}),
  });
  const editorial = json(EDITORIAL);
  let n = 0;
  for (const ent of editorial.entities) { const e = byId.get(ent.id); if (e?.scope === 'profile') { ent.image = image(e); n++; } }
  save(EDITORIAL, editorial);
  const reviewed = json(REVIEWED);
  for (const batch of reviewed) for (const r of batch.records) {
    const e = byId.get(r.id);
    if (e?.scope !== 'reviewed' || r.input.image) continue;
    // Keep the field order readable: image sits after the copy, like the hand-entered ones.
    const { image: _, ...rest } = r.input;
    const keys = Object.keys(rest); const at = keys.indexOf('description') + 1;
    r.input = Object.fromEntries([...keys.slice(0, at).map(k => [k, rest[k]]), ['image', image(e)], ...keys.slice(at).map(k => [k, rest[k]])]);
    n++;
  }
  save(REVIEWED, reviewed);
  console.log(`applied ${n} images`);
}

if (process.argv.includes('--apply')) apply(); else await collect();
