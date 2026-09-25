// Partner outreach jobs. Nothing is ever sent without a reviewer approving the
// exact message in the admin Partners workspace; "stop" replies are honoured
// automatically and permanently through the suppression list.

import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { LeadEvent, PartnerLead, ReplyClass } from '../../../src/types/ops';
import { outreachConfig } from '../lib/brand';
import { claudeConfigured, classifyReply, writePitch } from '../lib/claude';
import { COLLECTIONS } from '../lib/firebase';
import {
  LEAD_KINDS, checkPitch, consentBasisFor, emailDomain, extractEmails, hasNoSolicitationNotice, hostOf,
  inSendWindow, isStopRequest, leadIdFor, normalizeEmail, sendBlocker, signature, websiteFor,
} from '../lib/leads';
import { inboxSince, outlookConfigured, replyInThread, sendNew } from '../lib/outlook';
import type { DiscoveryIndex, Entity } from '../lib/posts';
import { calgaryDate } from '../lib/time';

type Log = (m: string) => void;
const DAY = 86_400_000;
const cfg = outreachConfig();
const event = (type: LeadEvent['type'], summary: string): LeadEvent => ({ at: Date.now(), type, summary });
const push = (e: LeadEvent) => FieldValue.arrayUnion(e);
export const suppressionId = (email: string) => createHash('sha256').update(normalizeEmail(email)).digest('hex').slice(0, 32);

function mailingAddress(): string {
  const a = process.env.DIGEST_MAILING_ADDRESS ?? '';
  if (!a || /street|postal code|your/i.test(a)) throw new Error('DIGEST_MAILING_ADDRESS must be a real mailing address (CASL).');
  return a;
}

function factsFor(e: Entity): string {
  return [
    `Listing: ${e.title} (${e.kind}) — https://calgarywatch.ca/${e.kind === 'market' ? 'markets' : 'local'}/${e.slug}`,
    e.summary && `Summary: ${e.summary}`,
    e.address && `Address: ${e.address}`,
    e.neighbourhood && `Neighbourhood: ${e.neighbourhood}`,
    e.schedule && `Schedule: ${typeof e.schedule === 'string' ? e.schedule : JSON.stringify(e.schedule)}`,
    e.sources?.[0]?.url && `Official source we link to: ${e.sources[0].url}`,
  ].filter(Boolean).join('\n');
}

export function templatePitch(lead: PartnerLead, facts: string, sig: string): { subject: string; body: string; reasonRelevant: string } {
  const listing = facts.split('\n')[0].replace(/^Listing: /, '');
  return {
    subject: `CalgaryWatch has listed ${lead.businessName}`,
    body: `Hello ${lead.businessName} team,\n\nI'm Aldo, and I run CalgaryWatch, a free Calgary guide to events, markets and local businesses. We've added ${listing.split(' (')[0]} using the details on your own website, and the listing links straight back to you.\n\nCould you take a quick look and tell me if anything is wrong or missing? You're also welcome to send schedule changes, cancellations or photos you'd like us to use.\n\nThe listing is free and always will be.\n\n${sig}`,
    reasonRelevant: `The message is about ${lead.businessName}'s own listing on CalgaryWatch.`,
  };
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'CalgaryWatchBot/1.0 (+https://calgarywatch.ca)' }, signal: AbortSignal.timeout(15_000), redirect: 'follow' });
    if (!res.ok || !/text\/html/.test(res.headers.get('content-type') ?? '')) return null;
    return (await res.text()).slice(0, 2_000_000);
  } catch { return null; }
}

async function loadSuppression(db: Firestore): Promise<{ emails: Set<string>; domains: Set<string> }> {
  const emails = new Set<string>(), domains = new Set<string>();
  (await db.collection(COLLECTIONS.suppression).get()).forEach(d => {
    if (d.get('email')) emails.add(normalizeEmail(d.get('email')));
    if (d.get('domain')) domains.add(String(d.get('domain')).toLowerCase());
  });
  return { emails, domains };
}

/** New leads come only from businesses and markets already listed on the site. */
export async function findLeads(db: Firestore, index: DiscoveryIndex, now: number, log: Log): Promise<void> {
  const existing = new Set((await db.collection(COLLECTIONS.leads).select().get()).docs.map(d => d.id));
  for (const e of index.entities) {
    if (!LEAD_KINDS.has(e.kind) || e.status !== 'published' || e.fixture || existing.has(leadIdFor(e))) continue;
    const lead: PartnerLead = {
      id: leadIdFor(e), entityId: e.id, entityKind: e.kind, businessName: e.name ?? e.title,
      category: e.categories?.[0] ?? e.kind, neighbourhood: e.neighbourhood ?? '', website: websiteFor(e),
      contactName: null, contactRole: null, contactEmail: null, emailSourceUrl: null, emailFoundAt: null,
      consentBasis: null, noSolicitationNotice: false, reasonRelevant: '', status: 'new', draftSubject: '', draftBody: '',
      followUps: 0, lastContactAt: null, nextFollowUpAt: null, conversationId: null, lastReply: null,
      doNotContact: false, notes: '', history: [event('found', `Listed on CalgaryWatch as a ${e.kind}.`)],
      createdAt: now, updatedAt: now,
    };
    await db.collection(COLLECTIONS.leads).doc(lead.id).create(lead).catch(() => undefined);
    log(`lead found: ${lead.businessName}`);
  }
}

/** Research new leads and draft first emails and follow-ups for review. */
export async function draftPitches(db: Firestore, index: DiscoveryIndex, now: number, log: Log): Promise<void> {
  const address = mailingAddress();
  const sig = signature(cfg, address);
  const sup = await loadSuppression(db);
  const byId = new Map(index.entities.map(e => [e.id, e]));

  // Anyone already contacted under another lead (including imported history) is never pitched twice.
  const contactedBy = new Map<string, string>();
  (await db.collection(COLLECTIONS.leads).where('status', 'not-in', ['new', 'no-email']).get()).forEach(d => {
    const e = d.get('contactEmail');
    if (e) { contactedBy.set(normalizeEmail(e), d.id); contactedBy.set(`@${emailDomain(e)}`, d.id); }
  });
  const alreadyContacted = (id: string, email: string) => {
    const other = contactedBy.get(normalizeEmail(email)) ?? (/gmail|outlook|hotmail|yahoo|icloud|shaw|telus/.test(emailDomain(email)) ? undefined : contactedBy.get(`@${emailDomain(email)}`));
    return other && other !== id ? other : null;
  };

  const fresh = (await db.collection(COLLECTIONS.leads).where('status', '==', 'new').limit(10).get()).docs;
  for (const doc of fresh) {
    const lead = doc.data() as PartnerLead;
    const entity = lead.entityId ? byId.get(lead.entityId) : undefined;
    let found: { email: string; url: string } | null = null, notice = false;
    if (lead.contactEmail && lead.emailSourceUrl) {
      // Entered by hand in the admin: still confirm the address is on that page and there's no notice.
      const email = normalizeEmail(lead.contactEmail);
      const html = await fetchText(lead.emailSourceUrl);
      if (html && hasNoSolicitationNotice(html.replace(/<[^>]+>/g, ' '), cfg)) notice = true;
      else if (sup.emails.has(email) || sup.domains.has(emailDomain(email))) {
        await doc.ref.update({ status: 'do-not-contact', doNotContact: true, updatedAt: now, history: push(event('status', 'Address is on the suppression list.')) });
        continue;
      } else if (html && extractEmails(html, hostOf(lead.emailSourceUrl)).includes(email)) found = { email, url: lead.emailSourceUrl };
      else {
        await doc.ref.update({ status: 'no-email', notes: `${email} was not found on ${lead.emailSourceUrl}; CASL implied consent needs the address to be published there.`, updatedAt: now });
        continue;
      }
    } else {
      if (!lead.website) { await doc.ref.update({ status: 'no-email', notes: 'No website on file.', updatedAt: now }); continue; }
      const host = hostOf(lead.website);
      const pages = [lead.website, ...['contact', 'contact-us', 'about', 'about-us'].map(p => new URL(p, lead.website!).href)];
      for (const url of pages) {
        const html = await fetchText(url);
        if (!html) continue;
        const text = html.replace(/<[^>]+>/g, ' ');
        if (hasNoSolicitationNotice(text, cfg)) { notice = true; break; }
        const email = extractEmails(html, host).find(e => !sup.emails.has(e) && !sup.domains.has(emailDomain(e)));
        if (email && !found) found = { email, url };
      }
    }
    const host = hostOf(lead.website ?? found?.url ?? '');
    if (notice) {
      await doc.ref.update({ status: 'blocked', noSolicitationNotice: true, updatedAt: now, history: push(event('status', 'Blocked: the website asks not to be solicited.')) });
      log(`blocked (no-solicitation notice): ${lead.businessName}`);
      continue;
    }
    if (!found) {
      await doc.ref.update({ status: 'no-email', notes: `No published address found on ${host}. Try the site's contact form by hand.`, updatedAt: now });
      log(`no email: ${lead.businessName}`);
      continue;
    }

    const dup = alreadyContacted(lead.id, found.email);
    if (dup) {
      await doc.ref.update({ status: 'blocked', contactEmail: found.email, notes: `Already contacted under ${dup}; not pitching twice.`, updatedAt: now });
      log(`already contacted: ${lead.businessName} (${dup})`);
      continue;
    }

    const facts = entity ? factsFor(entity) : `Business: ${lead.businessName}`;
    const withEmail: PartnerLead = { ...lead, contactEmail: found.email };
    let pitch = templatePitch(withEmail, facts, sig);
    const warnings: string[] = [];
    if (claudeConfigured()) {
      try {
        const w = await writePitch(cfg, { businessName: lead.businessName, category: lead.category, neighbourhood: lead.neighbourhood, facts, followUp: false }, sig);
        const problems = checkPitch(w.body, cfg, address);
        if (problems.length) warnings.push(`Claude's draft was replaced by the template: ${problems.join(' ')}`); else pitch = w;
      } catch (e) { warnings.push(`Template draft; Claude failed: ${e instanceof Error ? e.message : e}`); }
    }
    const problems = checkPitch(pitch.body, cfg, address);
    await doc.ref.update({
      contactEmail: found.email, emailSourceUrl: found.url, emailFoundAt: now, consentBasis: consentBasisFor(found.url),
      reasonRelevant: pitch.reasonRelevant, draftSubject: pitch.subject, draftBody: pitch.body,
      status: problems.length ? 'blocked' : 'ready', notes: [...warnings, ...problems].join(' '), updatedAt: now,
      history: push(event('drafted', `First email drafted to ${found.email} (address found at ${found.url}).`)),
    });
    log(`pitch ready: ${lead.businessName} → ${found.email}`);
  }

  // Follow-ups: one, after the configured wait, only if they never answered.
  const contacted = (await db.collection(COLLECTIONS.leads).where('status', '==', 'contacted').get()).docs;
  for (const doc of contacted) {
    const lead = doc.data() as PartnerLead;
    if (!lead.nextFollowUpAt || lead.nextFollowUpAt > now) continue;
    if (lead.followUps >= cfg.limits.maxFollowUps) {
      await doc.ref.update({ status: 'no-response', nextFollowUpAt: null, updatedAt: now, history: push(event('status', 'No reply after follow-up; closed.')) });
      continue;
    }
    let body = `Hello again,\n\nJust following up on my note about ${lead.businessName}'s listing on CalgaryWatch. If anything needs changing, a one-line reply is plenty.\n\n${sig}`;
    if (claudeConfigured()) {
      try {
        const w = await writePitch(cfg, { businessName: lead.businessName, category: lead.category, neighbourhood: lead.neighbourhood, facts: '', followUp: true, previous: lead.draftBody }, sig);
        if (!checkPitch(w.body, cfg, address).length) body = w.body;
      } catch { /* keep the template follow-up */ }
    }
    await doc.ref.update({ status: 'follow-up-ready', draftSubject: `Re: ${lead.draftSubject.replace(/^Re:\s*/i, '')}`, draftBody: body, updatedAt: now, history: push(event('drafted', 'Follow-up drafted.')) });
    log(`follow-up ready: ${lead.businessName}`);
  }
}

/** Send approved first emails and follow-ups (within the send window), and approved replies (any time). */
export async function sendApproved(db: Firestore, now: number, log: Log): Promise<void> {
  if (!outlookConfigured()) { log('Outlook is not connected (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET); nothing sent.'); return; }
  const sup = await loadSuppression(db);

  // Replies the reviewer approved.
  for (const doc of (await db.collection(COLLECTIONS.leads).where('lastReply.approved', '==', true).get()).docs) {
    const lead = doc.data() as PartnerLead;
    if (!lead.lastReply || lead.lastReply.sent || !lead.conversationId || lead.doNotContact) continue;
    await replyInThread(lead.conversationId, lead.lastReply.suggestedBody);
    await doc.ref.update({ 'lastReply.sent': true, lastContactAt: now, updatedAt: now, history: push(event('reply-sent', 'Approved reply sent.')) });
    log(`reply sent: ${lead.businessName}`);
  }

  if (!inSendWindow(now, cfg)) { log('Outside the outreach send window; first emails wait.'); return; }
  const sentToday = (await db.collection(COLLECTIONS.leads).where('lastContactAt', '>=', now - DAY).get()).docs
    .filter(d => calgaryDate(d.get('lastContactAt')) === calgaryDate(now)).length;
  let budget = cfg.limits.sendsPerDay - sentToday;
  const approved = (await db.collection(COLLECTIONS.leads).where('status', '==', 'approved').get()).docs;
  for (const doc of approved) {
    if (budget <= 0) { log('Daily send limit reached.'); break; }
    const lead = doc.data() as PartnerLead;
    const blocker = sendBlocker(lead, sup.emails, sup.domains);
    if (blocker) { await doc.ref.update({ status: 'blocked', notes: blocker, updatedAt: now, history: push(event('status', `Not sent: ${blocker}`)) }); log(`not sent to ${lead.businessName}: ${blocker}`); continue; }
    try {
      // A follow-up goes out as its own "Re:" message; the first conversation id is kept for matching replies.
      const isFollowUp = Boolean(lead.conversationId);
      const sent = await sendNew(lead.contactEmail!, lead.draftSubject, lead.draftBody);
      if (isFollowUp) sent.conversationId = lead.conversationId!;
      await doc.ref.update({
        status: 'contacted', conversationId: sent.conversationId, lastContactAt: now,
        nextFollowUpAt: now + cfg.limits.followUpAfterDays * DAY, followUps: isFollowUp ? lead.followUps + 1 : lead.followUps,
        updatedAt: now, history: push(event('sent', `${isFollowUp ? 'Follow-up' : 'First email'} sent to ${lead.contactEmail}: "${lead.draftSubject}"`)),
      });
      budget--;
      log(`sent: ${lead.businessName} (${lead.contactEmail})`);
    } catch (e) {
      await doc.ref.update({ notes: `Send failed: ${e instanceof Error ? e.message : e}`, updatedAt: now });
      log(`send failed for ${lead.businessName}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

/** Match inbox replies to leads, honour opt-outs immediately, and draft suggested responses. */
export async function syncReplies(db: Firestore, now: number, log: Log): Promise<void> {
  if (!outlookConfigured()) return;
  const stateRef = db.collection(COLLECTIONS.health).doc('outreach_inbox');
  const since = ((await stateRef.get()).get('lastCheckedAt') as number | undefined) ?? now - 14 * DAY;
  const leads = (await db.collection(COLLECTIONS.leads).where('conversationId', '!=', null).get()).docs;
  const byConversation = new Map(leads.map(d => [d.get('conversationId') as string, d]));
  const byEmail = new Map(leads.filter(d => d.get('contactEmail')).map(d => [normalizeEmail(d.get('contactEmail')), d]));
  const address = mailingAddress();
  const sig = signature(cfg, address);
  const own = normalizeEmail(cfg.sender.mailbox);

  for (const m of await inboxSince(since - 60 * 60_000)) {
    if (m.from === own) continue;
    const doc = byConversation.get(m.conversationId) ?? byEmail.get(m.from);
    if (!doc) continue;
    const lead = doc.data() as PartnerLead;
    if (lead.replyIds?.includes(m.id)) continue;

    let classification: ReplyClass | null = isStopRequest(m.text) ? 'stop' : null;
    let suggested = { suggestedSubject: `Re: ${m.subject}`, suggestedBody: '', summary: m.text.slice(0, 200) };
    if (!classification && claudeConfigured()) {
      try {
        const c = await classifyReply(cfg, { businessName: lead.businessName, ourEmail: lead.draftBody, theirReply: m.text }, sig);
        classification = c.classification; suggested = c;
      } catch (e) { log(`classify failed for ${lead.businessName}: ${e instanceof Error ? e.message : e}`); }
    }
    classification ??= 'other';

    if (classification === 'stop') {
      await db.collection(COLLECTIONS.suppression).doc(suppressionId(m.from)).set({ email: m.from, reason: 'Asked to stop', leadId: lead.id, at: now });
      if (lead.contactEmail && normalizeEmail(lead.contactEmail) !== m.from) {
        await db.collection(COLLECTIONS.suppression).doc(suppressionId(lead.contactEmail)).set({ email: normalizeEmail(lead.contactEmail), reason: 'Asked to stop (reply from colleague)', leadId: lead.id, at: now });
      }
      await doc.ref.update({ status: 'do-not-contact', doNotContact: true, nextFollowUpAt: null, replyIds: FieldValue.arrayUnion(m.id), updatedAt: now, history: push(event('reply', `Asked not to be contacted (${m.from}). Suppressed.`)) });
      log(`opt-out honoured: ${lead.businessName}`);
      continue;
    }
    if (classification === 'auto-reply') {
      await doc.ref.update({ replyIds: FieldValue.arrayUnion(m.id), updatedAt: now, history: push(event('reply', 'Auto-reply received.')) });
      continue;
    }
    await doc.ref.update({
      status: classification === 'interested' ? 'interested' : 'replied', nextFollowUpAt: null,
      lastReply: { at: m.receivedAt, from: m.from, subject: m.subject, text: m.text.slice(0, 8000), classification, suggestedSubject: suggested.suggestedSubject, suggestedBody: suggested.suggestedBody, approved: false, sent: false },
      replyIds: FieldValue.arrayUnion(m.id), updatedAt: now,
      history: push(event('reply', `${classification}: ${suggested.summary}`)),
    });
    log(`reply (${classification}): ${lead.businessName}`);
  }
  await stateRef.set({ lastCheckedAt: now }, { merge: true });
}
