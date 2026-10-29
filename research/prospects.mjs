// One-off: Calgary businesses that list a public email on OpenStreetMap, plus each site's own description.
import { writeFileSync } from 'node:fs';
const q = `[out:json][timeout:240];(nwr["email"](50.84,-114.32,51.21,-113.86);nwr["contact:email"](50.84,-114.32,51.21,-113.86););out center tags;`;
let data;
for (const host of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
  try { const r = await fetch(host, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'CalgaryWatch research' } }); if (r.ok) { data = await r.json(); break; } console.log(host, r.status); } catch (e) { console.log(host, e.message); }
}
const rows = (data?.elements ?? []).map(e => ({ name: e.tags.name, email: e.tags.email ?? e.tags['contact:email'], website: e.tags.website ?? e.tags['contact:website'], kind: ['shop','amenity','craft','office','leisure','tourism','healthcare'].map(k => e.tags[k] ? `${k}=${e.tags[k]}` : null).filter(Boolean).join(','), addr: [e.tags['addr:housenumber'], e.tags['addr:street']].filter(Boolean).join(' ') })).filter(r => r.name && r.email);
console.log('osm rows', rows.length);
const meta = (html, keys) => { for (const k of keys) for (const t of html.match(/<meta\b[^>]*>/gi) ?? []) { const n = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(t)?.[1]?.toLowerCase(); const c = /content\s*=\s*["']([^"']*)["']/i.exec(t)?.[1]; if (n === k && c) return c.replace(/&amp;/g,'&').replace(/&#0?39;|&apos;/g,"'").replace(/&quot;/g,'"').trim(); } };
let i = 0;
await Promise.all(Array.from({ length: 10 }, async () => {
  while (i < rows.length) {
    const r = rows[i++]; if (!r.website) continue;
    try {
      const url = /^https?:/.test(r.website) ? r.website : 'https://' + r.website;
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'Mozilla/5.0' } });
      r.status = res.status;
      const html = (await res.text()).slice(0, 800000);
      r.title = /<title[^>]*>([^<]*)/i.exec(html)?.[1]?.trim();
      r.desc = meta(html, ['description', 'og:description', 'twitter:description']);
      r.siteEmails = [...new Set((html.match(/[\w.+-]+@[\w-]+\.[a-z.]{2,}/gi) ?? []).filter(e => !/\.(png|jpg|webp|svg|gif)$/i.test(e)))].slice(0, 5);
    } catch (e) { r.status = String(e.message).slice(0, 60); }
  }
}));
writeFileSync('research/prospects.json', JSON.stringify(rows, null, 1));
