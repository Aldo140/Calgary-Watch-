import { Link } from 'react-router-dom';
import { adminUsers } from '@/src/lib/adminStore';
import { firestoreActionError, isFirestoreQuotaError, QUOTA_COOLDOWN_MS } from '@/src/lib/firestoreErrors';
import { trackSubscription } from '@/src/lib/readEfficiency';
/**
 * Claimed listings: organizers who registered to manage their own listing,
 * and the changes they've asked for. Evidence is recomputed here from the
 * account email, the typed work email and the listing's own sources — the
 * claim document's contents are never taken on trust.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, query, setDoc, updateDoc, runTransaction, where } from 'firebase/firestore';
import { BadgeCheck, ExternalLink, Mail, X } from 'lucide-react';
import { db } from '@/src/firebase';
import { useAuth } from '@/src/components/FirebaseProvider';
import { discoveryRepository } from '@/src/data/discovery';
import { CLAIMS, EVIDENCE_COPY, UPDATES, UPDATE_FIELDS, VERIFIED, claimEvidence, claimId, type ListingClaim, type ListingUpdate } from '@/src/lib/claims';
import { claimApprovalWrites } from '@/src/lib/claimApproval';
import { APPROVAL_EMAILS_SINCE, type ApprovalEmailStatus } from '@/src/lib/claimApprovalEmail';
import { businessAccountPatch, businessAccountsFromClaims } from '@/src/lib/businessAccount';
import type { PartnerLead } from '@/src/types/ops';
import { AdminButton, Chip, EmptyState, Panel, T, TimeAgo, mono } from './ui';

/** An approved claim, with what happened to its approval email (scripts/claims/send-approval-emails.ts). */
type VerifiedClaim = ListingClaim & { reviewedBy?: string; approvalEmailStatus?: ApprovalEmailStatus; approvalEmailAt?: number; approvalEmailError?: string };

function approvalEmailNote(c: VerifiedClaim): string {
  const when = c.approvalEmailAt ? ` ${new Date(c.approvalEmailAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}` : '';
  if (c.approvalEmailStatus === 'sent') return `Approval email sent${when}`;
  if (c.approvalEmailStatus === 'failed' || c.approvalEmailStatus === 'skipped') return `Approval email not sent: ${c.approvalEmailError ?? 'unknown error'}`;
  if (c.approvalEmailStatus === 'sending') return 'Approval email sending';
  return (c.reviewedAt ?? 0) >= APPROVAL_EMAILS_SINCE ? 'Approval email goes out within the hour' : '';
}

export function ClaimsPanel({ leads }: { leads: PartnerLead[] | null }) {
  const { user } = useAuth();
  const [claims, setClaims] = useState<ListingClaim[] | null>(null);
  const [verified, setVerified] = useState<Array<VerifiedClaim> | null>(null);
  const [updates, setUpdates] = useState<Array<ListingUpdate & { id: string }> | null>(null);
  const [scope,setScope]=useState<Record<string,string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [blockedUntil, setBlockedUntil] = useState(0);
  const quotaWait = blockedUntil > Date.now();
  useEffect(() => { if (!blockedUntil) return; const timer = setTimeout(() => setBlockedUntil(0), Math.max(0, blockedUntil - Date.now())); return () => clearTimeout(timer); }, [blockedUntil]);
  const fail = (e: unknown, atomic = false) => { setError(firestoreActionError(e, atomic)); if (isFirestoreQuotaError(e)) setBlockedUntil(Date.now() + QUOTA_COOLDOWN_MS); };

  useEffect(() => {
    if (!db) return;
    const a = trackSubscription('claims:pending', () => onSnapshot(query(collection(db!, CLAIMS), where('status', '==', 'pending'), limit(100)),
      (s) => setClaims(s.docs.map((d) => d.data() as ListingClaim).sort((x, y) => x.createdAt - y.createdAt)),
      (e) => setError(e.message.includes('permission') ? 'Claim rules are not deployed yet. Run "Deploy Firebase Backend" with target rules.' : firestoreActionError(e))));
    const b = trackSubscription('claims:updates', () => onSnapshot(query(collection(db!, UPDATES), where('status', '==', 'pending'), limit(100)),
      (s) => setUpdates(s.docs.map((d) => ({ ...(d.data() as ListingUpdate), id: d.id })).sort((x, y) => x.createdAt - y.createdAt)),
      (e) => setError(firestoreActionError(e))));
    // Approved claims are what make a listing verified (badge and ranking weight, src/lib/verified.ts).
    const c = trackSubscription('claims:approved', () => onSnapshot(query(collection(db!, CLAIMS), where('status', '==', 'approved'), limit(300)),
      (s) => setVerified(s.docs.map((d) => d.data() as VerifiedClaim).sort((x, y) => (y.reviewedAt ?? 0) - (x.reviewedAt ?? 0))),
      (e) => setError(firestoreActionError(e))));
    return () => { a(); b(); c(); };
  }, []);

  const entities = useMemo(() => new Map(discoveryRepository.list().map((e) => [e.id, e])), []);
  const by = user?.email ?? 'admin';

  async function decide(c: ListingClaim, approve: boolean) {
    if (!db || busy || quotaWait) return;
    const note = approve ? '' : (prompt('Why? The organizer sees this.', 'We couldn’t match you to the organization.') ?? '');
    if (!approve && !note) return;
    setBusy(c.entityId); setError(''); setNotice('');
    try {
      const database = db;
      if (!approve) await updateDoc(doc(database, CLAIMS, claimId(c.uid, c.entityId)), { status: 'rejected', reviewedAt: Date.now(), reviewedBy: by, reviewNote: note });
      if (approve) {
        if (!entities.has(c.entityId)) throw new Error('This listing is not in the published inventory. Restore the canonical listing before approving.');
        const result = await runTransaction(database, async tx => {
          const claimRef = doc(database, CLAIMS, claimId(c.uid, c.entityId));
          const accountRef = doc(database, 'users', c.uid);
          const claimSnap = await tx.get(claimRef);
          const accountSnap = await tx.get(accountRef);
          if (!claimSnap.exists()) throw new Error('The claim no longer exists.');
          const writes = claimApprovalWrites(claimSnap.data() as ListingClaim, accountSnap.data(), by, Date.now());
          const chosen=scope[c.uid+'_'+c.entityId]??claimSnap.data().approvedOrganizationId;
          const organization=chosen?entities.get(chosen):undefined;
          if(chosen&&organization?.kind!=='business')throw Error('Select a published organization profile.');
          if(chosen)Object.assign(writes.claim,{approvedOrganizationId:chosen});
          tx.update(claimRef, writes.claim);
          tx.set(doc(database, VERIFIED, c.entityId), writes.mark);
          if(chosen&&organization)tx.set(doc(database,VERIFIED,chosen),{...writes.mark,entityId:chosen,title:organization.title,organizationId:chosen});
          if(chosen)writes.account=businessAccountPatch({...accountSnap.data(),...writes.account},chosen,writes.account.businessSince);
          tx.update(accountRef, writes.account);
          return writes.account;
        }, { maxAttempts: 1 });
        adminUsers.patch(c.uid, result);
        // The outreach pipeline learns the listing was claimed, so it stops pitching —
        // every lead for it (a listing can have a business lead and an organizer lead).
        for (const lead of leads?.filter((l) => l.entityId === c.entityId) ?? []) {
          await updateDoc(doc(db!, 'partner_leads', lead.id), { status: 'claimed', updatedAt: Date.now() }).catch(() => undefined);
        }
      }
      setNotice(approve ? (c.status === 'approved' ? `${c.entityTitle}: verification and business-account association are consistent. Existing approval and email history were preserved.` : `${c.entityTitle}: claim approved, verification and business account saved. Approval email is handled separately.`) : 'Claim declined.');
    } catch (e) {
      fail(e, true);
    } finally {
      setBusy('');
    }
  }

  /** Mark one claimant's profile as a business account managing these listings. */
  async function markBusiness(uid: string, entityIds: string[], since?: number) {
    if (!db) return;
    const ref = doc(db, 'users', uid);
    const result = await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('They have no profile yet.');
      const data = snap.data();
      let patch = businessAccountPatch(data, entityIds[0], since ?? Date.now());
      for (const id of entityIds.slice(1)) patch = businessAccountPatch({ ...data, ...patch }, id, patch.businessSince);
      tx.update(ref, patch);
      return patch;
    }, { maxAttempts: 1 });
    adminUsers.patch(uid, result);
  }

  /** Every approved claim's account marked, including claims approved before business accounts existed. */
  async function markAllBusiness() {
    if (!verified || busy || quotaWait) return;
    setBusy('accounts'); setError(''); setNotice('');
    let completed = 0; let failed = 0; let quota = false;
    for (const [uid, row] of businessAccountsFromClaims(verified)) {
      try { await markBusiness(uid, row.listings, row.since || undefined); completed++; }
      catch (e) { failed++; if (isFirestoreQuotaError(e)) { fail(e); quota = true; break; } }
    }
    setBusy('');
    if (!quota) { if (failed) setError(`${failed} account(s) could not be updated. ${completed} account(s) were checked; inspect the profiles before retrying.`); else setNotice(`${completed} business account(s) checked and brought into line with approved claims.`); }
  }

  async function settle(u: ListingUpdate & { id: string }, status: 'applied' | 'declined') {
    if (!db || busy || quotaWait) return;
    setBusy(u.id);
    try { await updateDoc(doc(db!, UPDATES, u.id), { status, reviewedAt: Date.now(), reviewedBy: by }); }
    catch (e) { fail(e, true); }
    finally { setBusy(''); }
  }

  const waiting = (claims?.length ?? 0) + (updates?.length ?? 0);
  return (
    <Panel
      title="Claimed listings"
      subtitle={waiting ? `${claims?.length ?? 0} claim${claims?.length === 1 ? '' : 's'} to confirm · ${updates?.length ?? 0} change${updates?.length === 1 ? '' : 's'} to apply` : 'Organizers who registered to manage their own listing, and the changes they send.'}
      padded={false}
    >
      {notice ? <p role="status" className="p-4 text-sm" style={{ color: T.ok }}>{notice}</p> : null}
      {error ? <p role="alert" className="p-4 text-sm" style={{ color: T.critical }}>{error}</p> : null}
      {claims === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
        : !claims.length && !updates?.length ? <EmptyState icon={<BadgeCheck size={20} />} title="Nothing waiting" body="Claims arrive from the “Claim this listing” link on every listing, and from partner emails." />
        : null}

      {claims?.map((c) => {
        const entity = entities.get(c.entityId);
        const ev = claimEvidence({ accountEmail: c.accountEmail, workEmail: c.workEmail, sources: entity?.sources ?? [] });
        const copy = EVIDENCE_COPY[ev];
        return (
          <article key={c.entityId + c.uid} className="p-4 border-t space-y-2" style={{ borderColor: T.line }}>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="attention">Claim</Chip>
              <strong className="text-sm" style={{ color: T.ink }}>{c.entityTitle}</strong>
              <span className="text-xs" style={{ color: T.muted }}><TimeAgo ts={c.createdAt} /></span>
            </div>
            <p className="text-sm" style={{ color: T.ink }}>{c.name} · {c.role}</p>
            <p className="text-xs" style={{ fontFamily: mono, color: T.muted }}>Signed in as {c.accountEmail} · work {c.workEmail}{c.phone ? ` · ${c.phone}` : ''}</p>
            <div className="flex flex-wrap items-center gap-2"><Chip tone={copy.tone}>{copy.label}</Chip><span className="text-xs" style={{ color: T.muted }}>{copy.next}</span></div>
            {c.note ? <p className="text-sm rounded-lg p-2" style={{ background: T.surface, color: T.ink }}>“{c.note}”</p> : null}
            <label className="block text-sm">Organization management access (confirm their authority, not just the venue)
              <select value={scope[c.uid+'_'+c.entityId]??''} onChange={e=>setScope(s=>({...s,[c.uid+'_'+c.entityId]:e.target.value}))}><option value="">This listing only{entity?.kind==='business'?' (organization profile includes its events)':''}</option>{[...entities.values()].filter(e=>e.kind==='business').map(e=><option key={e.id} value={e.id}>{e.title} — profile and all organization events</option>)}</select>
            </label>
            <div className="flex flex-wrap gap-2">
              <AdminButton tone="ok" disabled={Boolean(busy) || quotaWait} onClick={() => void decide(c, true)}><BadgeCheck size={15} /> Approve</AdminButton>
              <a className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border" style={{ borderColor: T.line, color: T.ink }}
                 href={`mailto:${c.workEmail}?subject=${encodeURIComponent(`Confirming your CalgaryWatch claim for ${c.entityTitle}`)}&body=${encodeURIComponent(`Hi ${c.name.split(' ')[0]},\n\nYou asked to manage the ${c.entityTitle} listing on CalgaryWatch. Could you reply to confirm this was you? Once you do, the listing is yours to keep up to date.\n\nThanks,\nAldo`)}`}>
                <Mail size={13} /> Confirm by email
              </a>
              {entity ? <a className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border" style={{ borderColor: T.line, color: T.ink }} href={c.entityPath} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Listing</a> : null}
              <AdminButton variant="ghost" disabled={Boolean(busy) || quotaWait} onClick={() => void decide(c, false)}><X size={14} /> Decline</AdminButton>
            </div>
          </article>
        );
      })}

      {updates?.map((u) => (
        <article key={u.id} className="p-4 border-t space-y-2" style={{ borderColor: T.line }}>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="signal">Change</Chip>
            <strong className="text-sm" style={{ color: T.ink }}>{u.entityTitle}</strong>
            <span className="text-xs" style={{ color: T.muted }}>{UPDATE_FIELDS.find((f) => f.id === u.field)?.label} · <TimeAgo ts={u.createdAt} /></span>
          </div>
          <p className="text-sm whitespace-pre-wrap" style={{ color: T.ink }}>{u.details}</p>
          {u.url ? <a className="text-xs break-all" style={{ color: T.signal }} href={u.url} target="_blank" rel="noreferrer">{u.url}</a> : null}
          <div className="flex flex-wrap gap-2">
            <AdminButton tone="ok" disabled={Boolean(busy) || quotaWait} onClick={() => void settle(u, 'applied')}>Mark applied</AdminButton>
            <AdminButton variant="ghost" disabled={Boolean(busy) || quotaWait} onClick={() => void settle(u, 'declined')}>Not changing</AdminButton>
          </div>
          <p className="text-xs" style={{ color: T.muted }}>Make the edit in Events &amp; markets, then mark it applied. The organizer sees the status on their claim page.</p>
        </article>
      ))}
      {verified?.length ? (
        <details className="border-t" style={{ borderColor: T.line }}>
          <summary className="p-4 text-sm font-semibold cursor-pointer" style={{ color: T.ink }}>
            <BadgeCheck size={14} className="inline -mt-0.5 mr-1" aria-hidden="true" />{verified.length} verified listing{verified.length === 1 ? '' : 's'}
            <span className="font-normal" style={{ color: T.muted }}> · each has an approved claim, so it shows “Verified” and gets its ranking weight</span>
          </summary>
          <div className="px-4 pt-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: T.muted }}>
            <span>Each claimant’s account is a business account. Claims approved before that existed can be brought in line here.</span>
            <AdminButton variant="ghost" disabled={Boolean(busy) || quotaWait} onClick={() => void markAllBusiness()}><BadgeCheck size={14} /> {busy === 'accounts' ? 'Marking…' : 'Mark business accounts'}</AdminButton>
          </div>
          {verified.map((c) => (
            <div key={c.entityId + c.uid} className="px-4 pb-3 text-xs flex flex-wrap gap-x-3 gap-y-1" style={{ color: T.muted }}>
              <a href={c.entityPath} target="_blank" rel="noreferrer" className="font-semibold" style={{ color: T.ink }}>{c.entityTitle}</a>
              <span>Verified {c.reviewedAt ? new Date(c.reviewedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '(date not recorded)'}{c.reviewedBy ? ` by ${c.reviewedBy}` : ''}</span>
              <span style={{ fontFamily: mono }}>{c.name} · {c.role} · {c.workEmail}</span>
              <span>{c.approvedOrganizationId?`Organization: ${entities.get(c.approvedOrganizationId)?.title??c.approvedOrganizationId}`:entities.get(c.entityId)?.kind==='business'?'Organization profile and linked events':'Specific listing access only'}</span>
              <label>Confirm organization access <select value={scope[c.uid+'_'+c.entityId]??c.approvedOrganizationId??''} onChange={e=>setScope(s=>({...s,[c.uid+'_'+c.entityId]:e.target.value}))}><option value="">Keep current scope</option>{[...entities.values()].filter(e=>e.kind==='business').map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
              <Link to={`/plans?as=${encodeURIComponent(c.uid)}`}>View business dashboard</Link>
              <AdminButton variant="ghost" disabled={Boolean(busy) || quotaWait} onClick={() => void decide(c, true)}>{scope[c.uid+'_'+c.entityId]?'Save organization access & repair':'Repair verification & account'}</AdminButton>
              {approvalEmailNote(c) ? <span style={{ color: c.approvalEmailStatus === 'failed' || c.approvalEmailStatus === 'skipped' ? T.critical : T.muted }}><Mail size={12} className="inline -mt-0.5 mr-1" aria-hidden="true" />{approvalEmailNote(c)}</span> : null}
            </div>
          ))}
        </details>
      ) : null}
    </Panel>
  );
}
