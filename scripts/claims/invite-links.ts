/**
 * Personal claim links for a manual outreach batch (Outlook). Offline: no
 * Firestore, no mail. Each link opens the organizer's claim page greeting
 * them, with their work email filled in, so their organizer account is made
 * with the address we wrote to. Format and rules: src/lib/claimInvite.ts.
 *
 *   npm run claims:invite -- --entity biz-vertigo-theatre --email kendra@vertigotheatre.com --name "Kendra Hutchinson"
 *   npm run claims:invite -- --csv batch.csv        (columns: entityId,email,name; header row optional)
 *
 * --via names the batch (default "outlook"); it is recorded on accounts made from the link.
 */
import { readFileSync } from 'node:fs';
import { personalClaimUrl } from '../../src/lib/claimInvite';

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const via = opt('via') ?? 'outlook';

/** Minimal CSV: quoted fields with commas are enough for names like "Smith, Jo". */
function cells(line: string): string[] {
  const out: string[] = []; let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const rows: Array<{ entityId: string; email?: string; name?: string }> = [];
const csv = opt('csv');
if (csv) {
  for (const line of readFileSync(csv, 'utf8').split(/\r?\n/).filter(l => l.trim())) {
    const [entityId, email, name] = cells(line);
    if (/^entity/i.test(entityId)) continue;
    rows.push({ entityId, email, name });
  }
} else if (opt('entity')) rows.push({ entityId: opt('entity')!, email: opt('email'), name: opt('name') });

if (!rows.length) {
  console.error('Give --entity <id> [--email --name] or --csv <file>.');
  process.exitCode = 1;
}
for (const r of rows) {
  const url = personalClaimUrl(r.entityId, { email: r.email, name: r.name, via });
  console.log(csv ? `${r.entityId},${r.email ?? ''},${url}` : url);
}
