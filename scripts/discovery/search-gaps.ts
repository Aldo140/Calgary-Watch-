/**
 * Search gaps: which "Looked for, not found" terms search answers today, and
 * which still need someone to check whether they are a real Calgary
 * organization that deserves a profile (docs/search-gap-profiles.md).
 *
 *   npm run search:gaps -- madigan altafor "herringer kiss gallery"
 *   pbpaste | npm run search:gaps        # the admin panel, pasted as-is
 *
 * It never writes a profile. Profiles are added by hand to
 * src/content/editorial-inventory.json once the organization is confirmed.
 */
import { discoveryRepository } from '../../src/data/discovery';
import { entityPath } from '../../src/lib/discovery';
import { searchListings } from '../../src/lib/listingSearch';
import { bareStreetGuess, describeAnswer, parseSearchIntent, streetLookupUrls, summarizeStreetRows } from '../../src/lib/searchIntent';

/** Terms from args, or from pasted text: admin links ("search?q=…"), else one term per line. */
export function readTerms(args: string[], pasted: string): string[] {
  if (args.length) return [...new Set(args.map(a => a.trim().toLowerCase()).filter(Boolean))];
  const fromLinks = [...pasted.matchAll(/search\?q=([^)\s]+)/g)].map(m => decodeURIComponent(m[1]));
  const terms = fromLinks.length ? fromLinks : pasted.split('\n');
  return [...new Set(terms.map(t => t.trim().toLowerCase()).filter(Boolean))];
}

/** A lone word may be a street ("madigan"); search shows it only when the City's register has it. */
async function registerStreet(q: string): Promise<{ answer?: string; unchecked?: boolean }> {
  const guess = bareStreetGuess(parseSearchIntent(q), q);
  if (!guess) return {};
  try {
    for (const url of streetLookupUrls(guess)) {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return { unchecked: true };
      const answer = summarizeStreetRows(await res.json(), guess);
      if (answer) return { answer: `Street: ${answer.street}, ${answer.community}` };
    }
  } catch { return { unchecked: true }; }
  return {};
}

async function main() {
  const args = process.argv.slice(2);
  const pasted = args.length || process.stdin.isTTY ? '' : await new Promise<string>(done => { let s = ''; process.stdin.on('data', c => { s += c; }).on('end', () => done(s)); });
  const terms = readTerms(args, pasted);
  if (!terms.length) { console.error('Give terms as arguments or paste the admin panel on stdin.'); process.exit(1); }
  const all = discoveryRepository.list();
  const occurrences = discoveryRepository.occurrences();
  const check: string[] = [];
  for (const q of terms) {
    const found = searchListings(all, occurrences, q);
    const hit = found.partial ? undefined : Object.values(found.groups).flat()[0];
    const known = describeAnswer(parseSearchIntent(q)) ?? (hit ? `${hit.title} (${entityPath(hit)})` : null);
    const street = known ? {} : await registerStreet(q);
    const answer = known ?? street.answer;
    if (answer) console.log(`answered  ${q}  →  ${answer}`);
    else { console.log(`CHECK     ${q}${street.unchecked ? '  (may be a street: the City register could not be reached from here)' : ''}`); check.push(q); }
  }
  if (check.length) {
    console.log(`\n${check.length} to check. For each: is it a real organization, confirmed on its own site, operating in Calgary, with no profile yet?`);
    console.log('If yes, add a profile by docs/search-gap-profiles.md. If not (a person, a typo, a place outside Calgary), leave it.');
    for (const q of check) console.log(`  https://www.google.com/search?q=${encodeURIComponent(`"${q}" Calgary`)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
