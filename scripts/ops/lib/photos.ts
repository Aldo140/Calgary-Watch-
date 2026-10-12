// Real photos for posts. A listing's own image (the organizer's photo, the one
// calgarywatch.ca already shows with its credit) beats any text card: our
// image-only cards got a median of 42 views, posts with real pictures far more.
// Photos are fetched when a post is rendered and kept in memory for the run.

import { spawn } from 'node:child_process';
import type { PostImageText } from '../../../src/types/ops';
import type { Entity } from './posts';

const cache = new Map<string, string | null>();
const MAX_BYTES = 12 * 1024 * 1024;

/** A data URI the renderer can draw, from a URL fetched earlier this run; undefined when it wasn't. */
export const photoData = (url: string): string | null | undefined => cache.get(url);

const isJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8;
const isPng = (b: Buffer) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/** Anything ffmpeg can read (WebP, AVIF, GIF…) as a JPEG, or null when it can't. */
function toJpeg(input: Buffer): Promise<Buffer | null> {
  return new Promise(resolve => {
    let p: ReturnType<typeof spawn>;
    try { p = spawn('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-frames:v', '1', '-q:v', '3', '-f', 'mjpeg', 'pipe:1']); } catch { resolve(null); return; }
    const out: Buffer[] = [];
    p.stdout!.on('data', (c: Buffer) => out.push(c));
    p.on('error', () => resolve(null));
    p.on('close', code => resolve(code === 0 && out.length ? Buffer.concat(out) : null));
    p.stdin!.on('error', () => undefined);
    p.stdin!.end(input);
  });
}

/** Fetch a photo once per run. Small images (logos, icons) and anything unreadable count as no photo. */
export async function loadPhoto(url: string): Promise<string | null> {
  if (cache.has(url)) return cache.get(url)!;
  let uri: string | null = null;
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'CalgaryWatchBot/1.0 (+https://calgarywatch.ca)' }, signal: AbortSignal.timeout(20_000) });
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.ok && buf.length >= 20_000 && buf.length <= MAX_BYTES) {
      const img = isJpeg(buf) || isPng(buf) ? buf : await toJpeg(buf);
      if (img) uri = `data:image/${isPng(img) ? 'png' : 'jpeg'};base64,${img.toString('base64')}`;
    }
  } catch { uri = null; }
  cache.set(url, uri);
  return uri;
}

/** The listing's own photo and its credit, when it has one. */
export function listingPhoto(e: Entity, sourceName: string): NonNullable<PostImageText['photo']> | null {
  const img = (e.image ?? (Array.isArray(e.images) ? e.images[0] : null)) as { src?: string; credit?: string } | null;
  if (!img?.src || !/^https:\/\//.test(img.src)) return null;
  const by = img.credit?.trim() || `Photo: ${e.organizer || sourceName}`.trim();
  return { url: img.src, credit: by.length > 48 ? `${by.slice(0, 47)}…` : by };
}

/** Fetch every remote photo the text needs; a photo that can't be fetched is dropped so the card still renders. */
export async function withPhoto(text: PostImageText): Promise<PostImageText> {
  const url = text.photo?.url;
  if (!url || text.photo?.file) return text;
  return (await loadPhoto(url)) ? text : { ...text, photo: null };
}
