// Daily health check and the morning summary email to the founder.

import type { Firestore } from 'firebase-admin/firestore';
import type { OpsHealth, OpsPerformance, OpsPost, PartnerLead } from '../../../src/types/ops';
import { BRANDS, brandKit } from '../lib/brand';
import { claudeConfigured } from '../lib/claude';
import { COLLECTIONS } from '../lib/firebase';
import { igAccount, igToken, tokenExpiry } from '../lib/instagram';
import { currentToken, keepAlive } from './igTokens';
import { outlookConfigured } from '../lib/outlook';
import { happenings, type DiscoveryIndex } from '../lib/posts';
import { calgaryDate, calgaryMinutes } from '../lib/time';

type Log = (m: string) => void;
type Item = OpsHealth['items'][number];
const DAY = 86_400_000;

async function sitemapCheck(): Promise<Item> {
  try {
    const xml = await (await fetch('https://calgarywatch.ca/sitemap.xml', { signal: AbortSignal.timeout(15_000) })).text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    const sample = urls.sort(() => Math.random() - 0.5).slice(0, 15);
    const broken: string[] = [];
    await Promise.all(sample.map(async u => {
      const r = await fetch(u, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (!r || r.status >= 400) broken.push(`${u} (${r?.status ?? 'no response'})`);
    }));
    return { id: 'routes', label: 'Site pages', ok: !broken.length, detail: broken.length ? `Broken: ${broken.join(', ')}` : `${sample.length} of ${urls.length} sitemap pages checked, all load.` };
  } catch (e) {
    return { id: 'routes', label: 'Site pages', ok: false, detail: `Sitemap unreachable: ${e instanceof Error ? e.message : e}` };
  }
}

async function workflowCheck(): Promise<Item> {
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return { id: 'workflows', label: 'Scheduled jobs', ok: true, detail: 'Not checked outside GitHub Actions.' };
  const since = new Date(Date.now() - DAY).toISOString();
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/runs?status=failure&created=>=${since}&per_page=50`, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } });
  const body: any = await r.json().catch(() => ({}));
  const names = [...new Set((body.workflow_runs ?? []).map((w: any) => w.name))];
  return { id: 'workflows', label: 'Scheduled jobs', ok: names.length === 0, detail: names.length ? `Failed in the last 24h: ${names.join(', ')}` : 'No failed runs in the last 24h.' };
}

export async function checkHealth(db: Firestore | null, index: DiscoveryIndex, now: number, log: Log): Promise<OpsHealth> {
  const items: Item[] = [];
  for (const brand of BRANDS) {
    const kit = brandKit(brand);
    if (!kit.confirmed) items.push({ id: `kit-${brand}`, label: `${kit.name} brand kit`, ok: false, detail: kit.confirmNote ?? 'Provisional.' });
    if (!igToken(brand)) { items.push({ id: `ig-${brand}`, label: `Instagram ${kit.name}`, ok: false, detail: 'Not connected yet.' }); continue; }
    try {
      // Instagram-login tokens are renewed here every day, so they never run out.
      const renewed = db ? await keepAlive(db, brand, now) : null;
      const token = (await currentToken(db, brand))!;
      const account = await igAccount(token, kit.handle);
      const exp = renewed ?? await tokenExpiry(token);
      const days = exp ? Math.floor((exp - now) / DAY) : null;
      const detail = renewed ? 'token renews itself daily.' : days === null ? 'token does not expire.' : `token expires in ${days} days.`;
      items.push({ id: `ig-${brand}`, label: `Instagram ${kit.name}`, ok: days === null || days > 10, detail: `@${account.username} connected; ${detail}` });
    } catch (e) {
      items.push({ id: `ig-${brand}`, label: `Instagram ${kit.name}`, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  items.push({ id: 'claude', label: 'Drafting (Claude)', ok: claudeConfigured(), detail: claudeConfigured() ? 'Connected.' : 'No ANTHROPIC_API_KEY; drafts use fixed templates.' });
  items.push({ id: 'outlook', label: 'Outreach mailbox', ok: outlookConfigured(), detail: outlookConfigured() ? 'Connected.' : 'Microsoft Graph app not configured (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET); queued emails wait.' });

  const upcoming = happenings(index).filter(h => h.start > now && h.start < now + 7 * DAY).length;
  items.push({ id: 'inventory', label: 'Listings next 7 days', ok: upcoming >= 5, detail: `${upcoming} dated events and market days.` });

  if (db) {
    const feeds = await db.collection('ingestion_health').get();
    const bad = feeds.docs.filter(d => d.get('status') === 'error').map(d => d.id);
    items.push({ id: 'feeds', label: 'Data feeds', ok: !bad.length, detail: bad.length ? `Erroring: ${bad.join(', ')}` : `${feeds.size} feeds healthy.` });
  }
  items.push(await sitemapCheck());
  items.push(await workflowCheck());

  const health: OpsHealth = { checkedAt: now, items };
  if (db) await db.collection(COLLECTIONS.health).doc('latest').set(health);
  for (const i of items) log(`${i.ok ? 'OK  ' : 'WARN'} ${i.label}: ${i.detail}`);
  return health;
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Followers, what's working, and whether posts go out on time. */
function performanceHtml(p: OpsPerformance, now: number): string {
  const days = Object.keys(p.followers).sort();
  const today = days.at(-1), weekAgo = days.filter(d => d <= calgaryDate(now - 7 * DAY)).at(-1);
  const lines: string[] = [];
  if (today) {
    const change = weekAgo ? p.followers[today] - p.followers[weekAgo] : null;
    lines.push(`<li><strong>${p.followers[today].toLocaleString('en-CA')}</strong> followers${change !== null ? ` (${change >= 0 ? '+' : ''}${change} this week)` : ''}</li>`);
  }
  const [bestFormat] = p.byFormat;
  if (bestFormat && p.byFormat.length > 1) lines.push(`<li>${esc(bestFormat.label)} reach the most people: ${bestFormat.avgReach} on average over ${bestFormat.posts} posts.</li>`);
  if (p.top[0]) lines.push(`<li>Best post this month: <a href="${esc(p.top[0].permalink)}" style="color:#1554D1">${esc(p.top[0].headline)}</a> (${p.top[0].reach} reached, ${p.top[0].savesShares} saves and shares)</li>`);
  if (p.avgDelayMinutes !== null) lines.push(`<li>Automatic posts went out ${p.avgDelayMinutes} minutes after their slot on average this week.</li>`);
  return lines.length ? `<h3 style="margin:18px 0 6px">How @calgarydaily is doing</h3><ul style="padding-left:18px;line-height:1.6">${lines.join('')}</ul>` : '';
}

export async function sendSummary(db: Firestore, health: OpsHealth, now: number, log: Log): Promise<void> {
  const to = process.env.OPS_SUMMARY_TO, key = process.env.RESEND_API_KEY;
  if (!to || !key) { log('No OPS_SUMMARY_TO or RESEND_API_KEY; summary not emailed.'); return; }
  // The daily job runs several times a morning; the email goes out once, after 6 am.
  const sentRef = db.collection(COLLECTIONS.health).doc('summary');
  if (calgaryMinutes(now) < 6 * 60) { log('Before 6 am; the summary waits for a later run.'); return; }
  if ((await sentRef.get()).get('sentFor') === calgaryDate(now)) { log('Summary already sent today.'); return; }
  const posts = (await db.collection(COLLECTIONS.posts).where('updatedAt', '>=', now - 14 * DAY).get()).docs.map(d => d.data() as OpsPost);
  const leads = (await db.collection(COLLECTIONS.leads).where('updatedAt', '>=', now - 30 * DAY).get()).docs.map(d => d.data() as PartnerLead);
  const count = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;

  const lines = [
    [count(posts, p => p.status === 'drafted'), 'posts waiting for your review'],
    [count(posts, p => p.status === 'approved'), 'approved posts scheduled'],
    [count(posts, p => p.status === 'published' && (p.publishedAt ?? 0) > now - DAY), 'posts published in the last 24 hours'],
    [count(posts, p => p.status === 'needs-correction'), 'published posts need a correction'],
    [count(posts, p => p.status === 'failed' || Boolean(p.error && p.status === 'approved')), 'posts failed or held'],
    [count(leads, l => l.status === 'ready' || l.status === 'follow-up-ready'), 'partner emails drafted for approval'],
    [count(leads, l => (l.status === 'replied' || l.status === 'interested') && !l.lastReply?.approved), 'business replies need you'],
    [count(leads, l => l.status === 'contacted' && (l.lastContactAt ?? 0) > now - DAY), 'partner emails sent in the last 24 hours'],
    [count(leads, l => l.status === 'approved'), 'partner emails queued for the next send window'],
  ] as const;
  const warnings = health.items.filter(i => !i.ok);
  const perf = (await db.collection(COLLECTIONS.health).doc('performance').get()).data() as OpsPerformance | undefined;
  const perfHtml = perf ? performanceHtml(perf, now) : '';
  const needsYou = lines[0][0] + lines[3][0] + lines[4][0] + lines[5][0] + lines[6][0];
  const subject = needsYou ? `CalgaryWatch ops: ${needsYou} thing${needsYou === 1 ? '' : 's'} need you` : 'CalgaryWatch ops: all quiet';
  const published = posts.filter(p => p.status === 'published' && p.permalink && (p.publishedAt ?? 0) > now - DAY);
  const upcoming = posts.filter(p => p.status === 'approved' && p.scheduledFor).sort((a, b) => a.scheduledFor! - b.scheduledFor!).slice(0, 8);
  const when = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#151515;max-width:560px">
<h2 style="font-family:'Bricolage Grotesque',Arial,sans-serif;margin:0 0 12px">${esc(subject)}</h2>
<ul style="padding-left:18px;line-height:1.6">${lines.filter(([n]) => n > 0).map(([n, t]) => `<li><strong>${n}</strong> ${t}</li>`).join('') || '<li>Nothing waiting.</li>'}</ul>
${published.length ? `<h3 style="margin:18px 0 6px">Posted in the last 24 hours</h3><ul style="padding-left:18px;line-height:1.6">${published.map(p => `<li><a href="${esc(p.permalink ?? '')}" style="color:#1554D1">${esc(p.imageText.headline)}</a> · ${p.brand === 'calgarydaily' ? '@calgarydaily' : '@calgarywatch'}</li>`).join('')}</ul>` : ''}
${upcoming.length ? `<h3 style="margin:18px 0 6px">Scheduled next</h3><ul style="padding-left:18px;line-height:1.6">${upcoming.map(p => `<li>${esc(when(p.scheduledFor!))} · ${esc(p.imageText.headline)}${p.reviewedByEmail?.startsWith('auto') ? ' (automatic)' : ''}</li>`).join('')}</ul>` : ''}
${warnings.length ? `<h3 style="margin:18px 0 6px">Health</h3><ul style="padding-left:18px;line-height:1.6">${warnings.map(w => `<li><strong>${esc(w.label)}:</strong> ${esc(w.detail)}</li>`).join('')}</ul>` : ''}
${perfHtml}
<p><a href="https://calgarywatch.ca/admin" style="color:#1554D1">Open the admin Operations page</a></p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.OPS_SUMMARY_FROM || 'CalgaryWatch Ops <digest@calgarywatch.ca>', to: [to], subject, html }),
  });
  if (res.ok) await sentRef.set({ sentFor: calgaryDate(now), at: now });
  log(res.ok ? `summary emailed to ${to}` : `summary failed: HTTP ${res.status} ${await res.text()}`);
}
