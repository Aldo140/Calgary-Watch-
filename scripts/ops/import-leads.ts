// Import businesses that were contacted before the agent existed, so nobody is
// pitched twice and every earlier opt-out is honoured.
//
//   FIREBASE_SERVICE_ACCOUNT=... npm run ops:import-leads -- contacts.csv [--write]
//
// CSV header (any order; extra columns ignored):
//   businessName,email,website,status,lastContactAt,notes
// status: contacted | replied | interested | not-interested | do-not-contact | partner
// lastContactAt: YYYY-MM-DD. Without --write it only prints what it would do.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { LeadStatus, PartnerLead } from '../../src/types/ops';
import { COLLECTIONS, opsDb } from './lib/firebase';
import { normalizeEmail } from './lib/leads';
import { suppressionId } from './jobs/outreach';

const [file] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const write = process.argv.includes('--write');
if (!file) { console.error('Usage: npm run ops:import-leads -- contacts.csv [--write]'); process.exit(1); }

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(x => x.trim()));
  const keys = head.map(h => h.trim());
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const STATUSES: LeadStatus[] = ['contacted', 'replied', 'interested', 'not-interested', 'do-not-contact', 'partner'];
const rows = parseCsv(await readFile(file, 'utf8'));
const db = write ? opsDb() : null;
const now = Date.now();
let n = 0;

for (const r of rows) {
  const email = r.email ? normalizeEmail(r.email) : null;
  if (!r.businessName || !email) { console.log(`skip (needs businessName and email): ${JSON.stringify(r)}`); continue; }
  const status = (STATUSES.includes(r.status as LeadStatus) ? r.status : 'contacted') as LeadStatus;
  const at = r.lastContactAt ? Date.parse(`${r.lastContactAt}T12:00:00-06:00`) : now;
  const id = `import-${createHash('sha256').update(email).digest('hex').slice(0, 16)}`;
  const dnc = status === 'do-not-contact';
  const lead: PartnerLead = {
    id, entityId: null, entityKind: null, businessName: r.businessName, category: 'business', neighbourhood: '', website: r.website || null,
    contactName: null, contactRole: null, contactEmail: email, emailSourceUrl: null, emailFoundAt: null, consentBasis: null,
    noSolicitationNotice: false, reasonRelevant: '', status, draftSubject: '', draftBody: '', followUps: 1, lastContactAt: at,
    // Imported conversations are never followed up automatically.
    nextFollowUpAt: null, conversationId: null, lastReply: null, doNotContact: dnc, notes: r.notes ?? '',
    importedFrom: file, history: [{ at: now, type: 'imported', summary: `Imported from ${file}: ${status}, last contact ${r.lastContactAt || 'unknown'}.` }],
    createdAt: now, updatedAt: now,
  };
  console.log(`${write ? 'import' : 'would import'}: ${r.businessName} <${email}> as ${status}${dnc ? ' + suppression' : ''}`);
  if (db) {
    await db.collection(COLLECTIONS.leads).doc(id).set(lead, { merge: true });
    if (dnc) await db.collection(COLLECTIONS.suppression).doc(suppressionId(email)).set({ email, reason: 'Imported opt-out', leadId: id, at: now });
  }
  n++;
}
console.log(`${n} rows ${write ? 'imported' : 'checked (dry run; add --write)'}.`);
