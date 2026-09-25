// Daily health check and the morning summary email to the founder.

import type { Firestore } from 'firebase-admin/firestore';
import type { OpsHealth, OpsPost, PartnerLead } from '../../../src/types/ops';
import { BRANDS, brandKit } from '../lib/brand';
import { claudeConfigured } from '../lib/claude';
import { COLLECTIONS } from '../lib/firebase';
import { igAccount, igToken, tokenExpiry } from '../lib/instagram';
import { outlookConfigured } from '../lib/outlook';
import { happenings, type DiscoveryIndex } from '../lib/posts';

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
    const kit = brandKit(brand), token = igToken(brand);
    if (!kit.confirmed) items.push({ id: `kit-${brand}`, label: `${kit.name} brand kit`, ok: false, detail: kit.confirmNote ?? 'Provisional.' });
    if (!token) { items.push({ id: `ig-${brand}`, label: `Instagram ${kit.name}`, ok: false, detail: 'Not connected yet.' }); continue; }
    try {
      const account = await igAccount(token, kit.handle);
      const exp = await tokenExpiry(token);
      const days = exp ? Math.floor((exp - now) / DAY) : null;
      items.push({ id: `ig-${brand}`, label: `Instagram ${kit.name}`, ok: days === null || days > 10, detail: `@${account.username} connected; ${days === null ? 'token does not expire.' : `token expires in ${days} days.`}` });
    } catch (e) {
      items.push({ id: `ig-${brand}`, label: `Instagram ${kit.name}`, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  items.push({ id: 'claude', label: 'Drafting (Claude)', ok: claudeConfigured(), detail: claudeConfigured() ? 'Connected.' : 'No ANTHROPIC_API_KEY; drafts use fixed templates.' });
  items.push({ id: 'outlook', label: 'Outreach mailbox', ok: outlookConfigured(), detail: outlookConfigured() ? 'Connected.' : 'Microsoft Graph app not configured; approved emails wait.' });

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

export async function sendSummary(db: Firestore, health: OpsHealth, now: number, log: Log): Promise<void> {
  const to = process.env.OPS_SUMMARY_TO, key = process.env.RESEND_API_KEY;
  if (!to || !key) { log('No OPS_SUMMARY_TO or RESEND_API_KEY; summary not emailed.'); return; }
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
  ] as const;
  const warnings = health.items.filter(i => !i.ok);
  const needsYou = lines[0][0] + lines[3][0] + lines[4][0] + lines[5][0] + lines[6][0];
  const subject = needsYou ? `CalgaryWatch ops: ${needsYou} thing${needsYou === 1 ? '' : 's'} need you` : 'CalgaryWatch ops: all quiet';
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#151515;max-width:560px">
<h2 style="font-family:'Bricolage Grotesque',Arial,sans-serif;margin:0 0 12px">${esc(subject)}</h2>
<ul style="padding-left:18px;line-height:1.6">${lines.filter(([n]) => n > 0).map(([n, t]) => `<li><strong>${n}</strong> ${t}</li>`).join('') || '<li>Nothing waiting.</li>'}</ul>
${warnings.length ? `<h3 style="margin:18px 0 6px">Health</h3><ul style="padding-left:18px;line-height:1.6">${warnings.map(w => `<li><strong>${esc(w.label)}:</strong> ${esc(w.detail)}</li>`).join('')}</ul>` : ''}
<p><a href="https://calgarywatch.ca/admin" style="color:#1554D1">Open the admin Operations page</a></p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.OPS_SUMMARY_FROM || 'CalgaryWatch Ops <digest@calgarywatch.ca>', to: [to], subject, html }),
  });
  log(res.ok ? `summary emailed to ${to}` : `summary failed: HTTP ${res.status} ${await res.text()}`);
}
