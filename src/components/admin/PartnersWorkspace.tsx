/**
 * Local partners: the outreach pipeline. Leads enter only through a real listing
 * on the site; the daily job researches the business's own published address and
 * drafts. With autoSend on (brand/outreach.json) drafts that pass every rule are
 * queued automatically and can be cancelled here; otherwise a person approves each
 * message. The hourly job sends from aldo@calgarywatch.ca. Opt-outs are permanent.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, limit, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { AlertTriangle, Ban, CheckCircle2, ExternalLink, Mail, Plus } from 'lucide-react';

import { useAuth } from '@/src/components/FirebaseProvider';
import { db } from '@/src/firebase';
import type { LeadStatus, PartnerLead } from '@/src/types/ops';
import { AdminButton, Chip, EmptyState, Field, FilterChip, FilterRow, Panel, SkeletonRows, T, TimeAgo, inputClass, inputStyle, mono, type Tone } from './ui';

type View = 'approve' | 'replies' | 'pipeline' | 'research' | 'closed';
const VIEWS: Record<View, { label: string; match: (l: PartnerLead) => boolean }> = {
  approve: { label: 'Approve emails', match: l => l.status === 'ready' || l.status === 'follow-up-ready' },
  replies: { label: 'Replies', match: l => (l.status === 'replied' || l.status === 'interested') && Boolean(l.lastReply && !l.lastReply.sent) },
  pipeline: { label: 'In progress', match: l => ['approved', 'contacted', 'replied', 'interested', 'claimed'].includes(l.status) && !(l.lastReply && !l.lastReply.sent) },
  research: { label: 'Research', match: l => ['new', 'no-email', 'blocked'].includes(l.status) },
  closed: { label: 'Closed', match: l => ['partner', 'not-interested', 'no-response', 'do-not-contact'].includes(l.status) },
};
const TONE: Partial<Record<LeadStatus, Tone>> = {
  ready: 'attention', 'follow-up-ready': 'attention', approved: 'signal', contacted: 'signal', replied: 'attention', interested: 'ok',
  partner: 'ok', claimed: 'ok', blocked: 'critical', 'do-not-contact': 'critical',
};

async function suppressionId(email: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function LeadCard({ lead }: { lead: PartnerLead }) {
  const { user } = useAuth();
  const [subject, setSubject] = useState(lead.draftSubject);
  const [body, setBody] = useState(lead.draftBody);
  const [reply, setReply] = useState(lead.lastReply?.suggestedBody ?? '');
  const [email, setEmail] = useState(lead.contactEmail ?? '');
  const [source, setSource] = useState(lead.emailSourceUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setSubject(lead.draftSubject); setBody(lead.draftBody); }, [lead.draftSubject, lead.draftBody]);
  useEffect(() => { setReply(lead.lastReply?.suggestedBody ?? ''); }, [lead.lastReply?.suggestedBody]);

  const by = user?.email ?? null;
  const note = (summary: string) => arrayUnion({ at: Date.now(), type: 'status', summary: `${summary} (${by ?? 'admin'})` });
  async function update(patch: Record<string, unknown>) {
    if (!db) return;
    setBusy(true); setError('');
    try { await updateDoc(doc(db, 'partner_leads', lead.id), { ...patch, reviewedByEmail: by, updatedAt: Date.now() }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setBusy(false); }
  }
  async function doNotContact() {
    if (!db || !confirm(`Never contact ${lead.businessName}${lead.contactEmail ? ` (${lead.contactEmail})` : ''} again?`)) return;
    if (lead.contactEmail) {
      await setDoc(doc(db, 'outreach_suppression', await suppressionId(lead.contactEmail)), { email: lead.contactEmail.trim().toLowerCase(), reason: 'Marked do-not-contact in admin', leadId: lead.id, at: Date.now(), byEmail: by }).catch(() => undefined);
    }
    await update({ status: 'do-not-contact', doNotContact: true, history: note('Marked do-not-contact') });
  }

  const drafting = lead.status === 'ready' || lead.status === 'follow-up-ready';
  const replyPending = lead.lastReply && !lead.lastReply.sent;

  return (
    <article className="p-4 border-b last:border-b-0 space-y-3" style={{ borderColor: T.line }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="font-bold mr-1" style={{ color: T.ink }}>{lead.businessName}</h3>
        <Chip tone={TONE[lead.status] ?? 'neutral'}>{lead.status}</Chip>
        <Chip>{lead.category}</Chip>
        {lead.neighbourhood && <Chip>{lead.neighbourhood}</Chip>}
        {lead.importedFrom && <Chip mono>imported</Chip>}
        {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: T.signal }}>website <ExternalLink size={11} /></a>}
        <span className="text-xs" style={{ color: T.muted }}>updated <TimeAgo ts={lead.updatedAt} /></span>
      </div>

      {lead.notes && <p className="flex gap-1.5 text-xs rounded-lg px-2.5 py-2" style={{ color: T.attention, background: `${T.attention}10` }}><AlertTriangle size={14} className="shrink-0" /> {lead.notes}</p>}

      {lead.contactEmail && (
        <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[130px_1fr]" style={{ color: T.muted }}>
          <dt className="font-semibold" style={{ color: T.ink }}>To</dt><dd style={{ fontFamily: mono }}>{lead.contactEmail}</dd>
          <dt className="font-semibold" style={{ color: T.ink }}>Address found at</dt><dd>{lead.emailSourceUrl ? <a href={lead.emailSourceUrl} target="_blank" rel="noreferrer" style={{ color: T.signal }}>{lead.emailSourceUrl}</a> : '—'}</dd>
          <dt className="font-semibold" style={{ color: T.ink }}>Consent basis</dt><dd>{lead.consentBasis ?? '—'}</dd>
          <dt className="font-semibold" style={{ color: T.ink }}>Why it's relevant</dt><dd>{lead.reasonRelevant || '—'}</dd>
        </dl>
      )}

      {drafting && (
        <>
          <Field label={lead.status === 'follow-up-ready' ? 'Follow-up subject' : 'Subject'}><input value={subject} onChange={e => setSubject(e.target.value)} className={inputClass} style={inputStyle} /></Field>
          <Field label="Email"><textarea value={body} onChange={e => setBody(e.target.value)} rows={12} className="w-full rounded-lg border p-3 text-sm leading-relaxed" style={{ ...inputStyle, fontFamily: 'Inter, system-ui, sans-serif' }} /></Field>
          <div className="flex flex-wrap gap-2">
            <AdminButton tone="ok" disabled={busy || !body.trim()} onClick={() => update({ status: 'approved', draftSubject: subject, draftBody: body, history: note(`Approved to send to ${lead.contactEmail}`) })}><CheckCircle2 size={15} /> Approve to send</AdminButton>
            {(subject !== lead.draftSubject || body !== lead.draftBody) && <AdminButton variant="outline" tone="signal" disabled={busy} onClick={() => update({ draftSubject: subject, draftBody: body })}>Save edits</AdminButton>}
            <AdminButton variant="outline" disabled={busy} onClick={() => update({ status: lead.status === 'follow-up-ready' ? 'no-response' : 'not-interested', history: note('Skipped') })}>Skip</AdminButton>
          </div>
          <p className="text-xs" style={{ color: T.muted }}>Sends from aldo@calgarywatch.ca Monday to Thursday, 9 am to 4:30 pm, at most 10 a day.</p>
        </>
      )}

      {lead.status === 'approved' && (
        <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: T.line }}>
          <p className="text-xs font-semibold" style={{ color: T.ink }}>Queued: {lead.draftSubject}</p>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed max-h-60 overflow-auto" style={{ color: T.muted, fontFamily: 'Inter, system-ui, sans-serif' }}>{lead.draftBody}</pre>
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton variant="outline" tone="critical" disabled={busy} onClick={() => update({ status: lead.conversationId ? 'follow-up-ready' : 'ready', history: note('Send cancelled; waiting for a person') })}>Cancel send</AdminButton>
            <span className="text-xs" style={{ color: T.muted }}>Goes out in the next send window. Cancelling moves it back to Approve emails, where only a person can send it.</span>
          </div>
        </div>
      )}

      {replyPending && lead.lastReply && (
        <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: T.line }}>
          <p className="text-xs" style={{ color: T.muted }}><Mail size={12} className="inline mr-1" />{lead.lastReply.from} · <Chip tone={lead.lastReply.classification === 'interested' ? 'ok' : 'neutral'}>{lead.lastReply.classification}</Chip></p>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed max-h-60 overflow-auto" style={{ color: T.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>{lead.lastReply.text}</pre>
          <Field label="Suggested reply"><textarea value={reply} onChange={e => setReply(e.target.value)} rows={8} className="w-full rounded-lg border p-3 text-sm" style={inputStyle} /></Field>
          <div className="flex flex-wrap gap-2">
            <AdminButton tone="ok" disabled={busy || !reply.trim() || lead.lastReply.approved} onClick={() => update({ lastReply: { ...lead.lastReply!, suggestedBody: reply, approved: true }, history: note('Reply approved') })}><CheckCircle2 size={15} /> {lead.lastReply.approved ? 'Reply queued' : 'Approve reply'}</AdminButton>
            <AdminButton variant="outline" disabled={busy} onClick={() => update({ lastReply: { ...lead.lastReply!, sent: true }, history: note('Handled outside the agent') })}>I answered myself</AdminButton>
          </div>
        </div>
      )}

      {(lead.status === 'no-email' || lead.status === 'new') && (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
          <Field label="Published email"><input value={email} onChange={e => setEmail(e.target.value)} placeholder="info@business.ca" className={inputClass} style={inputStyle} /></Field>
          <Field label="Page where it's published"><input value={source} onChange={e => setSource(e.target.value)} placeholder="https://business.ca/contact" className={inputClass} style={inputStyle} /></Field>
          <AdminButton tone="signal" disabled={busy || !/@/.test(email) || !/^https:\/\//.test(source)} onClick={() => update({ contactEmail: email.trim().toLowerCase(), emailSourceUrl: source.trim(), status: 'new', notes: '', history: note(`Address added by hand from ${source.trim()}`) })}>Research & draft</AdminButton>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {['contacted', 'replied', 'interested'].includes(lead.status) && (
          <>
            <AdminButton size="sm" variant="outline" tone="ok" disabled={busy} onClick={() => update({ status: 'interested', history: note('Marked interested') })}>Interested</AdminButton>
            <AdminButton size="sm" variant="outline" tone="ok" disabled={busy} onClick={() => update({ status: 'claimed', history: note('Claimed their listing') })}>Claimed listing</AdminButton>
            <AdminButton size="sm" variant="outline" tone="ok" disabled={busy} onClick={() => update({ status: 'partner', history: note('Became a partner') })}>Partner</AdminButton>
            <AdminButton size="sm" variant="outline" disabled={busy} onClick={() => update({ status: 'not-interested', history: note('Not interested') })}>Not interested</AdminButton>
          </>
        )}
        {!lead.doNotContact && <AdminButton size="sm" variant="ghost" disabled={busy} onClick={doNotContact}><Ban size={13} /> Do not contact</AdminButton>}
      </div>
      {error && <p role="alert" className="text-xs" style={{ color: T.critical }}>{error}</p>}

      <details className="text-xs" style={{ color: T.muted }}>
        <summary className="cursor-pointer font-semibold">History ({lead.history?.length ?? 0})</summary>
        <ol className="mt-2 space-y-1">
          {[...(lead.history ?? [])].reverse().map((h, i) => <li key={i}><span style={{ fontFamily: mono }}>{new Date(h.at).toLocaleDateString('en-CA')}</span> · {h.type} · {h.summary}</li>)}
        </ol>
      </details>
    </article>
  );
}

function AddLead() {
  const [name, setName] = useState('');
  const [site, setSite] = useState('');
  const [msg, setMsg] = useState('');
  async function add() {
    if (!db) return;
    const id = `manual-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}`;
    const now = Date.now();
    try {
      await setDoc(doc(db, 'partner_leads', id), {
        id, entityId: null, entityKind: null, businessName: name.trim(), category: 'business', neighbourhood: '', website: site.trim() || null,
        contactName: null, contactRole: null, contactEmail: null, emailSourceUrl: null, emailFoundAt: null, consentBasis: null,
        noSolicitationNotice: false, reasonRelevant: '', status: 'new', draftSubject: '', draftBody: '', followUps: 0, lastContactAt: null,
        nextFollowUpAt: null, conversationId: null, lastReply: null, doNotContact: false, notes: '', history: [{ at: now, type: 'found', summary: 'Added by hand.' }],
        createdAt: now, updatedAt: now,
      });
      setName(''); setSite(''); setMsg('Added. The next daily run researches it.');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not add'); }
  }
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end p-4 border-t" style={{ borderColor: T.line }}>
      <Field label="Business name"><input value={name} onChange={e => setName(e.target.value)} className={inputClass} style={inputStyle} /></Field>
      <Field label="Website"><input value={site} onChange={e => setSite(e.target.value)} placeholder="https://" className={inputClass} style={inputStyle} /></Field>
      <AdminButton variant="outline" tone="signal" disabled={!name.trim() || !/^https:\/\//.test(site)} onClick={add}><Plus size={14} /> Add lead</AdminButton>
      {msg && <p className="text-xs sm:col-span-3" style={{ color: T.muted }}>{msg}</p>}
    </div>
  );
}

export function PartnersWorkspace() {
  const [leads, setLeads] = useState<PartnerLead[] | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('approve');
  useEffect(() => {
    if (!db) return;
    return onSnapshot(query(collection(db, 'partner_leads'), orderBy('updatedAt', 'desc'), limit(500)),
      s => setLeads(s.docs.map(d => d.data() as PartnerLead)),
      e => setError(e.message.includes('permission') ? 'The operations rules are not deployed yet. Run "Deploy Firebase Backend" with target rules.' : e.message));
  }, []);
  const counts = useMemo(() => Object.fromEntries((Object.keys(VIEWS) as View[]).map(v => [v, (leads ?? []).filter(VIEWS[v].match).length])), [leads]);
  const shown = (leads ?? []).filter(VIEWS[view].match);

  return (
    <div className="space-y-4">
      <Panel title="Partner outreach" subtitle="Emails that pass every rule are sent automatically (cancel any under In progress). Businesses come from real listings; replies wait for you; paid placement stays off until the offer is final (brand/outreach.json)." padded={false}>
        <div className="px-4 pt-3">
          <FilterRow>{(Object.keys(VIEWS) as View[]).map(v => <FilterChip key={v} active={view === v} onClick={() => setView(v)} count={counts[v]}>{VIEWS[v].label}</FilterChip>)}</FilterRow>
        </div>
        {error ? <p role="alert" className="p-4 text-sm" style={{ color: T.critical }}>{error}</p>
          : !leads ? <div className="p-4"><SkeletonRows /></div>
          : !shown.length ? <EmptyState title={`Nothing in ${VIEWS[view].label.toLowerCase()}`} body={view === 'approve' ? 'The daily run drafts up to 10 new pitches from listed businesses and markets.' : undefined} />
          : <div>{shown.map(l => <LeadCard key={l.id} lead={l} />)}</div>}
        <AddLead />
      </Panel>
    </div>
  );
}
