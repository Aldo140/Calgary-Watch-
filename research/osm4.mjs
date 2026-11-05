// One-off: dump every unbranded business with a website or email in Calgary and nearby towns.
import { writeFileSync } from 'node:fs';
const bb = '(50.70,-114.50,51.32,-113.78)';
const keys = ['shop', 'amenity', 'craft', 'healthcare', 'leisure', 'tourism', 'office'];
const parts = keys.flatMap(k => ['website', 'contact:website', 'email', 'contact:email'].map(t => `nwr["${k}"]["${t}"][!"brand"]${bb};`)).join('');
const q = `[out:json][timeout:300];(${parts});out center tags;`;
let data;
for (const host of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
  try { const r = await fetch(host, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'CalgaryWatch research' } }); if (r.ok) { data = await r.json(); break; } console.log(host, r.status); } catch (e) { console.log(host, e.message); }
}
const rows = (data?.elements ?? []).map(e => ({ name: e.tags.name, email: e.tags.email ?? e.tags['contact:email'], website: e.tags.website ?? e.tags['contact:website'], kind: keys.map(k => e.tags[k] ? `${k}=${e.tags[k]}` : null).filter(Boolean).join(','), addr: [e.tags['addr:housenumber'], e.tags['addr:street']].filter(Boolean).join(' '), city: e.tags['addr:city'], cuisine: e.tags.cuisine, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon })).filter(r => r.name);
console.log('rows', rows.length);
writeFileSync('research/osm4.json', JSON.stringify(rows));
