/**
 * Claimed listings: organizers who registered to manage their own listing,
 * and the changes they've asked for. Evidence is recomputed here from the
 * account email, the typed work email and the listing's own sources — the
 * claim document's contents are never taken on trust.
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { BadgeCheck, ExternalLink, Mail, X } from 'lucide-react';
import { db } from '@/src/firebase';
import { useAuth } from '@/src/components/FirebaseProvider';
import { discoveryRepository } from '@/src/data/discovery';
import { CLAIMS, EVIDENCE_COPY, UPDATES, UPDATE_FIELDS, VERIFIED, claimEvidence, claimId, type ListingClaim, type ListingUpdate } from '@/src/lib/claims';
import type { PartnerLead } from '@/src/types/ops';
import { AdminButton, Chip, EmptyState, Panel, T, TimeAgo, mono } from './ui';

export function ClaimsPanel({ leads }: { leads: PartnerLead[] | null }) {
  const { user } = useAuth();
  const [claims, setClaims] = useState<ListingClaim[] | null>(null);
  const [updates, setUpdates] = useState<Array<ListingUpdate & { id: string }> | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!db) return;
    const a = onSnapshot(query(collection(db, CLAIMS), where('status', '==', 'pending'), limit(100)),
      (s) => setClaims(s.docs.map((d) => d.data() as ListingClaim).sort((x, y) => x.createdAt - y.createdAt)),
      (e) => setError(e.message.includes('permission') ? 'Claim rules are not deployed yet. Run "Deploy Firebase Backend" with target rules.' : e.message));
    const b = onSnapshot(query(collection(db, UPDATES), where('status', '==', 'pending'), limit(100)),
      (s) => setUpdates(s.docs.map((d) => ({ ...(d.data() as ListingUpdate), id: d.id })).sort((x, y) => x.createdAt - y.createdAt)),
      () => setUpdates([]));
    return () => { a(); b(); };
  }, []);

  const entities = useMemo(() => new Map(discoveryRepository.list().map((e) => [e.id, e])), []);
  const by = user?.email ?? 'admin';

  async function decide(c: ListingClaim, approve: boolean) {
    if (!db) return;
    const note = approve ? '' : (prompt('Why? The organizer sees this.', 'We couldn’t match you to the organization.') ?? '');
    if (!approve && !note) return;
    setBusy(c.entityId); setError('');
    try {
      await updateDoc(doc(db, CLAIMS, claimId(c.uid, c.entityId)), { status: approve ? 'approved' : 'rejected', reviewedAt: Date.now(), reviewedBy: by, reviewNote: note });
      if (approve) {
        await setDoc(doc(db, VERIFIED, c.entityId), { entityId: c.entityId, title: c.entityTitle, verifiedAt: Date.now(), verifiedBy: by });
        // The outreach pipeline learns the listing was claimed, so it stops pitching.
        const lead = leads?.find((l) => l.entityId === c.entityId);
        if (lead) await updateDoc(doc(db, 'partner_leads', lead.id), { status: 'claimed', updatedAt: Date.now() }).catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy('');
    }
  }

  async function settle(u: ListingUpdate & { id: string }, status: 'applied' | 'declined') {
    if (!db) return;
    setBusy(u.id);
    try { await updateDoc(doc(db, UPDATES, u.id), { status, reviewedAt: Date.now(), reviewedBy: by }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setBusy(''); }
  }

  const waiting = (claims?.length ?? 0) + (updates?.length ?? 0);
  return (
    <Panel
      title="Claimed listings"
      subtitle={waiting ? `${claims?.length ?? 0} claim${claims?.length === 1 ? '' : 's'} to confirm · ${updates?.length ?? 0} change${updates?.length === 1 ? '' : 's'} to apply` : 'Organizers who registered to manage their own listing, and the changes they send.'}
      padded={false}
    >
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
            <div className="flex flex-wrap gap-2">
              <AdminButton tone="ok" disabled={busy === c.entityId} onClick={() => void decide(c, true)}><BadgeCheck size={15} /> Approve</AdminButton>
              <a className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border" style={{ borderColor: T.line, color: T.ink }}
                 href={`mailto:${c.workEmail}?subject=${encodeURIComponent(`Confirming your CalgaryWatch claim for ${c.entityTitle}`)}&body=${encodeURIComponent(`Hi ${c.name.split(' ')[0]},\n\nYou asked to manage the ${c.entityTitle} listing on CalgaryWatch. Could you reply to confirm this was you? Once you do, the listing is yours to keep up to date.\n\nThanks,\nAldo`)}`}>
                <Mail size={13} /> Confirm by email
              </a>
              {entity ? <a className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border" style={{ borderColor: T.line, color: T.ink }} href={c.entityPath} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Listing</a> : null}
              <AdminButton variant="ghost" disabled={busy === c.entityId} onClick={() => void decide(c, false)}><X size={14} /> Decline</AdminButton>
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
            <AdminButton tone="ok" disabled={busy === u.id} onClick={() => void settle(u, 'applied')}>Mark applied</AdminButton>
            <AdminButton variant="ghost" disabled={busy === u.id} onClick={() => void settle(u, 'declined')}>Not changing</AdminButton>
          </div>
          <p className="text-xs" style={{ color: T.muted }}>Make the edit in Events &amp; markets, then mark it applied. The organizer sees the status on their claim page.</p>
        </article>
      ))}
    </Panel>
  );
}
