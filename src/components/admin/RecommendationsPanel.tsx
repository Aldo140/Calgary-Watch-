import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { serviceById } from '../../data/localServices';
import { RECOMMENDATIONS, type Recommendation } from '../../lib/localRecommendations';
import { adminFirestoreActionError as firestoreActionError } from '../../lib/firestoreErrors';
import { AdminButton, Chip, Panel, T, TimeAgo } from './ui';

const STATUS_TONE = { new: 'signal', listed: 'ok', outreach: 'attention', declined: 'critical' } as const;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/**
 * Neighbour recommendations from /local/recommend. "Invite to claim" turns one
 * into a partner lead, so the daily outreach run researches it and tells the
 * business a Calgarian recommended them; "Listed" marks it once it's in the book.
 */
export function RecommendationsPanel() {
  const [rows, setRows] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (!db) return;
    return onSnapshot(query(collection(db, RECOMMENDATIONS), orderBy('createdAt', 'desc'), limit(100)),
      s => { setRows(s.docs.map(d => d.data() as Recommendation)); setError(''); },
      e => setError(e.message.includes('permission') ? 'The recommendation rules are not deployed yet. Run "Deploy Firebase Backend" with target rules.' : e.message));
  }, []);

  async function mark(r: Recommendation, status: Recommendation['status']) {
    if (!db) return;
    setBusy(r.id); setError('');
    try { await updateDoc(doc(db, RECOMMENDATIONS, r.id), { status, reviewedAt: Date.now() }); }
    catch (e) { setError(firestoreActionError(e)); }
    finally { setBusy(''); }
  }

  async function invite(r: Recommendation) {
    if (!db) return;
    setBusy(r.id); setError('');
    const id = `rec-${slug(r.businessName)}`;
    const now = Date.now();
    const website = /^https:\/\//i.test(r.contact) ? r.contact : null;
    try {
      await setDoc(doc(db, 'partner_leads', id), {
        id, entityId: null, entityKind: null, businessName: r.businessName, category: serviceById(r.kind) ? r.kind : 'business',
        neighbourhood: r.neighbourhood, website, contactName: null, contactRole: null, contactEmail: null, emailSourceUrl: null, emailFoundAt: null,
        consentBasis: null, noSolicitationNotice: false, reasonRelevant: `Recommended by a Calgarian${r.creditAs ? ` (${r.creditAs})` : ''}: ${r.why.slice(0, 300)}`,
        status: 'new', draftSubject: '', draftBody: '', followUps: 0, lastContactAt: null, nextFollowUpAt: null, conversationId: null, lastReply: null,
        doNotContact: false, notes: website ? '' : `Contact given: ${r.contact}`, history: [{ at: now, type: 'found', summary: 'From a neighbour recommendation.' }],
        createdAt: now, updatedAt: now,
      });
      await updateDoc(doc(db, RECOMMENDATIONS, r.id), { status: 'outreach', reviewedAt: now });
    } catch (e) { setError(firestoreActionError(e)); }
    finally { setBusy(''); }
  }

  const open = (rows ?? []).filter(r => r.status === 'new').length;
  return (
    <Panel title="Neighbour recommendations" subtitle={`Sent free from the White Pages. ${open} waiting. Check each against its own site before it goes in the book.`}>
      {error ? <p role="alert" className="text-sm" style={{ color: T.critical }}>{error}</p> : null}
      {!rows ? <p className="text-sm" style={{ color: T.muted }}>Loading…</p> : !rows.length ? <p className="text-sm" style={{ color: T.muted }}>No recommendations yet.</p> : null}
      {rows?.map(r => (
        <article key={r.id} className="border-t py-3 space-y-1" style={{ borderColor: T.line }}>
          <div className="flex flex-wrap gap-2 items-center">
            <strong>{r.businessName}</strong>
            <Chip>{serviceById(r.kind)?.label ?? 'Local place'}</Chip>
            <Chip tone={STATUS_TONE[r.status]}>{r.status}</Chip>
            <span className="text-xs" style={{ color: T.muted }}><TimeAgo ts={r.createdAt} /></span>
          </div>
          <p className="text-sm">{r.why}</p>
          <p className="text-xs" style={{ color: T.muted }}>
            {/^https?:\/\//i.test(r.contact) ? <a className="underline" href={r.contact} target="_blank" rel="noreferrer">{r.contact}</a> : r.contact}
            {r.neighbourhood ? ` · ${r.neighbourhood}` : ''}{r.creditAs ? ` · credit: ${r.creditAs}` : ' · no credit'}
          </p>
          {r.status === 'new' ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <AdminButton size="sm" tone="signal" disabled={busy === r.id} onClick={() => void invite(r)}>Invite to claim</AdminButton>
              <AdminButton size="sm" variant="outline" disabled={busy === r.id} onClick={() => void mark(r, 'listed')}>Listed</AdminButton>
              <AdminButton size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void mark(r, 'declined')}>Decline</AdminButton>
            </div>
          ) : null}
        </article>
      ))}
    </Panel>
  );
}
