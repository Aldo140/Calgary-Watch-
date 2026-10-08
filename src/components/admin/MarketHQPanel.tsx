/**
 * Market HQ from the admin side: managed-service requests ("have
 * CalgaryWatch run it"), and a way into any market's HQ, since admin can do
 * everything an organizer can for markets on the managed service.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, limit, onSnapshot, query, updateDoc } from 'firebase/firestore';
import { Handshake, Store } from 'lucide-react';
import { db } from '@/src/firebase';
import { discoveryRepository } from '@/src/data/discovery';
import { SERVICE } from '@/src/lib/markets';
import { AdminButton, Chip, EmptyState, Panel, SearchField, T, TimeAgo } from './ui';

type Req = { id: string; uid: string; marketId: string; marketTitle: string; plan: string; note: string; contact: string; status: string; createdAt: number };

export function MarketHQPanel() {
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!db) return;
    return onSnapshot(query(collection(db, SERVICE), limit(200)), (s) => setReqs(s.docs.map((d) => ({ ...(d.data() as Omit<Req, 'id'>), id: d.id })).sort((a, b) => b.createdAt - a.createdAt)), () => setReqs([]));
  }, []);
  const markets = useMemo(() => discoveryRepository.list().filter((e) => e.kind === 'market'), []);
  const found = q.trim().length >= 2 ? markets.filter((m) => m.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const open = (reqs ?? []).filter((r) => r.status !== 'closed');
  const setStatus = (r: Req, status: string) => db && updateDoc(doc(db, SERVICE, r.id), { status }).catch(() => undefined);

  return (
    <Panel title="Market HQ" subtitle={open.length ? `${open.filter((r) => r.status === 'new').length} new request${open.filter((r) => r.status === 'new').length === 1 ? '' : 's'} to run a market for them` : 'Markets that asked us to run vendors, lineups and messages for them.'} padded={false}>
      <div className="px-4 pt-3"><SearchField value={q} onChange={setQ} placeholder="Open any market’s HQ" /></div>
      {found.length ? (
        <ul className="px-4 pt-2 space-y-1">
          {found.map((m) => <li key={m.id} className="flex items-center justify-between gap-2 text-sm"><span style={{ color: T.ink }}>{m.title}</span><Link to={`/organizer/${encodeURIComponent(m.id)}`} className="text-xs font-bold" style={{ color: T.signal }}>Open HQ →</Link></li>)}
        </ul>
      ) : null}
      {reqs === null ? <p className="p-4 text-sm" style={{ color: T.muted }}>Loading…</p>
        : !open.length ? <EmptyState icon={<Handshake size={20} />} title="No requests yet" body="Organizers ask from Market HQ → Plan & sharing." />
        : open.map((r) => (
          <article key={r.id} className="p-4 border-t space-y-2" style={{ borderColor: T.line }}>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={r.status === 'new' ? 'attention' : 'ok'}>{r.status === 'new' ? 'New' : 'Running it'}</Chip>
              <strong className="text-sm" style={{ color: T.ink }}>{r.marketTitle}</strong>
              <span className="text-xs" style={{ color: T.muted }}><TimeAgo ts={r.createdAt} /> · {r.contact}</span>
            </div>
            {r.note ? <p className="text-sm" style={{ color: T.ink }}>“{r.note}”</p> : null}
            <div className="flex flex-wrap gap-2">
              <Link to={`/organizer/${encodeURIComponent(r.marketId)}`}><AdminButton tone="signal"><Store size={14} /> Open their HQ</AdminButton></Link>
              {r.status === 'new' ? <AdminButton variant="outline" tone="ok" onClick={() => void setStatus(r, 'active')}>We’re running it</AdminButton> : null}
              <a className="inline-flex items-center text-xs font-semibold px-3 py-2 rounded-lg border" style={{ borderColor: T.line, color: T.ink }} href={`mailto:${r.contact}?subject=${encodeURIComponent(`Running ${r.marketTitle} on Market HQ`)}`}>Email them</a>
              <AdminButton variant="ghost" onClick={() => void setStatus(r, 'closed')}>Close</AdminButton>
            </div>
          </article>
        ))}
    </Panel>
  );
}
