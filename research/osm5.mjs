// One-off: unbranded businesses with a website in Alberta towns outside Calgary, minus domains already emailed.
import { readFileSync, writeFileSync } from 'node:fs';
const areas = { Canmore: '(51.06,-115.42,51.12,-115.30)', Banff: '(51.16,-115.60,51.20,-115.54)', Cochrane: '(51.16,-114.52,51.22,-114.42)', Okotoks: '(50.70,-113.99,50.75,-113.93)', 'High River': '(50.56,-113.90,50.60,-113.84)', Airdrie: '(51.25,-114.05,51.32,-113.95)', Strathmore: '(51.02,-113.42,51.06,-113.36)', 'Red Deer': '(52.22,-113.89,52.32,-113.74)', Lethbridge: '(49.64,-112.90,49.74,-112.76)', Edmonton: '(53.43,-113.65,53.62,-113.38)' };
const known = new Set(readFileSync('research/known_domains5.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean));
const keys = ['shop', 'amenity', 'craft', 'healthcare', 'leisure', 'tourism', 'office', 'beauty'];
const host = w => { try { return new URL(/^https?:/.test(w) ? w : 'https://' + w).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; } };
const out = [];
for (const [town, bb] of Object.entries(areas)) {
  const parts = keys.flatMap(k => ['website', 'contact:website'].map(t => `nwr["${k}"]["${t}"][!"brand"]${bb};`)).join('');
  const q = `[out:json][timeout:240];(${parts});out center tags;`;
  let data;
  for (const h of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
    try { const r = await fetch(h, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'CalgaryWatch research' } }); if (r.ok) { data = await r.json(); break; } console.log(town, h, r.status); } catch (e) { console.log(town, h, e.message); }
  }
  const rows = (data?.elements ?? []).map(e => ({ town, name: e.tags.name, website: e.tags.website ?? e.tags['contact:website'], email: e.tags.email ?? e.tags['contact:email'], kind: keys.map(k => e.tags[k] ? `${k}=${e.tags[k]}` : null).filter(Boolean).join(','), addr: [e.tags['addr:housenumber'], e.tags['addr:street']].filter(Boolean).join(' '), cuisine: e.tags.cuisine })).filter(r => r.name && r.website);
  console.log(town, rows.length);
  out.push(...rows);
}
const seen = new Set();
const uniq = out.filter(r => { const h = host(r.website); if (!h || known.has(h) || seen.has(h) || /facebook|instagram|google|linktr|yelp|tripadvisor|gov\.ab|alberta\.ca|\.gc\.ca/.test(h)) return false; seen.add(h); r.host = h; return true; });
console.log('unique new hosts', uniq.length);
writeFileSync('research/toscan5.json', JSON.stringify(uniq));
