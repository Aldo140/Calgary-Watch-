import {adminClaim} from '../../lib/adminContentRecords';
import {adminObject,adminText,adminTimestamp} from '../../lib/adminRecord';
import { Link } from 'react-router-dom';
import { adminUsers } from '@/src/lib/adminStore';
import { adminFirestoreActionError as firestoreActionError, isFirestoreQuotaError, QUOTA_COOLDOWN_MS } from '@/src/lib/firestoreErrors';
import { trackSubscription } from '@/src/lib/readEfficiency';
/**
 * Claimed listings: organizers who registered to manage their own listing,
 * and the changes they've asked for. Evidence is recomputed here from the
 * account email, the typed work email and the listing's own sources — the
 * claim document's contents are never taken on trust.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, query, setDoc, updateDoc, runTransaction, where , getDocs} from 'firebase/firestore';
import { BadgeCheck, ExternalLink, Mail, X } from 'lucide-react';
import { db } from '@/src/firebase';
import { useAuth } from '@/src/components/FirebaseProvider';
import { discoveryRepository } from '@/src/data/discovery';
import { CLAIMS, EVIDENCE_COPY, UPDATES, UPDATE_FIELDS, VERIFIED, claimEvidence, claimId, type ListingClaim, type ListingUpdate } from '@/src/lib/claims';
import {claimApprovalWrites} from '@/src/lib/claimApproval';
import { APPROVAL_EMAILS_SINCE, type ApprovalEmailStatus } from '@/src/lib/claimApprovalEmail';
import { businessAccountPatch, businessAccountsFromClaims } from '@/src/lib/businessAccount';
import { defaultOrganizationScope, reviewClaimScope } from '@/src/lib/organizerPromotion';
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
  const [verifiedSearch, setVerifiedSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const[recordWarnings,setRecordWarnings]=useState<Record<string,number>>({});
  const parseClaims=(docs:Array<{data:()=>unknown}>,key:string)=>{const parsed=docs.map(d=>adminClaim(d.data())).filter((c):c is ListingClaim=>!!c);setRecordWarnings(p=>({...p,[key]:docs.length-parsed.length}));return parsed;};
  const [loadErrors,setLoadErrors]=useState<Record<string,string>>({});
  const [attempt,setAttempt]=useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const quotaWait = blockedUntil > Date.now();
  useEffect(() => { if (!blockedUntil) return; const timer = setTimeout(() => setBlockedUntil(0), Math.max(0, blockedUntil - Date.now())); return () => clearTimeout(timer); }, [blockedUntil]);
  const fail = (e: unknown, atomic = false) => { setError(firestoreActionError(e, atomic)); if (isFirestoreQuotaError(e)) setBlockedUntil(Date.now() + QUOTA_COOLDOWN_MS); };

  useEffect(() => {
    if (!db) return;
    setLoadErrors({});
    const readFailed=(key:string,e:unknown)=>setLoadErrors(previous=>({...previous,[key]:firestoreActionError(e)}));
    const readOk=(key:string)=>setLoadErrors(previous=>({...previous,[key]:''}));
    const a = trackSubscription('claims:pending', () => onSnapshot(query(collection(db!, CLAIMS), where('status', '==', 'pending'), limit(100)),
      (s) => {setClaims(parseClaims(s.docs,'Pending claims').sort((x, y) => x.createdAt - y.createdAt));readOk('Pending claims');},
      (e) => readFailed('Pending claims',e)));
    const b = trackSubscription('claims:updates', () => onSnapshot(query(collection(db!, UPDATES), where('status', '==', 'pending'), limit(100)),
      (s) => {setUpdates(s.docs.map((d) => ({ ...d.data(), id:d.id,entityTitle:adminText(d.data().entityTitle,'Listing change'),details:adminText(d.data().details),url:adminText(d.data().url),createdAt:adminTimestamp(d.data().createdAt)??0 } as ListingUpdate&{id:string})).sort((x, y) => x.createdAt - y.createdAt));readOk('Legacy change requests');},
      (e) => readFailed('Legacy change requests',e)));
    // Approved claims are what make a listing verified (badge and ranking weight, src/lib/verified.ts).
    const c = trackSubscription('claims:approved', () => onSnapshot(query(collection(db!, CLAIMS), where('status', '==', 'approved'), limit(300)),
      (s) => {setVerified(parseClaims(s.docs,'Verified listings').sort((x, y) => (y.reviewedAt ?? 0) - (x.reviewedAt ?? 0)));readOk('Verified listings');},
      (e) => readFailed('Verified listings',e)));
    return () => { a(); b(); c(); };
  }, [attempt]);

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
        // Verification belongs to the organizer: a linked organization profile is the default scope.
        const chosen=entities.get(c.entityId)?.kind==='business'?undefined:(scope[c.uid+'_'+c.entityId]??c.approvedOrganizationId??defaultOrganizationScope(c.entityId,[...entities.values()]))||undefined;
        const expand=Boolean(chosen);
        let response: {data:{account:Record<string,unknown>;accounts:Array<{uid:string;account:Record<string,unknown>}>;moved:number}};
        if (expand) {
          if(!window.confirm(`Confirm ${entities.get(chosen!)?.title??chosen} organization access and move this listing’s shared workspace and events? This also confirms organization access for every already-approved representative of ${c.entityTitle}. Existing approval/email history is retained and the weekly allowance is not reset.`))return;
          const {getFunctions,httpsCallable}=await import('firebase/functions');
          response=await httpsCallable<{uid:string;entityId:string;organizationId?:string;confirmSharedAccess?:boolean},{account:Record<string,unknown>;accounts:Array<{uid:string;account:Record<string,unknown>}>;moved:number}>(getFunctions(database.app,'northamerica-northeast1'),'approveOrganizationClaim')({uid:c.uid,entityId:c.entityId,organizationId:chosen,confirmSharedAccess:true});
        } else {
          // Ordinary approval needs no callable or server-side catalogue sync.
          // Firestore rules authorize the admin and enforce the atomic verification mark.
          const account=await runTransaction(database,async tx=>{
            const claimRef=doc(database,CLAIMS,claimId(c.uid,c.entityId)),accountRef=doc(database,'users',c.uid);
            const [claim,profile]=await Promise.all([tx.get(claimRef),tx.get(accountRef)]);
            if(!claim.exists())throw Error('The claim no longer exists.');
            const live=claim.data() as ListingClaim;
            if(live.uid!==c.uid||live.entityId!==c.entityId)throw Error('The claim identity changed. Refresh before retrying.');
            if(live.approvedOrganizationId&&!(entities.get(c.entityId)?.kind==='business'&&live.approvedOrganizationId===live.entityId))throw Error('This claim has organization access. Refresh and use the organization repair action.');
            const writes=claimApprovalWrites(live,profile.data(),by,Date.now());
            tx.update(claimRef,writes.claim);tx.update(accountRef,writes.account);tx.set(doc(database,VERIFIED,c.entityId),writes.mark);
            return writes.account;
          },{maxAttempts:1});
          response={data:{account,accounts:[],moved:0}};
        }
        const result=response.data.account;
        adminUsers.patch(c.uid, result);
        for(const peer of response.data.accounts??[])adminUsers.patch(peer.uid,peer.account);
        // The outreach pipeline learns the listing was claimed, so it stops pitching —
        // every lead for it (a listing can have a business lead and an organizer lead).
        const matchingLeads=leads?.filter((l) => l.entityId === c.entityId)??await getDocs(query(collection(db,'partner_leads'),where('entityId','==',c.entityId),limit(100))).then(s=>s.docs.map(d=>({...d.data(),id:d.id}))).catch(()=>[]);
        for (const lead of matchingLeads) {
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
      {Object.entries(recordWarnings).filter(([,count])=>count>0).map(([label,count])=><p key={label} role="status" className="p-4 text-sm">{label}: {count} records have incomplete identity or status and need repair. They cannot be approved from this screen.</p>)}
      {Object.values(loadErrors).some(Boolean)?<div role="alert" className="m-4 rounded-lg border p-3 text-sm space-y-2" style={{borderColor:T.line,color:T.critical}}>{Object.entries(loadErrors).filter(([,message])=>message).map(([label,message])=><p key={label}><strong>{label} unavailable.</strong> {message}</p>)}<AdminButton onClick={()=>setAttempt(n=>n+1)}>Retry loading claims</AdminButton></div>:null}
      {claims === null && !loadErrors['Pending claims'] ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
        : claims?.length===0 && updates?.length===0 && !Object.values(loadErrors).some(Boolean) ? <EmptyState icon={<BadgeCheck size={20} />} title="Nothing waiting" body="Claims arrive from the “Claim this listing” link on every listing, and from partner emails." />
        : null}

      {claims?.map((c) => {
        const entity = entities.get(c.entityId);
        const scopeReview = reviewClaimScope(c, [...entities.values()]);
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
            {c.note ? <div className="rounded-lg border p-3" style={{ borderColor: T.line, background: T.surface, color: T.ink }}><p className="text-xs font-semibold">Message submitted with claim</p><p className="mt-1 text-sm whitespace-pre-wrap break-words">{c.note}</p></div> : null}
            {entity?.kind==='business'?<div className="rounded-lg border p-3 text-sm" style={{borderColor:T.line,background:T.surface}}>
              <strong style={{color:T.ink}}>Organization access: {entity.title}</strong>
              <p className="mt-1" style={{color:T.muted}}>Approval lets this representative manage the organization profile and its linked events and markets. It does not give access to other organizations.</p>
            </div>:<div className="rounded-lg border p-3 text-sm space-y-2" style={{borderColor:T.line,background:T.surface,color:T.ink}}>
              <div className="flex flex-wrap items-center gap-2"><Chip tone={scopeReview.recommendation==='organization'?'ok':'attention'}>{scopeReview.recommendation==='organization'?'Recommended':'Research required'}</Chip><strong>{scopeReview.organizationTitle?`Organization access: ${scopeReview.organizationTitle}`:'Keep listing-only access'}</strong></div>
              <ul className="list-disc pl-5 text-xs space-y-1" style={{color:T.muted}}>{scopeReview.evidence.map(item=><li key={item}>{item}</li>)}</ul>
              <details><summary className="cursor-pointer text-xs font-semibold" style={{color:T.signal}}>Review or change scope</summary><label className="mt-2 grid gap-2"><span className="sr-only">Organization management access</span><select aria-label="Organization management access" className="w-full min-w-0 rounded-lg border bg-white px-3 py-2" style={{borderColor:T.line}} value={scope[c.uid+'_'+c.entityId]??defaultOrganizationScope(c.entityId,[...entities.values()])??''} onChange={e=>setScope(s=>({...s,[c.uid+'_'+c.entityId]:e.target.value}))}><option value="">This listing’s organizer workspace only</option>{[...entities.values()].filter(e=>e.kind==='business').sort((a,b)=>a.title.localeCompare(b.title)).map(e=><option key={e.id} value={e.id}>{e.title} — profile and linked events</option>)}</select><span className="text-xs" style={{color:T.muted}}>Only select a different organization after checking its published contact. A shared venue is not ownership.</span></label></details>
            </div>}
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
        <section aria-labelledby="verified-accounts-title" className="border-t p-4 sm:p-6" style={{ borderColor: T.line }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 id="verified-accounts-title" className="text-lg font-semibold" style={{color:T.ink}}>Verified business accounts</h2><p className="mt-1 text-sm" style={{color:T.muted}}>Approved representatives, their organization access and original claim messages.</p></div>
            <Chip tone="ok"><BadgeCheck size={14} /> {new Set(verified.map(c=>c.uid)).size} accounts · {verified.length} approved claims</Chip>
          </div>
          <label className="mt-5 block max-w-xl text-sm font-medium" style={{color:T.ink}}>Find an organization or representative
            <input type="search" value={verifiedSearch} onChange={e=>setVerifiedSearch(e.target.value)} placeholder="Organization, name or email" className="mt-2 w-full rounded-lg border bg-white px-3 py-2.5" style={{borderColor:T.line}} />
          </label>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {verified.filter(c=>[c.entityTitle,c.name,c.workEmail,c.accountEmail,entities.get(c.approvedOrganizationId??c.entityId)?.title].some(v=>v?.toLowerCase().includes(verifiedSearch.trim().toLowerCase()))).map((c) => {
            const scopeReview=reviewClaimScope(c,[...entities.values()]);
            const entity=entities.get(c.entityId);
            const organization=entities.get(c.approvedOrganizationId??(entity?.kind==='business'?entity.id:''));
            const needsReview=!entity||entity.kind!=='business'&&scopeReview.recommendation!=='already-set';
            const websiteProfile=organization??((entity?.kind==='event'||entity?.kind==='market')?entities.get(entity.organizerEntityId??''):entity);
            const officialWebsite=[...(websiteProfile?.kind==='business'?[websiteProfile.website]:[]),...(websiteProfile?.sources??entity?.sources??[]).filter(source=>source.kind==='official').map(source=>source.url)].find(value=>{
              try { const url=new URL(value??'');return ['https:','http:'].includes(url.protocol)&&!/(^|\.)calgarywatch\.ca$/i.test(url.hostname); } catch { return false; }
            });
            return <article key={c.entityId+c.uid} className="min-w-0 rounded-xl border p-4 sm:p-5" style={{borderColor:T.line,background:T.surface,color:T.ink}}>
              <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 text-base font-semibold break-words">{organization?.title??c.entityTitle}</h3><Chip tone="ok"><BadgeCheck size={13} /> Verified</Chip></div>
              <p className="mt-1 text-xs" style={{color:T.muted}}>Approved {c.reviewedAt?new Date(c.reviewedAt).toLocaleDateString('en-CA',{year:'numeric',month:'short',day:'numeric'}):'— date not recorded'}</p>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div className="min-w-0"><dt className="text-xs" style={{color:T.muted}}>Representative</dt><dd className="mt-1 font-medium break-words">{c.name}</dd><dd className="mt-1 text-xs" style={{color:T.muted}}>{c.role}</dd></div>
                <div className="min-w-0"><dt className="text-xs" style={{color:T.muted}}>Contact</dt><dd className="mt-1 break-all">{c.workEmail?<a href={`mailto:${c.workEmail}`} className="underline" style={{color:T.signal}}>{c.workEmail}</a>:'Not recorded'}</dd>{c.phone?<dd className="mt-1"><a href={`tel:${c.phone.replace(/[^+0-9]/g,'')}`}>{c.phone}</a></dd>:null}</div>
                <div className="sm:col-span-2"><dt className="text-xs" style={{color:T.muted}}>Management access</dt><dd className="mt-1">{organization?'Organization profile and linked events & markets':entity?'This listing’s organizer workspace':'Listing unavailable — review required'}</dd>{c.entityTitle!==organization?.title&&organization?<dd className="mt-1 text-xs" style={{color:T.muted}}>Originally claimed: {c.entityTitle}</dd>:null}</div>
              </dl>
              <div className="mt-4 rounded-lg border p-3" style={{borderColor:T.line}}><p className="text-xs font-semibold">Message submitted with claim</p><p className="mt-1 text-sm whitespace-pre-wrap break-words" style={{color:c.note?T.ink:T.muted}}>{c.note||'No message was included with this claim.'}</p></div>
              <p className="mt-3 text-xs" style={{color:c.approvalEmailStatus==='failed'||c.approvalEmailStatus==='skipped'?T.critical:T.muted}}><Mail size={12} className="inline mr-1" />{approvalEmailNote(c)||'Approval email status not recorded'}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold" style={{background:T.ink,color:'#fff'}} to={`/plans?as=${encodeURIComponent(c.uid)}`}>View business dashboard</Link>
                {officialWebsite?<a className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold" style={{borderColor:T.line,color:T.signal}} href={officialWebsite} target="_blank" rel="noopener noreferrer" aria-label={`Official website for ${organization?.title??c.entityTitle} (opens in a new tab)`}>Official website <ExternalLink size={13}/></a>:null}
                {c.entityPath?<a className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-semibold" style={{borderColor:T.line}} href={c.entityPath} target="_blank" rel="noreferrer">Public listing <ExternalLink size={13}/></a>:null}
              </div>
              <details className="mt-4 border-t pt-3 text-xs" style={{borderColor:T.line,color:T.muted}}><summary className="cursor-pointer font-semibold" style={{color:needsReview?T.critical:T.muted}}>{needsReview?'Access needs review · details & tools':'Approval details & access tools'}</summary>
                <div className="mt-3 space-y-3">
                  <p className="break-all">Signed in as: {c.accountEmail||'Not recorded'}</p><p>Approved by: {c.reviewedBy||'Not recorded'}</p>
                  <p>{scopeReview.organizationTitle?`Scope: ${scopeReview.organizationTitle}`:'Scope: listing-only access'}</p>
                  <ul className="list-disc pl-5 space-y-1">{scopeReview.evidence.map(item=><li key={item}>{item}</li>)}</ul>
                  {entity&&entity.kind!=='business'?<label className="grid gap-2">Organization management access<select aria-label={`Organization access for ${c.entityTitle}`} className="w-full min-w-0 rounded-lg border bg-white px-3 py-2" style={{borderColor:T.line,color:T.ink}} value={scope[c.uid+'_'+c.entityId]??scopeReview.organizationId??''} onChange={e=>setScope(s=>({...s,[c.uid+'_'+c.entityId]:e.target.value}))}><option value="">Keep listing-only access</option>{[...entities.values()].filter(e=>e.kind==='business').sort((a,b)=>a.title.localeCompare(b.title)).map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select><span>Confirm authority against the organization’s official contact before changing access.</span></label>:null}
                  <AdminButton variant="ghost" disabled={!entity||Boolean(busy)||quotaWait} onClick={()=>void decide(c,true)}>{(scope[c.uid+'_'+c.entityId]??scopeReview.organizationId)?'Confirm organization access':'Repair verification & account'}</AdminButton>
                </div>
              </details>
            </article>;
          })}
          </div>
          {verifiedSearch&&!verified.some(c=>[c.entityTitle,c.name,c.workEmail,c.accountEmail,entities.get(c.approvedOrganizationId??c.entityId)?.title].some(v=>v?.toLowerCase().includes(verifiedSearch.trim().toLowerCase())))?<p className="py-6 text-sm" style={{color:T.muted}}>No verified accounts match your search.</p>:null}
          <details className="mt-5 border-t pt-4 text-xs" style={{borderColor:T.line,color:T.muted}}><summary className="cursor-pointer font-semibold">Legacy account maintenance</summary><p className="my-3">Bring older business-account flags in line with approved claims. Existing approval and email history are preserved.</p><AdminButton variant="ghost" disabled={Boolean(busy)||quotaWait} onClick={()=>void markAllBusiness()}>{busy==='accounts'?'Checking accounts…':'Check business account flags'}</AdminButton></details>
        </section>
      ) : null}
    </Panel>
  );
}
