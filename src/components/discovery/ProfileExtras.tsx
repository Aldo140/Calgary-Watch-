import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, CalendarPlus, CalendarDays, Check, Download, Link2, PenLine, Share2, Sparkles, Ticket } from 'lucide-react';
import type { Business, DiscoveryEntity } from '../../types/discovery';
import { googleCalendarUrl, icsFile, type CalendarEvent } from '../../lib/calendarFile';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { initials, type ProfileNext, type Shelf } from '../../lib/localShelves';
import { organizationClaimPath } from '../../lib/claimOrganization';
import { useVerifiedListing } from '../../lib/claimsApi';
import { CLAIM_BENEFIT } from '../entity/VerifiedBadge';
import { GoingButton } from '../plans/GoingButton';
import { ProfileCover } from './ProfileCover';
import { useSeen } from './LocalDirectory';

const MARK = '/images/brand/calgarywatch-city-spark-v2.webp';
const when = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });
const clock = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });

/**
 * Turn the next date into a plan: say you're going, put it in your calendar, or buy
 * tickets from the organizer. Every tap here sends someone to the business.
 */
export function PlanIt({ date, place }: { date: ProfileNext; place: Business }) {
  const cal: CalendarEvent = {
    id: date.eventId ?? `${place.id}-${date.start}`, title: date.title, start: date.start, end: date.end, dateOnly: date.dateOnly,
    location: date.venue, description: `From ${place.title} on CalgaryWatch Local.`, url: `https://calgarywatch.ca${date.path}`,
  };
  const download = () => {
    const blob = new Blob([icsFile(cal)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${place.slug}-next.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div className="lp-plan" role="group" aria-label={`Plan ${date.title}`}>
      {date.eventId ? <GoingButton eventId={date.eventId} start={date.start} /> : null}
      <button type="button" onClick={download}><CalendarPlus size={17} aria-hidden="true" />Add to calendar</button>
      <a href={googleCalendarUrl(cal)} target="_blank" rel="noopener noreferrer"><CalendarDays size={17} aria-hidden="true" />Google</a>
      {date.tickets ? <a className="is-tickets" href={date.tickets} target="_blank" rel="noopener noreferrer"><Ticket size={17} aria-hidden="true" />Tickets</a> : null}
    </div>
  );
}

/** Wrap a line of text to a width on a canvas, at most `max` lines, the last one trimmed. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > max) { lines.length = max; lines[max - 1] = `${lines[max - 1].replace(/\s+\S*$/, '')}…`; }
  return lines;
}

const loadImage = (src: string) => new Promise<HTMLImageElement | null>(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

/**
 * Draw a profile's story card, 1080 × 1920: its shelf colour, its initials huge, its
 * name, the next date and the link back. The same drawing is the preview and the file.
 */
async function drawStory(o: { name: string; shelf: Shelf; number: number; next?: ProfileNext; slug: string; area: string }): Promise<HTMLCanvasElement> {
  const W = 1080, H = 1920;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const css = getComputedStyle(document.documentElement);
  const display = `'Bricolage Grotesque', ${css.fontFamily || 'Inter'}, sans-serif`;
  const mono = `'IBM Plex Mono', ui-monospace, monospace`;
  try { await Promise.all([document.fonts.load(`800 100px 'Bricolage Grotesque'`), document.fonts.load(`600 40px 'IBM Plex Mono'`)]); } catch { /* the fallbacks still draw */ }
  const ink = o.shelf.ink, tone = o.shelf.id === 'seasonal' ? '#1a2b52' : o.shelf.tone;

  ctx.fillStyle = tone; ctx.fillRect(0, 0, W, H);
  // Light from the top corner, dusk at the foot, and the dot grid every Local tile carries.
  let g = ctx.createRadialGradient(W, 0, 0, W, 0, 1400); g.addColorStop(0, 'rgba(255,255,255,.32)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createLinearGradient(0, H * .55, 0, H); g.addColorStop(0, 'rgba(6,10,22,0)'); g.addColorStop(1, 'rgba(6,10,22,.82)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = ink === '#fff' ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)';
  for (let y = 30; y < H; y += 44) for (let x = 30; x < W; x += 44) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }

  const mark = await loadImage(MARK);
  if (mark) ctx.drawImage(mark, 80, 96, 88, 88);
  ctx.fillStyle = ink; ctx.textBaseline = 'middle';
  ctx.font = `800 46px ${display}`; ctx.fillText('CalgaryWatch Local', 188, 142);
  ctx.font = `600 34px ${mono}`; ctx.textAlign = 'right'; ctx.fillText(`NO. ${String(o.number).padStart(2, '0')}`, W - 80, 142); ctx.textAlign = 'left';

  // The cover, tilted, with a hard ink shadow like the cards on the site.
  ctx.save(); ctx.translate(W / 2, 650); ctx.rotate(-.05);
  const S = 700;
  ctx.fillStyle = '#151515'; roundRect(ctx, -S / 2 + 26, -S / 2 + 26, S, S, 48); ctx.fill();
  ctx.fillStyle = tone; roundRect(ctx, -S / 2, -S / 2, S, S, 48); ctx.fill();
  g = ctx.createRadialGradient(S / 2, -S / 2, 0, S / 2, -S / 2, S * 1.1); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; roundRect(ctx, -S / 2, -S / 2, S, S, 48); ctx.fill();
  ctx.lineWidth = 10; ctx.strokeStyle = '#151515'; roundRect(ctx, -S / 2, -S / 2, S, S, 48); ctx.stroke();
  ctx.fillStyle = ink; ctx.textBaseline = 'alphabetic';
  ctx.font = `800 360px ${display}`; ctx.fillText(initials(o.name), -S / 2 + 40, 110);
  ctx.font = `800 50px ${display}`;
  const coverLines = wrap(ctx, o.name, S - 96, 2);
  coverLines.forEach((l, i) => ctx.fillText(l, -S / 2 + 48, S / 2 - 52 - (coverLines.length - 1 - i) * 54));
  ctx.font = `600 30px ${mono}`; ctx.fillText(o.shelf.label.toUpperCase(), -S / 2 + 48, S / 2 - 110 - (coverLines.length - 1) * 54);
  ctx.restore();

  // The name, big, then where and what's next.
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
  // Long names step down in size until they fit in two lines, never cut short.
  let size = 112, lines: string[] = [];
  for (; size >= 64; size -= 8) { ctx.font = `800 ${size}px ${display}`; lines = wrap(ctx, o.name, W - 160, 9); if (lines.length <= 2) break; }
  if (lines.length > 3) { ctx.font = `800 ${size}px ${display}`; lines = wrap(ctx, o.name, W - 160, 3); }
  let y = 1170;
  for (const l of lines) { ctx.fillText(l, 80, y); y += size * .98; }
  ctx.font = `600 34px ${mono}`; ctx.fillStyle = 'rgba(255,255,255,.78)';
  ctx.fillText(`${o.shelf.label} · ${o.area}`.toUpperCase(), 84, y + 6);
  y += 70;
  if (o.next) {
    const label = `${Date.parse(o.next.start) <= Date.now() ? 'ON NOW' : 'NEXT'} · ${when.format(new Date(o.next.start)).toUpperCase()}${o.next.dateOnly ? '' : ` · ${clock.format(new Date(o.next.start)).toUpperCase()}`}`;
    ctx.font = `700 36px ${mono}`;
    const w = ctx.measureText(label).width + 56;
    ctx.fillStyle = '#ffdf4f'; roundRect(ctx, 80, y, w, 76, 38); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#151515'; ctx.stroke();
    ctx.fillStyle = '#151515'; ctx.textBaseline = 'middle'; ctx.fillText(label, 108, y + 39);
    ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.font = `800 54px ${display}`;
    ctx.fillText(wrap(ctx, o.next.title, W - 160, 1)[0], 80, y + 150);
  }

  // The way back: the link, on a white strip at the foot.
  ctx.fillStyle = '#fff'; roundRect(ctx, 80, H - 220, W - 160, 120, 60); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#151515'; ctx.stroke();
  ctx.fillStyle = '#151515'; ctx.textBaseline = 'middle';
  const link = `calgarywatch.ca/local/${o.slug}`;
  let ls = 38; do { ctx.font = `700 ${ls}px ${mono}`; ls -= 2; } while (ctx.measureText(link).width > W - 260 && ls > 20);
  ctx.fillText(link, 130, H - 160);
  return c;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/**
 * "Put it on your story": a shareable 9:16 card for the profile, drawn on the phone, for
 * fans and for the business itself. Shares the image where the phone can, else saves it.
 */
export function StoryCard({ place, name, shelf, number, next, area, url }: { place: Business; name: string; shelf: Shelf; number: number; next?: ProfileNext; area: string; url: string }) {
  const [ref, seen] = useSeen<HTMLElement>(true, '0px 0px 30% 0px');
  const [preview, setPreview] = useState<string>();
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'copied'>('idle');
  useEffect(() => {
    if (!seen || preview) return;
    let live = true;
    void drawStory({ name, shelf, number, next, slug: place.slug, area }).then(c => { if (live) setPreview(c.toDataURL('image/jpeg', .82)); });
    return () => { live = false; };
  }, [seen, preview, name, shelf, number, next, place.slug, area]);
  const share = async () => {
    setState('busy');
    try {
      const canvas = await drawStory({ name, shelf, number, next, slug: place.slug, area });
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('no image');
      const file = new File([blob], `${place.slug}-calgarywatch.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name, text: `${name} on CalgaryWatch Local`, url }); setState('idle'); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setState('saved');
    } catch { setState('idle'); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); setState('copied'); setTimeout(() => setState('idle'), 2500); } catch { /* no clipboard */ } };
  return (
    <section className="lp-story-card" ref={ref} aria-labelledby="lp-story-card">
      <div className="lp-story-copy">
        <p className="lx-eyebrow"><Sparkles size={14} aria-hidden="true" />Spread the word</p>
        <h2 id="lp-story-card">Put <mark>{name}</mark> on your story.</h2>
        <p>A card drawn for them, sized for Instagram and TikTok stories, with {next ? 'their next date and ' : ''}a link straight back here.</p>
        <div className="lp-story-actions">
          <button type="button" className="lp-btn lp-btn-sun" onClick={() => void share()} disabled={state === 'busy'}>
            {state === 'saved' ? <Check size={17} aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />}
            <span className="lp-btn-t">{state === 'busy' ? 'Drawing…' : state === 'saved' ? 'Saved to your phone' : 'Share the card'}</span>
          </button>
          <button type="button" className="lp-btn" onClick={() => void copy()}>{state === 'copied' ? <Check size={17} aria-hidden="true" /> : <Link2 size={17} aria-hidden="true" />}<span className="lp-btn-t">{state === 'copied' ? 'Link copied' : 'Copy link'}</span></button>
        </div>
      </div>
      <figure className="lp-story-phone">
        {preview ? <img src={preview} alt={`The story card for ${name}`} width="1080" height="1920" /> : <span className="lp-story-wait" aria-hidden="true"><Download size={22} /></span>}
      </figure>
    </section>
  );
}

/**
 * The pitch to whoever runs the place, on phones: what claiming this page gets them,
 * shown on their own cover, and the button to start. Gone once they've claimed it.
 */
export function OwnerPitch({ place, name, shelf, number, all, dates, mates }: { place: Business; name: string; shelf: Shelf; number: number; all: readonly DiscoveryEntity[]; dates: number; mates: number }) {
  const verified = useVerifiedListing(place.id, Boolean(place.ownerVerifiedAt));
  if (verified || place.developmentOnly) return null;
  const perks: [typeof BadgeCheck, string, string][] = [
    [BadgeCheck, 'A verified badge', 'On this page and wherever it shows up across CalgaryWatch.'],
    [CalendarDays, 'Your dates, from you', dates ? `${dates} ${dates === 1 ? 'date is' : 'dates are'} listed already. Add, fix or cancel them yourself.` : 'Add your shows, markets and events and they land on the Local board.'],
    [PenLine, 'Hours, links and your story', 'Keep the essentials right, in your own words.'],
    [Sparkles, 'More weight in picks', CLAIM_BENEFIT.replace(/^Verified listings are marked as verified and /, 'Verified listings are ')],
  ];
  return (
    <section className="lp-pitch" aria-labelledby="lp-pitch" style={{ '--tone': shelf.tone, '--tink': shelf.ink } as CSSProperties}>
      <p className="lx-eyebrow"><span className="lx-dot" aria-hidden="true" />For the people who run it</p>
      <h2 id="lp-pitch">Run {name}? <mark>Make this page yours.</mark></h2>
      <div className="lp-pitch-card">
        <div className="lp-pitch-cover" aria-hidden="true"><ProfileCover id={place.id} title={name} shelf={shelf} mini /><span className="lp-pitch-tick"><BadgeCheck size={20} /></span></div>
        <p className="lp-pitch-now"><b>No. {String(number).padStart(2, '0')}</b> of the people who make Calgary, on the {shelf.label.toLowerCase()} shelf{mates ? ` with ${mates} others` : ''}.</p>
      </div>
      <ul className="lp-pitch-perks">
        {perks.map(([Icon, title, line], i) => <li key={title} style={{ '--i': i } as CSSProperties}><Icon size={20} aria-hidden="true" /><span><b>{title}</b>{line}</span></li>)}
      </ul>
      <Link className="lp-pitch-go" to={organizationClaimPath(place, all)}>Claim {name} free <ArrowUpRight size={18} aria-hidden="true" /></Link>
      <p className="lp-pitch-small">Free, and we check every claim by hand. Ranking is never sold.</p>
    </section>
  );
}
