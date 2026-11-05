import { readFileSync, writeFileSync } from 'node:fs';
const [,, inFile, outFile] = process.argv;
const uniq = JSON.parse(readFileSync(inFile, 'utf8'));
const meta = (html, keys) => { for (const k of keys) for (const t of html.match(/<meta\b[^>]*>/gi) ?? []) { const n = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(t)?.[1]?.toLowerCase(); const c = /content\s*=\s*["']([^"']*)["']/i.exec(t)?.[1]; if (n === k && c) return c.replace(/&amp;/g,'&').replace(/&#0?39;|&apos;/g,"'").replace(/&quot;/g,'"').trim(); } };
const emailsIn = html => [...new Set(((html.replace(/&#64;|\[at\]|\(at\)/gi, '@')).match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi) ?? []).map(e => e.toLowerCase()).filter(e => !/\.(png|jpe?g|webp|svg|gif|css|js)$/i.test(e) && !/sentry|wixpress|example\.|domain\.com|godaddy|squarespace|@2x|yourdomain|email\.com$/.test(e)))];
const get = async url => { const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'Mozilla/5.0' } }); return { status: res.status, html: (await res.text()).slice(0, 800000), url: res.url }; };
let i = 0, done = 0;
await Promise.all(Array.from({ length: 24 }, async () => {
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
      r.booking = /janeapp|fresha|vagaro|mindbody|acuityscheduling|calendly|booksy|gettimely|squareup\.com\/appointments|book\.squareup|opentable|resy\.com|exploretock|setmore|schedulicity|glossgenius|noterro|clinicsense|book now|book online|book an appointment|online booking|reserve a table|reservations?/.test(low);
      r.ordering = /order online|online ordering|skipthedishes|doordash|ubereats|toasttab|clover\.com\/online|order now/.test(low);
      const yrs = [...low.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(20\d\d)/g)].map(m => +m[1]);
      r.copyright = yrs.length ? Math.max(...yrs) : null;
      r.viewport = /<meta[^>]+name=["']viewport/i.test(h);
      r.phoneOnly = /call (us )?to book|call to make an appointment|book by phone|call or text to book|to book,? (please )?call|phone to book/.test(low);
      let found = emailsIn(home.html);
      if (!found.length) {
        const link = /href=["']([^"']*contact[^"']*)["']/i.exec(home.html)?.[1];
        const cands = [link ? new URL(link, home.url).href : null, new URL('/contact', home.url).href, new URL('/contact-us', home.url).href].filter(Boolean);
        for (const c of [...new Set(cands)]) { try { const p = await get(c); if (p.status === 200) { found = emailsIn(p.html); if (found.length) { r.contactPage = c; break; } } } catch {} }
      }
      r.siteEmails = found.slice(0, 6);
    } catch (e) { r.status = String(e.message).slice(0, 60); }
    if (++done % 100 === 0) console.log(done);
  }
}));
writeFileSync(outFile, JSON.stringify(uniq, null, 1));
console.log('with site emails', uniq.filter(r => r.siteEmails?.length).length);
