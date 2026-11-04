// One-off: independent Calgary businesses on OpenStreetMap that have a website but no brand tag.
// Reads the homepage and a contact page and keeps emails published on the business's own site.
import { writeFileSync } from 'node:fs';
const bb = '(50.84,-114.32,51.21,-113.86)';
const kinds = [
  'amenity~"^(restaurant|cafe|bar|pub|ice_cream|veterinary|spa)$"',
  'shop~"^(bakery|books|gift|clothes|boutique|jewelry|florist|art|music|musical_instrument|antiques|second_hand|deli|cheese|chocolate|confectionery|tea|coffee|wine|alcohol|beauty|hairdresser|cosmetics|optician|bicycle|outdoor|sports|toys|games|video_games|hobby|craft|fabric|frame|furniture|interior_decoration|houseware|kitchen|pet|pet_grooming|shoes|tattoo|massage|stationery|photo|butcher|seafood|farm|health_food|herbalist|nutrition_supplements|tailor|dry_cleaning|watches|bag|leather|perfumery|anime|comic|record)$"',
  'healthcare~"^(physiotherapist|chiropractor|massage|psychotherapist|optometrist|podiatrist|alternative)$"', 'shop~"^(nails|spa|tanning|piercing|hairdresser_supply|wool|candles|party|variety_store)$"', 'leisure~"^(sauna|spa)$"',
  'tourism~"^(gallery|museum)$"', 'leisure~"^(escape_game|amusement_arcade|bowling_alley)$"', 'craft~"^(brewery|distillery|winery|jeweller|tailor)$"',
];
const parts = kinds.map(k => `nwr[${k}]["website"][!"brand"]${bb};nwr[${k}]["contact:website"][!"brand"]${bb};`).join('');
const q = `[out:json][timeout:240];(${parts});out center tags;`;
let data;
for (const host of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
  try { const r = await fetch(host, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'CalgaryWatch research' } }); if (r.ok) { data = await r.json(); break; } console.log(host, r.status); } catch (e) { console.log(host, e.message); }
}
const rows = (data?.elements ?? []).map(e => ({ name: e.tags.name, osmEmail: e.tags.email ?? e.tags['contact:email'], website: e.tags.website ?? e.tags['contact:website'], kind: ['shop','amenity','craft','office','leisure','tourism','healthcare'].map(k => e.tags[k] ? `${k}=${e.tags[k]}` : null).filter(Boolean).join(','), addr: [e.tags['addr:housenumber'], e.tags['addr:street']].filter(Boolean).join(' '), cuisine: e.tags.cuisine })).filter(r => r.name && r.website);
const seen = new Set(); const uniq = rows.filter(r => { const k = r.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].toLowerCase(); if (seen.has(k)) return false; seen.add(k); r.host = k; return true; });
console.log('osm rows', rows.length, 'unique sites', uniq.length);
const meta = (html, keys) => { for (const k of keys) for (const t of html.match(/<meta\b[^>]*>/gi) ?? []) { const n = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(t)?.[1]?.toLowerCase(); const c = /content\s*=\s*["']([^"']*)["']/i.exec(t)?.[1]; if (n === k && c) return c.replace(/&amp;/g,'&').replace(/&#0?39;|&apos;/g,"'").replace(/&quot;/g,'"').trim(); } };
const emailsIn = html => [...new Set(((html.replace(/&#64;|\[at\]|\(at\)/gi, '@')).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi) ?? []).map(e => e.toLowerCase()).filter(e => !/\.(png|jpe?g|webp|svg|gif|css|js)$/i.test(e) && !/sentry|wixpress|example\.|domain\.com|godaddy|squarespace|@2x/.test(e)))];
const get = async url => { const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'Mozilla/5.0' } }); return { status: res.status, html: (await res.text()).slice(0, 800000), url: res.url }; };
let i = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (i < uniq.length) {
    const r = uniq[i++];
    try {
      const url = /^https?:/.test(r.website) ? r.website : 'https://' + r.website;
      const home = await get(url);
      r.status = home.status;
      r.title = /<title[^>]*>([^<]*)/i.exec(home.html)?.[1]?.trim();
      r.desc = meta(home.html, ['description', 'og:description', 'twitter:description']);
      const h = home.html, low = h.toLowerCase();
      r.https = home.url.startsWith('https:');
      r.platform = /wix\.com|wixstatic/.test(low) ? 'wix' : /squarespace/.test(low) ? 'squarespace' : /shopify/.test(low) ? 'shopify' : /wp-content|wordpress/.test(low) ? 'wordpress' : /godaddy|websitebuilder|img1\.wsimg/.test(low) ? 'godaddy' : /weebly/.test(low) ? 'weebly' : 'other';
      r.giftCards = /gift ?cards?|gift-cards?|giftcard|gift certificates?|giftup|giftfly|square\.(?:site|link)\/gift|squareup\.com\/gift|clover\.com\/gift/.test(low);
      r.booking = /janeapp|fresha|vagaro|mindbody|acuityscheduling|calendly|booksy|gettimely|square\.site|squareup\.com\/appointments|book\.squareup|opentable|resy\.com|exploretock|setmore|schedulicity|glossgenius|noterro|clinicsense|book now|book online|book an appointment|online booking|reserve a table|reservations?/.test(low);
      r.ordering = /order online|online ordering|skipthedishes|doordash|ubereats|toasttab|clover\.com\/online|order now/.test(low);
      r.viewport = /<meta[^>]+name=["']viewport/i.test(h);
      const yrs = [...low.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(20\d\d)/g)].map(m => +m[1]);
      r.copyright = yrs.length ? Math.max(...yrs) : null;
      r.instagram = /instagram\.com\//.test(low);
      r.bytes = h.length;
      let found = emailsIn(home.html);
      if (!found.length) {
        const link = /href=["']([^"']*contact[^"']*)["']/i.exec(home.html)?.[1];
        const cands = [link ? new URL(link, home.url).href : null, new URL('/contact', home.url).href, new URL('/contact-us', home.url).href].filter(Boolean);
        for (const c of [...new Set(cands)]) { try { const p = await get(c); if (p.status === 200) { found = emailsIn(p.html); if (found.length) { r.contactPage = c; break; } } } catch {} }
      }
      r.siteEmails = found.slice(0, 6);
    } catch (e) { r.status = String(e.message).slice(0, 60); }
  }
}));
const out = uniq.filter(r => r.siteEmails?.length);
console.log('with site emails', out.length);
writeFileSync('research/prospects3.json', JSON.stringify(out, null, 1));
