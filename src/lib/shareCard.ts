import { BAND_LABEL, type CommunityRank } from './communityRank';
import { BAND_DUOTONE } from './coverArt';

/**
 * Draws the downloadable rank card (1080×1350, Instagram's portrait size) on a
 * canvas. Built in the browser from the same rankings the page shows, so there
 * is no image server to run.
 */

const W = 1080;
const H = 1350;

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, weight = 800, family = 'Bricolage Grotesque'): number {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px "${family}", Inter, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  } while (size > 24);
  return size;
}

/** `shape` is the community's silhouette as an SVG path in a 100×100 box (see coverArt). */
export async function drawShareCard(r: CommunityRank, rankings: CommunityRank[], shape?: string): Promise<Blob | null> {
  try { await Promise.all(['800 64px "Bricolage Grotesque"', '600 24px "IBM Plex Mono"', '600 24px Inter'].map((f) => document.fonts.load(f))); } catch { /* fall back to system fonts */ }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const tone = BAND_DUOTONE[r.band];

  // Spotify-dark page, washed with the community's colour from the top
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 0, W, H);
  const wash = ctx.createLinearGradient(0, 0, 0, H * 0.75);
  wash.addColorStop(0, tone.from);
  wash.addColorStop(1, 'rgba(18,18,18,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  // The cover
  const cx = 140, cy = 110, cs = 800;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 80;
  ctx.shadowOffsetY = 30;
  const art = ctx.createLinearGradient(cx, cy, cx + cs, cy + cs);
  art.addColorStop(0, tone.from);
  art.addColorStop(1, tone.to);
  ctx.fillStyle = art;
  ctx.beginPath();
  ctx.roundRect(cx, cy, cs, cs, 18);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx, cy, cs, cs, 18);
  ctx.clip();
  if (shape && typeof Path2D !== 'undefined') {
    const p = new Path2D(shape);
    // Same layout as the on-page cover with a rank: shape up and to the right, rank below.
    ctx.translate(cx + cs * 0.46, cy + cs * 0.2);
    ctx.scale((cs * 0.5) / 100, (cs * 0.5) / 100);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = tone.ink;
    ctx.translate(5, 5);
    ctx.fill(p);
    ctx.translate(-5, -5);
    ctx.globalAlpha = 1;
    ctx.fill(p);
  }
  ctx.restore();
  ctx.fillStyle = tone.ink;
  ctx.font = '600 30px "IBM Plex Mono", monospace';
  ctx.fillText(`CALGARY · ${r.year}`, cx + 44, cy + 72);
  ctx.font = '800 54px "Bricolage Grotesque", Inter, sans-serif';
  ctx.fillText(r.name, cx + 44, cy + 136, cs * 0.42);
  ctx.font = '800 300px "Bricolage Grotesque", Inter, sans-serif';
  ctx.fillText(`#${r.rank}`, cx + 34, cy + cs - 50);

  // Title block, left-aligned like a track
  ctx.fillStyle = '#ffffff';
  const nameSize = fitText(ctx, r.name, W - 280, 92);
  ctx.font = `800 ${nameSize}px "Bricolage Grotesque", Inter, sans-serif`;
  ctx.fillText(r.name, 140, 1030);
  ctx.fillStyle = '#b3b3b3';
  ctx.font = '600 38px Inter, sans-serif';
  const trend = r.change && r.change.pct !== 0 ? ` · ${r.change.pct > 0 ? '+' : ''}${r.change.pct}% vs ${r.change.fromYear}` : '';
  ctx.fillText(`#${r.rank} of ${r.count} Calgary communities · ${BAND_LABEL[r.band]}${trend}`, 140, 1090, W - 280);

  // A progress bar: where it sits from #1 to last
  const bx = 140, bw = W - 280, by = 1150;
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, 10, 5);
  ctx.fill();
  const pos = rankings.length > 1 ? (r.rank - 1) / (r.count - 1) : 0;
  ctx.fillStyle = '#1ed760';
  ctx.beginPath();
  ctx.roundRect(bx, by, Math.max(10, bw * (1 - pos)), 10, 5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(bx + Math.max(10, bw * (1 - pos)), by + 5, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b3b3b3';
  ctx.font = '600 24px "IBM Plex Mono", monospace';
  ctx.fillText('FEWEST', bx, by + 52);
  ctx.textAlign = 'right';
  ctx.fillText('MOST', bx + bw, by + 52);

  // Footer
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 38px "Bricolage Grotesque", Inter, sans-serif';
  ctx.fillText('Know your community. Where’s yours?', 140, 1262);
  ctx.fillStyle = '#1ed760';
  ctx.font = '700 28px Inter, sans-serif';
  ctx.fillText('calgarywatch.ca/check-your-community', 140, 1306);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
