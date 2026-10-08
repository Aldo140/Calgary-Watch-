import { barHeight, type CommunityRank } from './communityRank';

/**
 * Draws the downloadable rank card (1080×1350, Instagram's portrait size) on a
 * canvas. Built in the browser from the same rankings the page shows, so there
 * is no image server to run.
 */

const W = 1080;
const H = 1350;
const BAND_COLOURS: Record<CommunityRank['band'], string> = {
  Hot: '#ff5a4e',
  High: '#ff9b3d',
  Elevated: '#ffdf4f',
  Calm: '#7bd7c3',
};

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, weight = 800, family = 'Bricolage Grotesque'): number {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px "${family}", Inter, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  } while (size > 24);
  return size;
}

export async function drawShareCard(r: CommunityRank, rankings: CommunityRank[]): Promise<Blob | null> {
  try { await Promise.all(['800 64px "Bricolage Grotesque"', '600 24px "IBM Plex Mono"', '600 24px Inter'].map((f) => document.fonts.load(f))); } catch { /* fall back to system fonts */ }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const band = BAND_COLOURS[r.band];

  // Night sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b2350');
  sky.addColorStop(1, '#040d1d');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.78, 300, 20, W * 0.78, 300, 620);
  glow.addColorStop(0, `${band}55`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = '#9fe9f5';
  ctx.font = '600 26px "IBM Plex Mono", monospace';
  ctx.fillText(`CALGARY · 311 REPORTS · ${r.year}`, 80, 120);

  // Community name
  ctx.fillStyle = '#ffffff';
  const nameSize = fitText(ctx, r.name, W - 160, 96);
  ctx.font = `800 ${nameSize}px "Bricolage Grotesque", Inter, sans-serif`;
  ctx.fillText(r.name, 80, 240);

  // Rank
  ctx.fillStyle = band;
  ctx.font = '800 360px "Bricolage Grotesque", Inter, sans-serif';
  const rankText = `#${r.rank}`;
  ctx.fillText(rankText, 64, 600);
  const rankWidth = ctx.measureText(rankText).width;
  ctx.fillStyle = 'rgba(255,255,255,.78)';
  ctx.font = '600 44px Inter, sans-serif';
  ctx.fillText(`of ${r.count}`, 64 + rankWidth + 24, 600);

  // Band chip
  ctx.font = '700 34px Inter, sans-serif';
  const chip = r.band.toUpperCase();
  const chipW = ctx.measureText(chip).width + 56;
  ctx.fillStyle = band;
  ctx.beginPath();
  ctx.roundRect(80, 650, chipW, 64, 32);
  ctx.fill();
  ctx.fillStyle = '#151515';
  ctx.fillText(chip, 108, 694);

  // Trend
  if (r.change && r.change.pct !== 0) {
    ctx.fillStyle = r.change.pct < 0 ? '#7ee2b8' : '#ffb4ae';
    ctx.font = '700 40px Inter, sans-serif';
    ctx.fillText(`${r.change.pct < 0 ? '▼' : '▲'} ${Math.abs(r.change.pct)}% in ${r.change.toYear}`, 80 + chipW + 32, 697);
  }

  // Skyline: every community, busiest on the left, this one lit up
  const top = 800;
  const base = 1130;
  const max = rankings[0]?.total ?? 1;
  const slot = (W - 160) / Math.max(rankings.length, 1);
  rankings.forEach((c, i) => {
    const h = Math.max(4, barHeight(c.total, max) * (base - top));
    const isMe = c.key === r.key;
    ctx.fillStyle = isMe ? band : 'rgba(159,233,245,.28)';
    ctx.fillRect(80 + i * slot, base - h, Math.max(1, slot - 1.5), h);
    if (isMe) {
      ctx.fillStyle = band;
      ctx.beginPath();
      ctx.moveTo(80 + i * slot + slot / 2, base - h - 14);
      ctx.lineTo(80 + i * slot + slot / 2 - 14, base - h - 38);
      ctx.lineTo(80 + i * slot + slot / 2 + 14, base - h - 38);
      ctx.fill();
    }
  });
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = '600 22px "IBM Plex Mono", monospace';
  ctx.fillText('MOST REPORTS', 80, base + 40);
  ctx.textAlign = 'right';
  ctx.fillText('FEWEST', W - 80, base + 40);

  // Footer
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffdf4f';
  ctx.font = '800 40px "Bricolage Grotesque", Inter, sans-serif';
  ctx.fillText('Where does yours rank?', 80, 1262);
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.font = '600 28px Inter, sans-serif';
  ctx.fillText('calgarywatch.ca/check-your-community', 80, 1306);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
